import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { REPORT_TEMPLATES } from "@/lib/constants";
import type { ReportTemplate } from "@/types/database";

interface ReportInput {
  reportId: string;
  template: ReportTemplate;
  title: string;
  customFocus?: string;
  interviews: Array<{
    id: string;
    title: string;
    summary: string | null;
    topics: string[] | null;
    country: string | null;
    sentiment: { overall?: string; score?: number } | null;
  }>;
  entities: Array<{
    name: string;
    type: string;
    mentionCount: number;
  }>;
  relationships: Array<{
    source: string;
    target: string;
    relation_type: string;
    evidence_text: string | null;
  }>;
}

function buildReportPrompt(input: ReportInput): string {
  const templateConfig =
    REPORT_TEMPLATES[input.template as keyof typeof REPORT_TEMPLATES];
  const sections = templateConfig.sections;

  const interviewContext = input.interviews
    .map(
      (i, idx) =>
        `### Interview ${idx + 1}: "${i.title}"
Country: ${i.country ?? "N/A"}
Topics: ${i.topics?.join(", ") ?? "N/A"}
Sentiment: ${i.sentiment?.overall ?? "N/A"} (score: ${i.sentiment?.score ?? "N/A"})
Summary: ${i.summary ?? "No summary available"}`
    )
    .join("\n\n");

  const entityContext =
    input.entities.length > 0
      ? `\n## KEY ENTITIES (by mention frequency)\n${input.entities
          .slice(0, 30)
          .map((e) => `- ${e.name} (${e.type}) — ${e.mentionCount} mentions`)
          .join("\n")}`
      : "";

  const relationshipContext =
    input.relationships.length > 0
      ? `\n## KEY RELATIONSHIPS\n${input.relationships
          .slice(0, 20)
          .map(
            (r) =>
              `- ${r.source} → ${r.target} (${r.relation_type})${r.evidence_text ? `: "${r.evidence_text}"` : ""}`
          )
          .join("\n")}`
      : "";

  const sectionInstructions =
    sections.length > 0
      ? `\nSTRUCTURE: Generate the report with these sections as ## headings:\n${sections.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      : "";

  const customInstructions = input.customFocus
    ? `\nCUSTOM FOCUS: ${input.customFocus}`
    : "";

  return `You are Sovereign Data AI, a senior intelligence analyst at a frontier markets consultancy (Africa, Latin America, Asia). Generate an investor-grade business intelligence report.

REPORT: "${input.title}"
TEMPLATE: ${templateConfig.label}
${sectionInstructions}
${customInstructions}

## SOURCE INTELLIGENCE (from ${input.interviews.length} interview${input.interviews.length > 1 ? "s" : ""})

${interviewContext}
${entityContext}
${relationshipContext}

## INSTRUCTIONS
- Write in the voice of a senior analyst briefing C-suite executives, investors, or diplomats.
- Every claim must be grounded in the interview data provided. Cite specific interviews by title when making assertions.
- Use Markdown formatting: ## for sections, ### for subsections, **bold** for emphasis, bullet lists for key points.
- Include a "Sources" section at the end listing every interview referenced.
- Be analytical, not just descriptive. Provide actionable insights, risk assessments, and forward-looking analysis.
- Highlight contradictions between sources when they exist.
- Length: 1500–3000 words depending on data density. Prefer quality over padding.`;
}

/**
 * Generate a BI report using GPT-4o (not mini — higher reasoning for reports).
 * Streams the response and saves the final content to the database.
 */
export async function generateReport(input: ReportInput) {
  const admin = createAdminClient();
  const prompt = buildReportPrompt(input);

  const result = streamText({
    model: openai("gpt-4o"),
    prompt,
    maxOutputTokens: 8000,
    async onFinish({ text }) {
      try {
        const summaryMatch = text.match(
          /^#*\s*(?:Executive\s+Summary|Key\s+Findings?)\s*\n+([\s\S]*?)(?=\n##|\n\*\*|$)/im
        );
        const summary = summaryMatch
          ? summaryMatch[1].trim().slice(0, 500)
          : text.slice(0, 500);

        await admin
          .from("reports")
          .update({
            content: text,
            summary,
            status: "completed",
          })
          .eq("id", input.reportId);
      } catch (err) {
        console.error("Report save failed:", err);
        await admin
          .from("reports")
          .update({
            status: "failed",
            error_message:
              err instanceof Error ? err.message : "Failed to save report",
          })
          .eq("id", input.reportId);
      }
    },
    async onError({ error }) {
      console.error("Report generation failed:", error);
      await admin
        .from("reports")
        .update({
          status: "failed",
          error_message:
            error instanceof Error ? error.message : "Generation failed",
        })
        .eq("id", input.reportId);
    },
  });

  return result;
}
