"use server";

import type { User } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchPlatformRolesForUser,
  hasEntityGovernanceAccess,
} from "@/lib/auth/platform-roles";
import { normalizeEntityName } from "@/lib/entities/normalize";
import { isEntityType, type EntityType } from "@/types/database";

type ActionResult = { success?: true; error?: string };

async function requireEntityGovernanceCaller(): Promise<
  | { error: string; user: null; admin: null }
  | { error: null; user: User; admin: ReturnType<typeof createAdminClient> }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated", user: null, admin: null };
  }

  const roles = await fetchPlatformRolesForUser(supabase, user.id);
  if (!hasEntityGovernanceAccess(roles)) {
    return { error: "Forbidden", user: null, admin: null };
  }

  return { error: null, user, admin: createAdminClient() };
}

type CanonicalEntityRow = {
  id: string;
  name: string;
  type: EntityType;
  project_id: string | null;
  tenant_id: string | null;
  canonical_entity_id: string | null;
  normalized_name: string;
  description: string | null;
};

async function findCanonicalConflict(args: {
  admin: ReturnType<typeof createAdminClient>;
  normalizedName: string;
  type: EntityType;
  projectId: string | null;
  excludeEntityId: string;
}): Promise<boolean> {
  const { admin, normalizedName, type, projectId, excludeEntityId } = args;

  let q = admin
    .from("entities")
    .select("id")
    .eq("normalized_name", normalizedName)
    .eq("type", type)
    .is("canonical_entity_id", null)
    .neq("id", excludeEntityId);

  if (projectId === null) {
    q = q.is("project_id", null);
  } else {
    q = q.eq("project_id", projectId);
  }

  const { data } = await q.maybeSingle();
  return data != null;
}

function revalidateEntityPaths(entityId: string) {
  revalidatePath("/admin/entities");
  revalidatePath(`/admin/entities/${entityId}`);
}

/**
 * Updates allowed canonical fields. Does not merge into another entity (admin merge is out of scope).
 */
export async function updateGovernedEntity(
  entityId: string,
  input: {
    name?: string;
    description?: string | null;
    type?: EntityType;
  }
): Promise<ActionResult> {
  const gate = await requireEntityGovernanceCaller();
  if (gate.error || !gate.admin) {
    return { error: gate.error ?? "Forbidden" };
  }
  const { admin } = gate;

  const { data: row, error: loadError } = await admin
    .from("entities")
    .select(
      "id, name, type, project_id, tenant_id, canonical_entity_id, normalized_name, description"
    )
    .eq("id", entityId)
    .maybeSingle<CanonicalEntityRow>();

  if (loadError) {
    console.error("updateGovernedEntity load:", loadError);
    return { error: loadError.message };
  }
  if (!row) return { error: "Entity not found" };
  if (row.canonical_entity_id !== null) {
    return {
      error:
        "This row redirects to another canonical entity; open the canonical record to edit.",
    };
  }

  const updates: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) return { error: "Name cannot be empty" };
    if (trimmed !== row.name.trim()) {
      const normalized = normalizeEntityName(trimmed);
      if (!normalized) {
        return { error: "Name is invalid after normalization" };
      }
      const nextType = input.type ?? row.type;
      const conflict = await findCanonicalConflict({
        admin,
        normalizedName: normalized,
        type: nextType,
        projectId: row.project_id,
        excludeEntityId: entityId,
      });
      if (conflict) {
        return {
          error:
            "Another canonical entity in this scope already uses this normalized name and type.",
        };
      }
      updates.name = trimmed;
      updates.normalized_name = normalized;
    }
  }

  if (input.type !== undefined) {
    if (!isEntityType(input.type)) {
      return { error: "Invalid entity type" };
    }
    if (input.type !== row.type) {
      const effectiveNormalized =
        (updates.normalized_name as string | undefined) ?? row.normalized_name;
      const conflict = await findCanonicalConflict({
        admin,
        normalizedName: effectiveNormalized,
        type: input.type,
        projectId: row.project_id,
        excludeEntityId: entityId,
      });
      if (conflict) {
        return {
          error:
            "Another canonical entity in this scope already uses this normalized name and type.",
        };
      }
      updates.type = input.type;
    }
  }

  if (input.description !== undefined) {
    const nextDesc = input.description;
    const prevDesc = row.description ?? null;
    if (nextDesc !== prevDesc) {
      updates.description = nextDesc;
    }
  }

  if (Object.keys(updates).length === 0) {
    return { success: true };
  }

  const oldName = row.name.trim();
  const newName =
    typeof updates.name === "string" ? updates.name.trim() : oldName;
  const shouldLearnAlias =
    typeof updates.name === "string" &&
    oldName.length > 0 &&
    oldName !== newName;

  const { error: updateError } = await admin
    .from("entities")
    .update(updates)
    .eq("id", entityId);

  if (updateError) {
    if (updateError.code === "23505") {
      return {
        error:
          "Update conflicts with another row (unique name/type or alias constraint).",
      };
    }
    console.error("updateGovernedEntity:", updateError);
    return { error: updateError.message };
  }

  if (shouldLearnAlias) {
    const aliasNormalized = normalizeEntityName(oldName);
    if (aliasNormalized) {
      const { error: aliasErr } = await admin.from("entity_aliases").insert({
        entity_id: entityId,
        alias: oldName,
        alias_normalized: aliasNormalized,
        source: "admin_governance",
        confidence: 1,
        project_id: row.project_id,
        tenant_id: row.tenant_id,
      });
      if (aliasErr && aliasErr.code !== "23505") {
        console.error("updateGovernedEntity alias:", aliasErr);
      }
    }
  }

  revalidateEntityPaths(entityId);
  return { success: true };
}

