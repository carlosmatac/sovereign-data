/**
 * Entity context generator — produces a rich description and validated
 * metadata for an entity row, grounded in the entity's source chunks.
 *
 * Called from:
 * - The ingestion pipeline after entity resolution (enrichNewEntityContexts).
 * - The offline backfill script (scripts/entities/refresh-entity-context.ts).
 */

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, EntityType } from "@/types/database";
import { AI_CONFIG } from "@/lib/constants";
import { withRetry } from "@/lib/ai/retry";
import {
  EntityContextGenerationSchema,
  type EntityMetadataV1,
} from "./metadata-schema";

// ── Description trimming ────────────────────────────────────────────────────

/**
 * Trim text to at most maxLen characters without cutting mid-word or
 * mid-sentence. Prefers the last ". " break, falls back to last " ".
 */
export function trimToSentenceBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const sub = text.slice(0, maxLen);
  const lastPeriod = sub.lastIndexOf(". ");
  if (lastPeriod > maxLen / 2) return text.slice(0, lastPeriod + 1);
  const lastSpace = sub.lastIndexOf(" ");
  if (lastSpace > maxLen / 3) return text.slice(0, lastSpace);
  return sub;
}

// ── Main generator ──────────────────────────────────────────────────────────

/**
 * Generate or refresh the description and entity_metadata_v1 for one entity.
 *
 * Behaviour:
 * - Fetches the top CHUNK_SAMPLE chunks that mention the entity.
 * - If fewer than MIN_CHUNKS are found AND fallbackContextText is provided,
 *   uses that text (e.g. source_entities.context) as grounding instead of
 *   skipping. Upload anchors typically have no entity_mentions but always
 *   have a source_entities.context — this path handles them.
 * - If fewer than MIN_CHUNKS AND no fallback → skip (logs reason).
 * - Calls gpt-4o-mini via generateObject to extract description + metadata.
 * - Trims description to DESCRIPTION_MAX_CHARS at a sentence boundary.
 * - Only writes to the DB if the new description is >= DESCRIPTION_MIN_CHARS.
 * - Always overwrites metadata when the write condition passes.
 */
