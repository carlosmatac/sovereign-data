import { describe, expect, it } from "vitest";
import {
  formatSourceCoOccurrenceContext,
  groupCoOccurrencesBySource,
  type ContextualAssociation,
} from "@/lib/entities/contextual-associations";

function assoc(
  partial: Partial<ContextualAssociation> & Pick<ContextualAssociation, "entity" | "sourceId" | "sourceTitle">
): ContextualAssociation {
  return {
    conductedAt: null,
    linkTypes: ["participant"],
    ...partial,
  };
}

describe("contextual-associations formatting", () => {
  it("groups co-occurrences by source", () => {
    const grouped = groupCoOccurrencesBySource([
      assoc({
        sourceId: "s1",
        sourceTitle: "Minister Interview",
        entity: { id: "e1", name: "Acme Corp", type: "COMPANY", description: null, mentionCount: 0 },
        linkTypes: ["interviewee_org"],
      }),
      assoc({
        sourceId: "s1",
        sourceTitle: "Minister Interview",
        entity: { id: "e2", name: "Jane Doe", type: "PERSON", description: null, mentionCount: 0 },
        linkTypes: ["participant"],
      }),
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].sourceTitle).toBe("Minister Interview");
    expect(grouped[0].entities).toHaveLength(2);
  });

  it("formats Copilot co-occurrence block with label", () => {
    const text = formatSourceCoOccurrenceContext("John Smith", [
      assoc({
        sourceId: "s1",
        sourceTitle: "Energy Panel 2026",
        entity: { id: "e1", name: "NNPC", type: "COMPANY", description: null, mentionCount: 0 },
        linkTypes: ["interviewee_org"],
      }),
    ]);

    expect(text).toContain("SOURCE CO-OCCURRENCE CONTEXT");
    expect(text).toContain("John Smith");
    expect(text).toContain("Energy Panel 2026");
    expect(text).toContain("NNPC");
  });
});
