/**
 * Source-entity context generator — produces a 1–2 sentence, source-scoped
 * description of why/how each entity relates to a specific source.
 *
 * Distinct from `entities.description` (entity-global) and from
 * `source_entities.evidence` (raw extraction quote).
 *
 * Called from the ingestion pipeline after all chunks, mentions, and
 * source_entities rows have been written.
 */

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { AI_CONFIG } from "@/lib/constants";
import { withRetry } from "@/lib/ai/retry";
import { trimToSentenceBoundary } from "./generate-entity-context";

// ── Generation schema ───────────────────────────────────────────────────────

/**
 * One context row per entity in the source.
 * All fields required — OpenAI structured outputs strict mode.
 */
const SourceEntityContextSchema = z.object({
  rows: z.array(
    z.object({
      entity_id: z
        .string()
        .describe("The entity_id UUID, copied exactly from the input"),
      context: z
        .string()
        .describe(
          "1–2 sentences (max ~400 chars) describing why and how this entity " +
            "relates to THIS source specifically. Source-scoped — not a general bio. " +
            "Do not end mid-word or mid-sentence."
        ),
    })
  ),
});

const CONTEXT_MAX_CHARS = 400;
const CHUNKS_PER_ENTITY = 3;

// ── Types ───────────────────────────────────────────────────────────────────

interface SourceEntityRow {
  id: string;
  entity_id: string;
  link_type: string;
  origin: string;
}

interface EntityInfo {
  name: string;
  type: string;
  description: string | null;
}

// ── Main function ────────────────────────────────────────────────────────────

/**
 * Generate and persist `context` for all `source_entities` rows belonging
 * to `sourceId`. Runs as a single batched LLM call covering all rows.
 *
 * `intervieweeTitle` is fetched from the DB (sources.interviewee_title) so
 * callers don't need to carry it through the pipeline interview object.
 *
 * Safe to call on reprocess: entities whose context is already populated
 * will be overwritten with the updated source context (consistent with
 * the pipeline's "latest extraction wins" principle for extraction rows).
 * Upload-anchor rows (interviewee / interviewee_org) are always overwritten
 * since their source context is derived from the current extraction summary.
 */
