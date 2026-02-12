// ============================================
// OpenAI Embeddings — text-embedding-3-small
// ============================================

import { AI_CONFIG } from "@/lib/constants";

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

/**
 * Generate embeddings for one or more text chunks.
 * Batches up to 2048 inputs per API call (OpenAI limit).
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) return [];

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
    const error = await response.text();
    throw new Error(`OpenAI embeddings failed: ${error}`);
  }

  const data = (await response.json()) as EmbeddingResponse;

  // Sort by index to maintain order
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
