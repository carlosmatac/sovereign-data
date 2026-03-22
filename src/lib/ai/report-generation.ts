import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReportTemplate } from "@/types/database";
import type {
  ReportEvidenceRecord,
  ReportInsightBlock,
  ReportIntelligenceLayer,
} from "@/lib/reports/intelligence-layer";

interface ReportInput {
  reportId: string;
  template: ReportTemplate;
  title: string;
  intelligenceLayer: ReportIntelligenceLayer;
}

function buildReportPrompt(input: ReportInput): string {
  const { intelligenceLayer } = input;
  const sectionInstructions =
    intelligenceLayer.template === "custom"
      ? `Use an executive-friendly structure tailored to the custom focus. Include sections that make the analysis easy to scan.`
      : `Use these exact ## section headings in this order:
${buildTemplateSections(intelligenceLayer.template)}`;

  const interviewContext = intelligenceLayer.interviews
    .map(
      (interview, index) =>
        [
          `Interview ${index + 1}: "${interview.title}"`,
          `- Interview ID: ${interview.id}`,
          `- Country: ${interview.country ?? "Unknown"}`,
          `- Topics: ${interview.topics.join(", ") || "None tagged"}`,
          `- Sentiment: ${interview.sentiment?.overall ?? "Unknown"} (${String(interview.sentiment?.score ?? "n/a")})`,
          `- Primary anchors: ${[interview.intervieweeName, interview.intervieweeOrg, interview.intervieweeTitle].filter(Boolean).join(" | ") || "None"}`,
          `- Stored summary: ${interview.summary ?? "No summary available."}`,
        ].join("\n")
    )
    .join("\n\n");

  const entityRegistry = intelligenceLayer.entities
    .slice(0, 20)
    .map(
      (entity) =>
        `- ${entity.canonicalName} (${entity.type}) | hygiene=${entity.hygieneConfidence} | mentions=${entity.mentionCount} | interviews=${entity.interviewIds.length} | aliases=${entity.aliases.filter((alias) => alias !== entity.canonicalName).join(", ") || "none"}${entity.hygieneNote ? ` | note=${entity.hygieneNote}` : ""}`
    )
    .join("\n");

  const insightBlocks = intelligenceLayer.insightBlocks
    .map((block, index) => formatInsightBlockForPrompt(index + 1, block, intelligenceLayer.evidence))
    .join("\n\n");

  const evidenceLedger = intelligenceLayer.evidence
    .map((item) => formatEvidenceForPrompt(item))
    .join("\n");

  const warnings =
    intelligenceLayer.reportingWarnings.length > 0
      ? intelligenceLayer.reportingWarnings.map((warning) => `- ${warning}`).join("\n")
      : "- None";

  return `You are Sovereign Data AI, acting as a principal intelligence analyst for a frontier markets advisory firm focused on Africa, Latin America, and Asia.

Write an executive-grade intelligence report that is traceable, evidence-backed, and action-oriented.

REPORT TITLE: "${input.title}"
TEMPLATE: ${intelligenceLayer.templateLabel}
${intelligenceLayer.customFocus ? `CUSTOM FOCUS: ${intelligenceLayer.customFocus}` : "CUSTOM FOCUS: none"}

FOUNDATION EXECUTIVE BRIEF:
- What we know: ${intelligenceLayer.executiveBrief.whatWeKnow}
- Why it matters: ${intelligenceLayer.executiveBrief.whyItMatters}
- What to do: ${intelligenceLayer.executiveBrief.whatToDo}
- Confidence: ${capitalize(intelligenceLayer.executiveBrief.confidence)}

SECTION PLAN:
${sectionInstructions}

INTERVIEW CONTEXT:
${interviewContext}

ENTITY HYGIENE REGISTRY:
${entityRegistry || "- No entities resolved."}

REUSABLE INSIGHT BLOCKS:
${insightBlocks || "- No reusable blocks available."}

REPORTING WARNINGS:
${warnings}

EVIDENCE LEDGER:
${evidenceLedger}

NON-NEGOTIABLE WRITING RULES:
- Use only the evidence ledger and reusable insight blocks as the basis for claims.
- Prefer canonical entity names from the entity hygiene registry. If hygiene is low, state that identity remains provisional instead of cleaning it up as fact.
- Keep the report executive-friendly. Every major subsection should answer: what do we know, why does it matter, what should the reader do or monitor, and how confident are we.
- Every substantive subsection must include support metadata in bullets using this shape:
  - What we know: ...
  - Why it matters: ...
  - What to do / monitor: ...
  - Confidence: High|Medium|Low
  - Support: <count> evidence item(s) | Interviews: ... | Entities: ...
  - Evidence:
    - [EV-x] Interview title | Speaker | timestamp | excerpt
- Surface contradictions explicitly when they exist. Do not smooth over disagreements.
- Do not invent companies, people, motivations, dates, or recommendations that are not grounded in the supplied material.
- Write in Markdown with ## section headings and ### subheadings. Bullets are preferred over long narrative passages when they improve clarity.
- End with a ## Source Trace section listing the evidence references actually used in the report.
- Length target: 1500-3000 words, depending on evidence density. Substance beats filler.`;
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

function buildTemplateSections(template: ReportTemplate): string {
  const sectionsByTemplate: Record<ReportTemplate, string[]> = {
    country_risk: [
      "Executive Summary",
      "Political Risk",
      "Economic Risk",
      "Operational Risk",
      "Key Actors & Relationships",
      "Outlook & Recommendations",
    ],
    sector_analysis: [
      "Executive Summary",
      "Market Overview",
      "Key Players",
      "Trends & Drivers",
      "Competitive Landscape",
      "Opportunities & Risks",
      "Strategic Recommendations",
    ],
    entity_profile: [
      "Profile Overview",
      "Key Relationships",
      "Sentiment Analysis",
      "Notable Quotes & Context",
      "Risk Flags",
      "Assessment",
    ],
    executive_briefing: [
      "Key Findings",
      "Strategic Implications",
      "Market Intelligence",
      "Relationship Map",
      "Recommended Actions",
    ],
    custom: [],
  };

  return sectionsByTemplate[template]
    .map((section, index) => `${index + 1}. ${section}`)
    .join("\n");
}

function formatInsightBlockForPrompt(
  index: number,
  block: ReportInsightBlock,
  evidence: ReportEvidenceRecord[]
): string {
  const evidenceMap = new Map(evidence.map((item) => [item.id, item]));
  const evidenceLines = block.supportingEvidenceIds
    .map((evidenceId) => evidenceMap.get(evidenceId))
    .filter((item): item is ReportEvidenceRecord => Boolean(item))
    .map((item) => `  - ${formatEvidenceForPrompt(item)}`)
    .join("\n");

  return [
    `Block ${index}: ${block.title} [${block.blockType}]`,
    `- What we know: ${block.whatWeKnow}`,
    `- Why it matters: ${block.whyItMatters}`,
    `- What to do / monitor: ${block.actionOrMonitor}`,
    `- Confidence: ${capitalize(block.confidence)}`,
    `- Support: ${block.support.evidenceCount} evidence item(s) | Interviews: ${block.support.interviewIds.join(", ") || "none"} | Entities: ${block.support.entityNames.join(", ") || "none"}`,
    block.flaggedUncertainty
      ? `- Uncertainty: ${block.flaggedUncertainty}`
      : "- Uncertainty: none",
    "- Evidence:",
    evidenceLines || "  - none",
  ].join("\n");
}

function formatEvidenceForPrompt(item: ReportEvidenceRecord): string {
  return `[${item.id}] ${item.interviewTitle} | ${item.speaker ?? "Unknown speaker"} | ${item.timestamp ?? "n/a"} | ${item.note} | "${item.excerpt}"`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