export async function generateEntityContext(params: {
  supabase: SupabaseClient<Database>;
  entityId: string;
  entityName: string;
  entityType: EntityType;
  projectId: string | null;
  /** Optional grounding text used when entity_mentions chunks are sparse.
   *  Typically the source_entities.context generated earlier in the pipeline. */
  fallbackContextText?: string;
}): Promise<void> {
  const { supabase, entityId, entityName, entityType, projectId, fallbackContextText } = params;

  const CHUNK_SAMPLE = 8;
  const MIN_CHUNKS = 2;
  const DESCRIPTION_MIN_CHARS = 120;
  const DESCRIPTION_MAX_CHARS = 600;

  // Fetch top chunks mentioning this entity (via entity_mentions → chunk join)
  const { data: mentionRows, error: mentionErr } = await supabase
    .from("entity_mentions")
    .select("chunk_id, source_chunks!inner(content, source_id)")
    .eq("entity_id", entityId)
    .not("chunk_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(CHUNK_SAMPLE);

  if (mentionErr) {
    console.error(`[generate-entity-context] mention fetch error for ${entityId}:`, mentionErr);
    return;
  }

  const chunkRows = (mentionRows ?? [])
    .map((row) => {
      const chunks = row.source_chunks as
        | { content: string; source_id: string }
        | Array<{ content: string; source_id: string }>
        | null;
      if (!chunks) return null;
      const chunk = Array.isArray(chunks) ? chunks[0] : chunks;
      return chunk ?? null;
    })
    .filter((c): c is { content: string; source_id: string } => c !== null);

  const hasFallback = !!fallbackContextText?.trim();

  if (chunkRows.length < MIN_CHUNKS) {
    if (!hasFallback) {
      console.log(
        `[generate-entity-context] skip "${entityName}" — ${chunkRows.length} chunk(s) found (min ${MIN_CHUNKS}), no fallback context`
      );
      return;
    }
    console.log(
      `[generate-entity-context] "${entityName}" — ${chunkRows.length} chunk(s), using source context as fallback`
    );
  }

  const usingFallback = chunkRows.length < MIN_CHUNKS;
  const sourceCount = usingFallback ? 1 : new Set(chunkRows.map((c) => c.source_id)).size;
  const chunkCount = usingFallback ? 0 : chunkRows.length;

  const contextSection = usingFallback
    ? `SOURCE CONTEXT (entity is a primary participant — no direct transcript excerpts available):\n${fallbackContextText}`
    : `SOURCE EXCERPTS (${chunkCount} chunks from ${sourceCount} source(s)):\n${chunkRows
        .map((c, i) => `[${i + 1}] ${c.content.trim()}`)
        .join("\n\n")}`;

  const { object } = await withRetry(
    () =>
      generateObject({
        model: openai(AI_CONFIG.extractionModel),
        schema: EntityContextGenerationSchema,
        prompt: `You are an expert intelligence analyst for Aksum, a knowledge platform for frontier markets.

TASK: Write a structured description and metadata for the following entity, based ONLY on the context from Aksum's internal interview sources provided below. Do not use general knowledge beyond what is grounded here.

Entity name: "${entityName}"
Entity type: ${entityType}
${projectId ? `Project scope: ${projectId}` : "Global entity"}

${contextSection}

INSTRUCTIONS:
- description: natural language, 200–600 characters, dense and concise. Explain who/what "${entityName}" is and why it matters in these sources. Do not pad with filler. Do not end mid-sentence.
- summary_tags: 2–8 lowercase keyword tags (e.g. "energy", "regulation", "west-africa"). Do not repeat the entity type.
- countries: full English country names grounded in the context (e.g. "Nigeria"). Empty array if none.
- sectors: economic/thematic sectors grounded in the context (e.g. "energy", "telecoms"). Empty array if none.
- confidence: "high" if entity is a primary subject across 3+ chunks with rich context; "medium" if mentioned materially in 1–2 sources; "low" if only briefly referenced or based on limited context.`,
      }),
    "generateEntityContext"
  );

  const rawDescription = object.description ?? "";
  const trimmedDescription = trimToSentenceBoundary(rawDescription, DESCRIPTION_MAX_CHARS);

  if (trimmedDescription.length < DESCRIPTION_MIN_CHARS) {
    console.log(
      `[generate-entity-context] skip write for "${entityName}" — description too short (${trimmedDescription.length} chars)`
    );
    return;
  }

  const metadata: EntityMetadataV1 = {
    schema_version: "entity_metadata_v1",
    summary_tags: object.summary_tags,
    countries: object.countries,
    sectors: object.sectors,
    confidence: object.confidence,
    generated_from: {
      source_count: sourceCount,
      chunk_count: chunkCount,
      generated_at: new Date().toISOString(),
      model: AI_CONFIG.extractionModel,
    },
  };

  const { error: updateErr } = await supabase
    .from("entities")
    .update({
      description: trimmedDescription,
      metadata: metadata as unknown as Record<string, unknown>,
    })
    .eq("id", entityId);

  if (updateErr) {
    console.error(`[generate-entity-context] update failed for "${entityName}" (${entityId}):`, updateErr);
    return;
  }

  console.log(
    `[generate-entity-context] enriched "${entityName}" (${entityType}) — ` +
      `desc=${trimmedDescription.length}chars sources=${sourceCount} chunks=${chunkCount} conf=${metadata.confidence}`
  );
}

// ── Pipeline helper ─────────────────────────────────────────────────────────

/**
 * Called from the ingestion pipeline after entity resolution.
 * Generates context for all candidate entities that don't yet have
 * entity_metadata_v1 or have thin descriptions. Runs concurrently.
 * Errors are swallowed per-entity so one failure doesn't block the rest.
 *
 * @param entityIds  All entity IDs relevant to this source run: resolved
 *                   entities + upload anchors + additional participants.
 * @param contextHints  Map<entityId, contextText> of pre-fetched
 *                   source_entities.context strings used as fallback when
 *                   an entity has insufficient entity_mentions chunks
 *                   (typical for upload anchors).
 */
export async function enrichNewEntityContexts(
  supabase: SupabaseClient<Database>,
  entityIds: string[],
  projectId: string,
  contextHints?: Map<string, string>
): Promise<void> {
  if (entityIds.length === 0) return;

  const { data: entities, error } = await supabase
    .from("entities")
    .select("id, name, type, description, metadata")
    .in("id", entityIds)
    .is("canonical_entity_id", null);

  if (error || !entities) {
    console.error("[generate-entity-context] failed to fetch entities for enrichment:", error);
    return;
  }

  const needsEnrichment = entities.filter((e) => {
    const meta = e.metadata as Record<string, unknown> | null;
    const hasV1 = meta?.schema_version === "entity_metadata_v1";
    const hasThinDesc = !e.description || e.description.length < 150;
    return !hasV1 || hasThinDesc;
  });

  const skipped = entities.length - needsEnrichment.length;
  if (skipped > 0) {
    console.log(
      `[generate-entity-context] ${skipped} entity(ies) already have v1 metadata + rich description — skipped`
    );
  }

  if (needsEnrichment.length === 0) return;

  console.log(
    `[generate-entity-context] enriching ${needsEnrichment.length}/${entities.length} entity(ies) for project ${projectId}`
  );

  await Promise.allSettled(
    needsEnrichment.map((e) =>
      generateEntityContext({
        supabase,
        entityId: e.id,
        entityName: e.name,
        entityType: e.type as EntityType,
        projectId,
        fallbackContextText: contextHints?.get(e.id),
      }).catch((err) =>
        console.error(`[generate-entity-context] entity "${e.name}" failed:`, err)
      )
    )
  );
}
