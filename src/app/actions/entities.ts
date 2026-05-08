"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEntityName } from "@/lib/entities/normalize";
import type { EntityType, RelationType } from "@/types/database";

type ActionResult = {
  success?: true;
  merged?: boolean;
  error?: string;
};

type EntityRecord = {
  id: string;
  name: string;
  type: EntityType;
  project_id: string | null;
  canonical_entity_id: string | null;
  normalized_name: string;
};

type MentionRecord = {
  tenant_id: string;
  interview_id: string;
  chunk_id: string | null;
  context: string | null;
  sentiment: string | null;
};

type RelationshipRecord = {
  tenant_id: string;
  relation_type: RelationType;
  confidence: number;
  evidence_text: string | null;
  interview_id: string;
  source_entity_id: string;
  target_entity_id: string;
};

async function requireProjectEditor(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || membership.role === "viewer") {
    throw new Error("Insufficient permissions");
  }

  return { admin };
}

async function findExistingCanonicalByNormalized(args: {
  admin: ReturnType<typeof createAdminClient>;
  normalizedName: string;
  type: EntityType;
  projectId: string;
  excludeEntityId: string;
}): Promise<EntityRecord | null> {
  const { admin, normalizedName, type, projectId, excludeEntityId } = args;

  const { data: projectMatch } = await admin
    .from("entities")
    .select("id, name, type, project_id, canonical_entity_id, normalized_name")
    .eq("normalized_name", normalizedName)
    .eq("type", type)
    .eq("project_id", projectId)
    .is("canonical_entity_id", null)
    .neq("id", excludeEntityId)
    .maybeSingle<EntityRecord>();

  if (projectMatch) return projectMatch;

  const { data: globalMatch } = await admin
    .from("entities")
    .select("id, name, type, project_id, canonical_entity_id, normalized_name")
    .eq("normalized_name", normalizedName)
    .eq("type", type)
    .is("project_id", null)
    .is("canonical_entity_id", null)
    .neq("id", excludeEntityId)
    .maybeSingle<EntityRecord>();

  return globalMatch ?? null;
}

async function insertAliasFromCorrection(args: {
  admin: ReturnType<typeof createAdminClient>;
  entityId: string;
  aliasRaw: string;
  projectId: string;
  tenantId: string;
}) {
  const { admin, entityId, aliasRaw, projectId, tenantId } = args;
  const alias = aliasRaw.trim();
  const aliasNormalized = normalizeEntityName(alias);

  if (!alias || !aliasNormalized) return;

  const { error } = await admin.from("entity_aliases").insert({
    entity_id: entityId,
    alias,
    alias_normalized: aliasNormalized,
    source: "user_correction",
    confidence: 1,
    project_id: projectId,
    tenant_id: tenantId,
  });

  // Unique violation means this correction is already learned.
  if (error && error.code !== "23505") {
    throw error;
  }
}

async function remapMentions(args: {
  admin: ReturnType<typeof createAdminClient>;
  sourceEntityId: string;
  targetEntityId: string;
}) {
  const { admin, sourceEntityId, targetEntityId } = args;

  const { data: mentions, error: mentionsError } = await admin
    .from("entity_mentions")
    .select("tenant_id, interview_id, chunk_id, context, sentiment")
    .eq("entity_id", sourceEntityId);

  if (mentionsError) throw mentionsError;

  const rows = (mentions ?? []) as MentionRecord[];
  for (const row of rows) {
    const { error: upsertError } = await admin.from("entity_mentions").upsert(
      {
        tenant_id: row.tenant_id,
        entity_id: targetEntityId,
        interview_id: row.interview_id,
        chunk_id: row.chunk_id,
        context: row.context,
        sentiment: row.sentiment,
      },
      { onConflict: "entity_id,interview_id,chunk_id" }
    );

    if (upsertError) throw upsertError;
  }

  const { error: deleteError } = await admin
    .from("entity_mentions")
    .delete()
    .eq("entity_id", sourceEntityId);

  if (deleteError) throw deleteError;
}