export async function addGovernedEntityAlias(
  entityId: string,
  aliasRaw: string
): Promise<ActionResult> {
  const gate = await requireEntityGovernanceCaller();
  if (gate.error || !gate.admin) {
    return { error: gate.error ?? "Forbidden" };
  }
  const { admin } = gate;

  const { data: row, error: loadError } = await admin
    .from("entities")
    .select("id, project_id, tenant_id, canonical_entity_id")
    .eq("id", entityId)
    .maybeSingle<{
      id: string;
      project_id: string | null;
      tenant_id: string | null;
      canonical_entity_id: string | null;
    }>();

  if (loadError) {
    console.error("addGovernedEntityAlias load:", loadError);
    return { error: loadError.message };
  }
  if (!row) return { error: "Entity not found" };
  if (row.canonical_entity_id !== null) {
    return { error: "Cannot add aliases to a redirect entity." };
  }

  const alias = aliasRaw.trim();
  if (!alias) return { error: "Alias cannot be empty" };
  const aliasNormalized = normalizeEntityName(alias);
  if (!aliasNormalized) {
    return { error: "Alias is invalid after normalization" };
  }

  const { error } = await admin.from("entity_aliases").insert({
    entity_id: entityId,
    alias,
    alias_normalized: aliasNormalized,
    source: "admin_governance",
    confidence: 1,
    project_id: row.project_id,
    tenant_id: row.tenant_id,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "This alias already exists for this entity and scope." };
    }
    console.error("addGovernedEntityAlias:", error);
    return { error: error.message };
  }

  revalidateEntityPaths(entityId);
  return { success: true };
}

export async function removeGovernedEntityAlias(
  entityId: string,
  aliasId: string
): Promise<ActionResult> {
  const gate = await requireEntityGovernanceCaller();
  if (gate.error || !gate.admin) {
    return { error: gate.error ?? "Forbidden" };
  }
  const { admin } = gate;

  const { data: aliasRow, error: loadError } = await admin
    .from("entity_aliases")
    .select("id, entity_id")
    .eq("id", aliasId)
    .maybeSingle<{ id: string; entity_id: string }>();

  if (loadError) {
    console.error("removeGovernedEntityAlias load:", loadError);
    return { error: loadError.message };
  }
  if (!aliasRow || aliasRow.entity_id !== entityId) {
    return { error: "Alias not found for this entity" };
  }

  const { error } = await admin.from("entity_aliases").delete().eq("id", aliasId);

  if (error) {
    console.error("removeGovernedEntityAlias:", error);
    return { error: error.message };
  }

  revalidateEntityPaths(entityId);
  return { success: true };
}