export async function generateSourceEntityContexts(params: {
  supabase: SupabaseClient<Database>;
  sourceId: string;
  sourceSummary: string;
  sourceTitle: string;
  intervieweeName: string | null;
  intervieweeOrg: string | null;
}): Promise<void> {
  const {
    supabase,
    sourceId,
    sourceSummary,
    sourceTitle,
    intervieweeName,
    intervieweeOrg,
  } = params;

  // Fetch interviewee_title from DB (not carried on the pipeline interview object)
  const { data: sourceMeta } = await supabase
    .from("sources")
    .select("interviewee_title")
    .eq("id", sourceId)
    .maybeSingle();
  const intervieweeTitle: string | null = sourceMeta?.interviewee_title ?? null;

  // ── 1. Fetch existing source_entities rows for this source ────────────────
  const { data: seRows, error: seErr } = await supabase
    .from("source_entities")
    .select("id, entity_id, link_type, origin")
    .eq("source_id", sourceId);

  if (seErr || !seRows || seRows.length === 0) {
    if (seErr) {
      console.error(`[source-entity-context] fetch source_entities failed for ${sourceId}:`, seErr);
    }
    return;
  }

  // ── 2. Fetch entity info (name, type, description) for each unique entity ─
  const entityIds = [...new Set(seRows.map((r) => r.entity_id))];

  const { data: entityRows, error: entityErr } = await supabase
    .from("entities")
    .select("id, name, type, description")
    .in("id", entityIds);

  if (entityErr) {
    console.error(`[source-entity-context] fetch entities failed:`, entityErr);
    return;
  }

  const entityMap = new Map<string, EntityInfo>();
  for (const e of entityRows ?? []) {
    entityMap.set(e.id, { name: e.name, type: e.type, description: e.description });
  }

  // ── 3. Fetch top-N chunks per entity for this source ─────────────────────
  const chunksByEntity = new Map<string, string[]>();

  for (const entityId of entityIds) {
    const { data: mentionRows } = await supabase
      .from("entity_mentions")
      .select("source_chunks!inner(content)")
      .eq("entity_id", entityId)
      .eq("interview_id", sourceId)
      .not("chunk_id", "is", null)
      .limit(CHUNKS_PER_ENTITY);

    const chunks = (mentionRows ?? [])
      .map((row) => {
        const c = row.source_chunks as { content: string } | Array<{ content: string }> | null;
        if (!c) return null;
        return Array.isArray(c) ? c[0]?.content : c.content;
      })
      .filter((c): c is string => typeof c === "string" && c.length > 0);

    chunksByEntity.set(entityId, chunks);
  }

  // ── 4. Build prompt input blocks ─────────────────────────────────────────
  const entityBlocks = seRows
    .map((row) => {
      const info = entityMap.get(row.entity_id);
      if (!info) return null;

      const chunks = chunksByEntity.get(row.entity_id) ?? [];
      const chunkText =
        chunks.length > 0
          ? `\n  Relevant excerpts from this source:\n${chunks.map((c, i) => `    [${i + 1}] ${c.slice(0, 300)}`).join("\n")}`
          : intervieweeTitle && row.link_type === "interviewee"
            ? `\n  No transcript excerpts (anchor entity). Known role: "${intervieweeTitle}".`
            : `\n  No transcript excerpts for this entity in this source.`;

      return (
        `- entity_id: ${row.entity_id}\n` +
        `  name: "${info.name}" (${info.type})\n` +
        `  link_type: ${row.link_type}  origin: ${row.origin}\n` +
        `  global description: ${info.description ? info.description.slice(0, 200) : "none"}` +
        chunkText
      );
    })
    .filter((b): b is string => b !== null);

  if (entityBlocks.length === 0) return;

  const anchorHint =
    intervieweeName || intervieweeOrg
      ? `Primary subject: ${intervieweeName ?? "unknown"} (${intervieweeOrg ?? "no org"})${intervieweeTitle ? `, role: "${intervieweeTitle}"` : ""}.`
      : "";

  // ── 5. LLM call ───────────────────────────────────────────────────────────
  const { object } = await withRetry(
    () =>
      generateObject({
        model: openai(AI_CONFIG.extractionModel),
        schema: SourceEntityContextSchema,
        prompt: `You are an expert intelligence analyst. Generate source-scoped context strings for entities appearing in the following source.

SOURCE
Title: "${sourceTitle}"
${anchorHint}
Summary: ${sourceSummary.slice(0, 600)}

TASK
For each entity below, write 1–2 sentences (max ~400 chars) explaining:
- Why/how this entity relates to THIS source specifically (not a general bio).
- For anchor entities (interviewee / interviewee_org): their role in this source and the topic they discussed.
- For extracted entities (author / primary_subject / subject_organization): what this source reveals about them.
- Keep it dense and source-specific. Do not end mid-sentence.

Return one row per entity_id listed below, with the entity_id copied exactly.

ENTITIES
${entityBlocks.join("\n\n")}`,
      }),
    "generateSourceEntityContexts"
  );

  // ── 6. Persist context for each row ─────────────────────────────────────
  for (const generated of object.rows) {
    const trimmed = trimToSentenceBoundary(generated.context ?? "", CONTEXT_MAX_CHARS);
    if (!trimmed || trimmed.length < 20) continue;

    // Update all source_entities rows for (source, entity) pair
    // (there may be multiple rows with different link_type/origin)
    const { error: updateErr } = await supabase
      .from("source_entities")
      .update({ context: trimmed })
      .eq("source_id", sourceId)
      .eq("entity_id", generated.entity_id);

    if (updateErr) {
      console.error(
        `[source-entity-context] update failed for entity ${generated.entity_id} in source ${sourceId}:`,
        updateErr
      );
    }
  }

  console.log(
    `[source-entity-context] wrote context for ${object.rows.length} entity/entities in source ${sourceId}`
  );
}
