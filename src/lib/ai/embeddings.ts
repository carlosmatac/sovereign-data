// ============================================
// OpenAI Embeddings — text-embedding-3-small
// ============================================

import { AI_CONFIG } from "@/lib/constants";
import { withRetry } from "./retry";

interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

async function fetchEmbeddingBatch(texts: string[]): Promise<number[][]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_CONFIG.embeddingModel,
      input: texts,
      dimensions: AI_CONFIG.embeddingDimensions,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    const err = new Error(`OpenAI embeddings failed (${response.status}): ${body}`);
    (err as unknown as Record<string, unknown>).status = response.status;
    throw err;
  }

  const data = (await response.json()) as EmbeddingResponse;
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

const EMBEDDING_BATCH_SIZE = 100;

/**
 * Generate embeddings for one or more text chunks.
 * Splits into batches of 100 to stay well within OpenAI limits.
 * Each batch is independently retried on transient failure.
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (texts.length <= EMBEDDING_BATCH_SIZE) {
    return withRetry(
      () => fetchEmbeddingBatch(texts),
      `generateEmbeddings (${texts.length} texts)`
    );
  }

  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const batchNum = Math.floor(i / EMBEDDING_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(texts.length / EMBEDDING_BATCH_SIZE);

    const embeddings = await withRetry(
      () => fetchEmbeddingBatch(batch),
      `generateEmbeddings batch ${batchNum}/${totalBatches} (${batch.length} texts)`
    );

    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}