async function remapRelationships(args: {
  admin: ReturnType<typeof createAdminClient>;
  sourceEntityId: string;
  targetEntityId: string;
}) {
  const { admin, sourceEntityId, targetEntityId } = args;

  const { data: relationships, error: relFetchError } = await admin
    .from("entity_relationships")
    .select(
      "tenant_id, source_entity_id, target_entity_id, relation_type, confidence, evidence_text, interview_id"
    )
    .or(`source_entity_id.eq.${sourceEntityId},target_entity_id.eq.${sourceEntityId}`);

  if (relFetchError) throw relFetchError;

  const rows = (relationships ?? []) as RelationshipRecord[];
  for (const rel of rows) {
    const newSourceId =
      rel.source_entity_id === sourceEntityId
        ? targetEntityId
        : rel.source_entity_id;
    const newTargetId =
      rel.target_entity_id === sourceEntityId
        ? targetEntityId
        : rel.target_entity_id;

    const { error: upsertError } = await admin
      .from("entity_relationships")
      .upsert(
        {
          tenant_id: rel.tenant_id,
          source_entity_id: newSourceId,
          target_entity_id: newTargetId,
          relation_type: rel.relation_type,
          confidence: rel.confidence,
          evidence_text: rel.evidence_text,
          interview_id: rel.interview_id,
        },
        {
          onConflict: "source_entity_id,target_entity_id,relation_type,interview_id",
        }
      );

    if (upsertError) throw upsertError;
  }

  const { error: deleteError } = await admin
    .from("entity_relationships")
    .delete()
    .or(`source_entity_id.eq.${sourceEntityId},target_entity_id.eq.${sourceEntityId}`);

  if (deleteError) throw deleteError;
}

export async function updateEntityName(
  entityId: string,
  newNameRaw: string,
  projectId: string
): Promise<ActionResult> {
  try {
    const { admin } = await requireProjectEditor(projectId);

    const trimmedName = newNameRaw.trim();
    if (!trimmedName) {
      return { error: "Entity name cannot be empty" };
    }

    const { data: existingEntity, error: existingError } = await admin
      .from("entities")
      .select("id, name, type, project_id, canonical_entity_id, normalized_name")
      .eq("id", entityId)
      .maybeSingle<EntityRecord>();

    if (existingError) {
      console.error("Failed to load entity:", existingError);
      return { error: existingError.message };
    }

    if (!existingEntity) return { error: "Entity not found" };

    // Resolve project's tenant_id once — every alias we mint below carries it.
    const { data: projectRow } = await admin
      .from("projects")
      .select("tenant_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!projectRow?.tenant_id) {
      return { error: "Project not found" };
    }
    const projectTenantId = projectRow.tenant_id as string;

    const oldName = existingEntity.name.trim();
    if (oldName === trimmedName) {
      return { success: true, merged: false };
    }

    const normalizedNewName = normalizeEntityName(trimmedName);
    if (!normalizedNewName) {
      return { error: "Entity name is invalid after normalization" };
    }

    const targetEntity = await findExistingCanonicalByNormalized({
      admin,
      normalizedName: normalizedNewName,
      type: existingEntity.type,
      projectId,
      excludeEntityId: entityId,
    });

    // Scenario A: rename (no canonical target exists)
    if (!targetEntity) {
      const { error: renameError } = await admin
        .from("entities")
        .update({
          name: trimmedName,
          normalized_name: normalizedNewName,
        })
        .eq("id", entityId);

      if (renameError) {
        console.error("Failed to rename entity:", renameError);
        return { error: renameError.message };
      }

      await insertAliasFromCorrection({
        admin,
        entityId,
        aliasRaw: oldName,
        projectId,
        tenantId: projectTenantId,
      });

      revalidatePath("/interviews");
      revalidatePath("/network");
      revalidatePath(`/projects/${projectId}`);
      return { success: true, merged: false };
    }

    // Scenario B: merge into existing canonical target
    const targetEntityId = targetEntity.id;

    await remapMentions({
      admin,
      sourceEntityId: entityId,
      targetEntityId,
    });

    await remapRelationships({
      admin,
      sourceEntityId: entityId,
      targetEntityId,
    });

    const { error: redirectError } = await admin
      .from("entities")
      .update({
        canonical_entity_id: targetEntityId,
      })
      .eq("id", entityId);

    if (redirectError) {
      console.error("Failed to mark entity redirect:", redirectError);
      return { error: redirectError.message };
    }

    await insertAliasFromCorrection({
      admin,
      entityId: targetEntityId,
      aliasRaw: oldName,
      projectId,
      tenantId: projectTenantId,
    });

    revalidatePath("/interviews");
    revalidatePath("/network");
    revalidatePath(`/projects/${projectId}`);
    return { success: true, merged: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}
