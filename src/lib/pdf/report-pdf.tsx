import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { ReportTemplate } from "@/types/database";
import { REPORT_TEMPLATES } from "@/lib/constants";

const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.6,
    color: "#1a1a1a",
  },
  header: {
    marginBottom: 30,
    borderBottomWidth: 2,
    borderBottomColor: "#2563eb",
    paddingBottom: 15,
  },
  title: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 11,
    color: "#6b7280",
    marginBottom: 3,
  },
  metaRow: {
    flexDirection: "row",
    gap: 20,
    marginTop: 8,
  },
  metaItem: {
    fontSize: 9,
    color: "#9ca3af",
  },
  sourcesBox: {
    backgroundColor: "#f9fafb",
    padding: 12,
    borderRadius: 4,
    marginBottom: 20,
  },
  sourcesTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#6b7280",
    marginBottom: 4,
  },
  sourceItem: {
    fontSize: 8,
    color: "#6b7280",
    marginBottom: 2,
  },
  h2: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginTop: 20,
    marginBottom: 8,
  },
  h3: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
    marginTop: 14,
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 10,
    marginBottom: 8,
    textAlign: "justify" as const,
  },
  bold: {
    fontFamily: "Helvetica-Bold",
  },
  listItem: {
    flexDirection: "row",
    marginBottom: 4,
    paddingLeft: 8,
  },
  bullet: {
    width: 12,
    fontSize: 10,
  },
  listText: {
    flex: 1,
    fontSize: 10,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 50,
    right: 50,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
  },
  footerText: {
    fontSize: 8,
    color: "#9ca3af",
  },
});

interface ReportPDFProps {
  title: string;
  projectName: string;
  country?: string;
  template: ReportTemplate;
  content: string;
  createdAt: string;
  sourceInterviews: string[];
}

/**
 * Parse Markdown content into simple block elements for PDF rendering.
 * Handles: ## headings, ### subheadings, **bold**, - bullet lists, paragraphs.
 */
function parseMarkdownBlocks(
  content: string
): Array<{ type: "h2" | "h3" | "paragraph" | "list-item"; text: string }> {
  const lines = content.split("\n");
  const blocks: Array<{
    type: "h2" | "h3" | "paragraph" | "list-item";
    text: string;
  }> = [];

  let currentParagraph = "";

  const flushParagraph = () => {
    if (currentParagraph.trim()) {
      blocks.push({ type: "paragraph", text: currentParagraph.trim() });
      currentParagraph = "";
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("## ")) {
      flushParagraph();
      blocks.push({ type: "h2", text: trimmed.replace(/^##\s+/, "") });
    } else if (trimmed.startsWith("### ")) {
      flushParagraph();
      blocks.push({ type: "h3", text: trimmed.replace(/^###\s+/, "") });
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      flushParagraph();
      blocks.push({
        type: "list-item",
        text: trimmed.replace(/^[-*]\s+/, ""),
      });
    } else if (trimmed === "") {
      flushParagraph();
    } else {
      currentParagraph += (currentParagraph ? " " : "") + trimmed;
    }
  }
  flushParagraph();

  return blocks;
}

function stripMarkdownFormatting(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
}

export function ReportPDF({
  title,
  projectName,
  country,
  template,
  content,
  createdAt,
  sourceInterviews,
}: ReportPDFProps) {
  const templateConfig =
    REPORT_TEMPLATES[template as keyof typeof REPORT_TEMPLATES];
  const blocks = parseMarkdownBlocks(content);
  const date = new Date(createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            {templateConfig?.label ?? template} — {projectName}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaItem}>{date}</Text>
            {country && <Text style={styles.metaItem}>{country}</Text>}
            <Text style={styles.metaItem}>
              {sourceInterviews.length} source interview
              {sourceInterviews.length !== 1 ? "s" : ""}
            </Text>
            <Text style={styles.metaItem}>Sovereign Data Intelligence Platform</Text>
          </View>
        </View>

        {/* Source Interviews */}
        {sourceInterviews.length > 0 && (
          <View style={styles.sourcesBox}>
            <Text style={styles.sourcesTitle}>SOURCE INTERVIEWS</Text>
            {sourceInterviews.map((name, i) => (
              <Text key={i} style={styles.sourceItem}>
                {i + 1}. {name}
              </Text>
            ))}
          </View>
        )}

        {/* Content */}
        {blocks.map((block, i) => {
          switch (block.type) {
            case "h2":
              return (
                <Text key={i} style={styles.h2}>
                  {stripMarkdownFormatting(block.text)}
                </Text>
              );
            case "h3":
              return (
                <Text key={i} style={styles.h3}>
                  {stripMarkdownFormatting(block.text)}
                </Text>
              );
            case "list-item":
              return (
                <View key={i} style={styles.listItem}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={styles.listText}>
                    {stripMarkdownFormatting(block.text)}
                  </Text>
                </View>
              );
            case "paragraph":
              return (
                <Text key={i} style={styles.paragraph}>
                  {stripMarkdownFormatting(block.text)}
                </Text>
              );
          }
        })}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            CONFIDENTIAL — Sovereign Data Intelligence Platform
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
