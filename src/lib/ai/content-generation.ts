// ============================================
// Marketing Content Generation
// ============================================
// Generates ready-to-publish snippets from interview intelligence.
// Runs asynchronously after the main pipeline completes.

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { AI_CONFIG } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";

const ContentSnippetSchema = z.object({
  linkedin: z.object({
    content: z
      .string()
      .describe(
        "LinkedIn post (max 1300 chars). Professional thought leadership. Lead with the most surprising insight. End with 3-5 hashtags."
      ),
    tone: z.enum(["professional", "casual", "provocative"]),
  }),
  twitter: z.object({
    content: z
      .string()
      .describe(
        "Twitter/X thread (1-3 tweets, each ≤280 chars, separated by ---). Hook-driven, each tweet stands alone but builds a narrative."
      ),
    tone: z.enum(["professional", "casual", "provocative"]),
  }),
  newsletter: z.object({
    content: z
      .string()
      .describe(
        "Newsletter paragraph (150-300 words). Email-friendly, informative, ends with a teaser or CTA."
      ),
    tone: z.enum(["professional", "casual", "provocative"]),
  }),
  summary: z.object({
    content: z
      .string()
      .describe(
        "Executive briefing (2-3 paragraphs). Structure: Key Finding → Implications → Recommended Action."
      ),
    tone: z.enum(["professional", "casual", "provocative"]),
  }),
});

/**
 * Generate marketing content snippets from interview data.
 * Uses admin client for DB writes (bypasses RLS).
 * Designed to run after the main pipeline reaches COMPLETED.
 */
export async function generateContentSnippets({
  interviewId,
  tenantId,
  title,
  summary,
  topics,
  country,
  keyQuotes,
}: {
  interviewId: string;
  tenantId: string;
  title: string;
  summary: string;
  topics: string[];
  country?: string;
  keyQuotes: string[];
}): Promise<void> {
  const supabase = createAdminClient();

  const quotesBlock =
    keyQuotes.length > 0
      ? `\nKEY QUOTES:\n${keyQuotes.map((q, i) => `${i + 1}. "${q}"`).join("\n")}`
      : "";

  const { object } = await generateObject({
    model: openai(AI_CONFIG.extractionModel),
    schema: ContentSnippetSchema,
    prompt: `You are a content strategist for a frontier markets intelligence firm (Africa, Latin America, Asia). Generate ready-to-publish marketing content from this interview.

INTERVIEW: "${title}"
${country ? `COUNTRY/REGION: ${country}` : ""}
TOPICS: ${topics.join(", ")}

SUMMARY:
${summary}
${quotesBlock}

INSTRUCTIONS:
- LinkedIn: Professional thought leadership. Lead with the most surprising or valuable insight. Use 3-5 relevant hashtags.
- Twitter/X: Hook-driven. Each tweet should stand alone but build a narrative. Use --- to separate tweets.
- Newsletter: Informative and engaging. Write as if briefing a busy executive who subscribes to frontier market intelligence.
- Summary: Executive briefing format. Start with "Key Finding:", then "Implications:", then "Recommended Action:".
- All content must be grounded in the interview data — no fabrication.
- Make content compelling for an audience of investors, diplomats, and C-suite executives in emerging markets.`,
  });

  const platforms = ["linkedin", "twitter", "newsletter", "summary"] as const;
  const rows = platforms.map((platform) => ({
    interview_id: interviewId,
    tenant_id: tenantId,
    platform,
    content: object[platform].content,
    tone: object[platform].tone,
    status: "draft" as const,
  }));

  const { error } = await supabase.from("content_snippets").insert(rows);

  if (error) {
    console.error("Failed to insert content snippets:", error);
    throw error;
  }

  console.log(`Content snippets generated for interview ${interviewId}`);
}
