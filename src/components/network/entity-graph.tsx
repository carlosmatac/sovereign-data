"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ZoomIn, ZoomOut, Maximize2, X } from "lucide-react";
import type { GraphData, GraphNode, GraphEdge } from "@/app/api/graph/[projectId]/route";

// ── Types ────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
}

interface EntityGraphProps {
  projects: Project[];
  initialProjectId?: string;
}

// ── Entity palette ───────────────────────────────────────────────

const ENTITY_TYPES = [
  "PERSON",
  "COMPANY",
  "GOVERNMENT",
  "ORGANIZATION",
  "LOCATION",
  "EVENT",
] as const;

type EntityType = (typeof ENTITY_TYPES)[number];

const NODE_COLORS: Record<EntityType, string> = {
  PERSON: "#60a5fa",
  COMPANY: "#34d399",
  GOVERNMENT: "#a78bfa",
  ORGANIZATION: "#fb923c",
  LOCATION: "#f87171",
  EVENT: "#fbbf24",
};

function nodeColor(type: string): string {
  return NODE_COLORS[type as EntityType] ?? "#94a3b8";
}

// ── Resolve edge source/target to string ID ──────────────────────

function resolveId(x: unknown): string {
  if (typeof x === "string") return x;
  if (x && typeof x === "object" && "id" in x)
    return String((x as Record<string, unknown>).id);
  return String(x);
}

// ── Cytoscape stylesheet ─────────────────────────────────────────

// ── Node sizing helper ─────────────────────────────────────────
//
// Nodes are intentionally small to match the landing's "precision
// graph" look. Min 8 / max 18px diameter, scaled by the square
// root of mention count so outliers do not dominate.
//
// This is a second tightening pass on top of the initial 10–22 range:
// on dense projects the 22px outliers still read as heavy "balls" on
// a graph with 60+ nodes, while the landing reference graph keeps every
// node in a single-digit / low-teens diameter. 8–18 preserves the same
// visual hierarchy between "mentioned once" and "mentioned many times"
// without letting any node dominate the canvas.
function nodeSize(mentionCount: number | null | undefined): number {
  const m = Math.max(0, mentionCount ?? 0)
  return Math.max(8, Math.min(8 + Math.sqrt(m + 1) * 2.0, 18))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STYLESHEET: any[] = [
  {
    selector: "node",
    style: {
      "background-color": "data(color)",
      width: "data(size)",
      height: "data(size)",
      "border-width": 0,
      label: "",
      "overlay-opacity": 0,
      "z-index": 10,
      "transition-property": "opacity, border-width, border-opacity",
      "transition-duration": 180,
    },
  },
  // Permanent label for top-N prominent nodes.
  //
  // Label sizing is deliberately *smaller* than the surrounding node so
  // the node stays the dominant visual element. The landing reference
  // graph uses ~7.5–9px node labels at arbitrarily small scales; we
  // stay in that range and keep the label pill tight (1px padding, no
  // background fill) so labels never visually swallow the node.
  {
    selector: "node.show-label",
    style: {
      label: "data(displayName)",
      "font-size": 7.5,
      "font-family": "Inter, system-ui, sans-serif",
      "font-weight": 500,
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 4,
      color: "rgba(255,255,255,0.52)",
      "text-background-opacity": 0,
      "text-max-width": "120px",
      "text-wrap": "ellipsis",
    },
  },
  // Focused (selected) node — thin 1px white hairline ring on the node
  // itself; the soft concentric rings are painted as a separate SVG
  // overlay (see applyConcentricRings / <ConcentricRings />). Keeping
  // the node itself tight avoids the "big ball" look.
  {
    selector: "node.focused",
    style: {
      label: "data(displayName)",
      "font-size": 9.5,
      "font-weight": 600,
      color: "rgba(255,255,255,0.92)",
      "text-background-opacity": 0,
      "text-margin-y": 6,
      "border-width": 1,
      "border-color": "#ffffff",
      "border-opacity": 0.75,
      "z-index": 9999,
    },
  },
  // Direct neighbours of focused node
  {
    selector: "node.neighbor",
    style: {
      label: "data(displayName)",
      "font-size": 8.5,
      "font-weight": 500,
      color: "rgba(255,255,255,0.72)",
      "text-background-opacity": 0,
      "text-margin-y": 5,
      "border-width": 1,
      "border-color": "data(color)",
      "border-opacity": 0.7,
      "z-index": 500,
    },
  },
  // Unrelated nodes fade out
  {
    selector: "node.dimmed",
    style: { opacity: 0.09 },
  },
  // ── Edges ──────────────────────────────────────────────────────
  //
  // Design rule: edge *width stays constant* across all states. The
  // only thing that changes on highlight is the **brightness** — the
  // line brightens when it's part of a selected connection, and fades
  // when it's unrelated. Thickening on highlight reads as noisy and
  // gamey; a pure brightness change reads as analytical, which matches
  // the landing reference graph.
  {
    selector: "edge",
    style: {
      width: 0.8,
      "line-color": "#94a3b8",
      opacity: 0.18,
      "curve-style": "straight",
      "overlay-opacity": 0,
      "transition-property": "opacity, line-color",
      "transition-duration": 180,
    },
  },
  // Highlighted edge (connects focused → neighbor) — same width,
  // brighter neutral white instead of a thicker indigo line.
  {
    selector: "edge.neighbor",
    style: {
      width: 0.8,
      "line-color": "rgba(255,255,255,0.85)",
      opacity: 0.85,
    },
  },
  // Unrelated edge fades out — again, only opacity changes.
  {
    selector: "edge.dimmed",
    style: {
      width: 0.8,
      opacity: 0.03,
    },
  },
]

// ── Highlight helper (called imperatively against the cy instance) ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyHighlight(cy: any, nodeId: string | null) {
  cy.batch(() => {
    cy.elements().removeClass("focused neighbor dimmed");
    if (!nodeId) return;

    const node = cy.getElementById(nodeId);
    if (!node.length) return;

    node.addClass("focused");

    const connectedEdges = node.connectedEdges();
    connectedEdges.addClass("neighbor");
    connectedEdges.connectedNodes().not(node).addClass("neighbor");

    cy.elements().not(".focused").not(".neighbor").addClass("dimmed");
  });
}

// ── Layout options ───────────────────────────────────────────────
//
// Tuned for the landing's "spread, composed, breathable" graph feel:
//   - nodeRepulsion pushes much harder so nodes don't clump.
//   - idealEdgeLength gives edges room so labels don't overlap.
//   - gravity is lowered so disconnected components don't pile into
//     the centre; combined with a large componentSpacing they spread
//     across the canvas.
//   - padding is intentionally large; combined with the post-layout
//     fit-and-back-off below, the graph reads as *less zoomed-in* by
//     default, giving the user an overview rather than a close-up.
const LAYOUT_OPTIONS = {
  name: "cose",
  animate: true,
  animationEasing: "ease-out" as const,
  animationDuration: 850,
  fit: true,
  padding: 160,
  randomize: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodeRepulsion: (_node: any) => 60000,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  idealEdgeLength: (_edge: any) => 320,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  edgeElasticity: (_edge: any) => 55,
  nestingFactor: 1.5,
  gravity: 0.08,
  numIter: 2200,
  initialTemp: 320,
  coolingFactor: 0.95,
  minTemp: 1.0,
  componentSpacing: 360,
};

// ── Main component ───────────────────────────────────────────────

export function EntityGraph({ projects, initialProjectId }: EntityGraphProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(
    initialProjectId ?? projects[0]?.id ?? ""
  );
  const [rawData, setRawData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  // Filters — Locations hidden by default
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(
    () => new Set<string>(["LOCATION"])
  );
  const [hideIsolated, setHideIsolated] = useState(true);

  // Cytoscape refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cyRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cyReady, setCyReady] = useState(false);

  // Concentric-ring overlay (tracks focused node through zoom / pan). We
  // render pure SVG in a layer above the Cytoscape canvas, pulling the
  // rendered position + zoom of the focused node on every `render` tick.
  const [ringState, setRingState] = useState<{
    x: number;
    y: number;
    radius: number;
    color: string;
  } | null>(null);

  // ── Init Cytoscape (once) ──────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    void import("cytoscape").then(({ default: Cytoscape }) => {
      if (destroyed || !containerRef.current) return;

      const cy = Cytoscape({
        container: containerRef.current,
        elements: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        style: STYLESHEET as any,
        userZoomingEnabled: true,
        userPanningEnabled: true,
        minZoom: 0.05,
        maxZoom: 8,
        wheelSensitivity: 0.3,
        boxSelectionEnabled: false,
        autounselectify: true,
      });

      cyRef.current = cy;

      // Node tap → focus / toggle off
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cy.on("tap", "node", (evt: any) => {
        const nodeId = evt.target.id() as string;
        setFocusedNodeId((prev) => (prev === nodeId ? null : nodeId));
      });

      // Background tap → clear selection
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cy.on("tap", (evt: any) => {
        if (evt.target === cy) setFocusedNodeId(null);
      });

      setCyReady(true);
    });

    return () => {
      destroyed = true;
      cyRef.current?.destroy();
      cyRef.current = null;
      setCyReady(false);
    };
  }, []);

  // ── Apply highlight whenever focusedNodeId changes ─────────
  useEffect(() => {
    if (!cyRef.current || !cyReady) return;
    applyHighlight(cyRef.current, focusedNodeId);
  }, [focusedNodeId, cyReady]);

  // ── Keep concentric-rings overlay glued to the focused node ─
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady) return;

    if (!focusedNodeId) {
      setRingState(null);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update = () => {
      const node = cy.getElementById(focusedNodeId);
      if (!node.length) {
        setRingState(null);
        return;
      }
      const pos = node.renderedPosition() as { x: number; y: number };
      const zoom = cy.zoom() as number;
      const rawSize = (node.data("size") as number) ?? nodeSize(0);
      // renderedSize = modelSize * zoom; we want a radius for the rings.
      const radius = (rawSize * zoom) / 2;
      const color = (node.data("color") as string) ?? "#94a3b8";
      setRingState({ x: pos.x, y: pos.y, radius, color });
    };

    update();
    cy.on("render", update);
    cy.on("pan zoom position", update);

    return () => {
      cy.off("render", update);
      cy.off("pan zoom position", update);
    };
  }, [focusedNodeId, cyReady]);

  // ── Fetch graph data ───────────────────────────────────────
  const fetchGraph = useCallback(async (projectId: string) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    setFocusedNodeId(null);
    setRawData(null);
    try {
      const res = await fetch(`/api/graph/${projectId}`);
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data: GraphData = await res.json();
      setRawData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId) void fetchGraph(selectedProjectId);
  }, [selectedProjectId, fetchGraph]);

  // ── Filtered data (applies type + isolated filters) ────────
  const filteredData = useMemo((): {
    nodes: GraphNode[];
    edges: GraphEdge[];
  } | null => {
    if (!rawData) return null;

    // ── Step 1: filter by entity type only ──────────────────
    const typeVisibleNodes = rawData.nodes.filter(
      (n) => !hiddenTypes.has(n.type)
    );
    const typeVisibleSet = new Set(typeVisibleNodes.map((n) => n.id));

    // ── Step 2: count connections WITHIN the type-visible set ─
    // IMPORTANT: edges to hidden-type nodes must NOT be counted.
    // Without this, a node whose only connections are to hidden
    // nodes (e.g. PERSON only connected to LOCATIONs) would
    // appear to have connections and pass the hideIsolated filter,
    // landing in the graph as an invisible orphan dot.
    const connCounts: Record<string, number> = {};
    for (const e of rawData.edges) {
      const s = resolveId(e.source);
      const t = resolveId(e.target);
      if (typeVisibleSet.has(s) && typeVisibleSet.has(t)) {
        connCounts[s] = (connCounts[s] ?? 0) + 1;
        connCounts[t] = (connCounts[t] ?? 0) + 1;
      }
    }

    // ── Step 3: apply hideIsolated against within-set counts ──
    const nodes = typeVisibleNodes.filter(
      (n) => !hideIsolated || (connCounts[n.id] ?? 0) > 0
    );

    const nodeSet = new Set(nodes.map((n) => n.id));
    const edges = rawData.edges.filter(
      (e) =>
        nodeSet.has(resolveId(e.source)) && nodeSet.has(resolveId(e.target))
    );

    return { nodes, edges };
  }, [rawData, hiddenTypes, hideIsolated]);

  // ── Load elements into Cytoscape when filteredData changes ──
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady || !filteredData) return;

    // Top-12 nodes by mention count get permanent labels
    const sorted = [...filteredData.nodes].sort(
      (a, b) => b.mentionCount - a.mentionCount
    );
    const topIds = new Set(sorted.slice(0, 12).map((n) => n.id));

    cy.batch(() => {
      cy.elements().remove();

      cy.add([
        ...filteredData.nodes.map((n) => ({
          group: "nodes" as const,
          data: {
            id: n.id,
            name: n.name,
            // Truncate long names for labels
            displayName:
              n.name.length > 22 ? `${n.name.slice(0, 20)}…` : n.name,
            type: n.type,
            color: nodeColor(n.type),
            // Intentionally small (10–22px). The earlier 20–46 range made
            // nodes read as heavy "balls" on anything above medium-density
            // projects. See nodeSize() for the scaling rationale.
            size: nodeSize(n.mentionCount),
            mentionCount: n.mentionCount,
            description: n.description,
          },
          classes: topIds.has(n.id) ? "show-label" : "",
        })),
        ...filteredData.edges.map((e) => ({
          group: "edges" as const,
          data: {
            id: e.id,
            source: resolveId(e.source),
            target: resolveId(e.target),
            relationType: e.relationType,
            confidence: e.confidence,
          },
        })),
      ]);
    });

    // Run force layout; when animation finishes, fit and then pull the
    // zoom back significantly so the user opens on an *overview*, not a
    // close-up. 0.52× is roughly two full "zoom out" button clicks
    // (each click is zoom × 0.72, so 0.72² ≈ 0.52) on top of an already
    // padded fit — matching the landing graph's scale.
    const layout = cy.layout(LAYOUT_OPTIONS);
    layout.on("layoutstop", () => {
      cy.fit(undefined, 180);
      const center = { x: cy.width() / 2, y: cy.height() / 2 };
      cy.zoom({ level: cy.zoom() * 0.52, renderedPosition: center });
    });
    layout.run();

    // Reset selection
    setFocusedNodeId(null);
  }, [filteredData, cyReady]);

  // ── Info panel data (from rawData, not filtered) ───────────
  const focusedNode = focusedNodeId
    ? rawData?.nodes.find((n) => n.id === focusedNodeId)
    : null;

  const focusedEdges = useMemo(() => {
    if (!focusedNodeId || !rawData) return [];
    return rawData.edges.filter((e) => {
      const s = resolveId(e.source);
      const t = resolveId(e.target);
      return s === focusedNodeId || t === focusedNodeId;
    });
  }, [focusedNodeId, rawData]);

  const nodeIndex = useMemo(
    () =>
      rawData
        ? Object.fromEntries(rawData.nodes.map((n) => [n.id, n]))
        : {},
    [rawData]
  );

  // ── Zoom controls ──────────────────────────────────────────
  const zoomIn = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({ level: cy.zoom() * 1.4, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }, []);

  const zoomOut = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({ level: cy.zoom() * 0.72, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }, []);

  const zoomFit = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.fit(undefined, 180);
    const center = { x: cy.width() / 2, y: cy.height() / 2 };
    cy.zoom({ level: cy.zoom() * 0.52, renderedPosition: center });
  }, []);

  // ── Filter toggles ─────────────────────────────────────────
  const toggleType = useCallback((type: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
    setFocusedNodeId(null);
  }, []);

  // True when the project has data but all of it is filtered out
  const filtersHidEverything =
    !loading &&
    !error &&
    rawData !== null &&
    rawData.nodes.length > 0 &&
    (filteredData?.nodes.length ?? 0) === 0;

  const isEmpty =
    !loading && !error && (filteredData?.nodes.length ?? 0) === 0;

  const resetFilters = useCallback(() => {
    setHiddenTypes(new Set<string>());
    setHideIsolated(false);
    setFocusedNodeId(null);
  }, []);

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      {/* ── Top controls bar ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Project</span>
          <Select
            value={selectedProjectId}
            onValueChange={(v) => {
              setSelectedProjectId(v);
              setFocusedNodeId(null);
            }}
          >
            <SelectTrigger className="h-8 w-52 text-sm">
              <SelectValue placeholder="Select project…" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => void fetchGraph(selectedProjectId)}
            disabled={loading}
            aria-label="Reload"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>

        {rawData && !loading && (
          <p className="text-xs text-muted-foreground">
            {filteredData?.nodes.length ?? 0} entities ·{" "}
            {filteredData?.edges.length ?? 0} relationships
            {filteredData && filteredData.nodes.length < rawData.nodes.length && (
              <span className="ml-1 opacity-50">
                ({rawData.nodes.length} total, {rawData.nodes.length - filteredData.nodes.length} filtered)
              </span>
            )}
          </p>
        )}
      </div>

      {/* ── Filter row ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-xs text-muted-foreground">Show:</span>
        {ENTITY_TYPES.map((type) => {
          const active = !hiddenTypes.has(type);
          return (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`
                inline-flex cursor-pointer select-none items-center gap-1.5
                rounded-full border px-2.5 py-0.5 text-xs font-medium
                transition-all
                ${
                  active
                    ? "border-transparent text-white"
                    : "border-border bg-transparent text-muted-foreground opacity-40 hover:opacity-70"
                }
              `}
              style={active ? { background: nodeColor(type) } : undefined}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
              {type.charAt(0) + type.slice(1).toLowerCase()}
            </button>
          );
        })}

        <span className="mx-1 select-none text-muted-foreground/25">|</span>

        <button
          onClick={() => {
            setHideIsolated((v) => !v);
            setFocusedNodeId(null);
          }}
          className={`
            inline-flex cursor-pointer select-none items-center gap-1.5
            rounded-full border px-2.5 py-0.5 text-xs font-medium
            transition-all
            ${
              hideIsolated
                ? "border-border bg-muted text-foreground"
                : "border-border bg-transparent text-muted-foreground opacity-40 hover:opacity-70"
            }
          `}
        >
          Hide isolated
        </button>
      </div>

      {/* ── Graph canvas ──────────────────────────────────────── */}
      {/*
        IMPORTANT: containerRef is on THIS div, not on a child.
        Cytoscape.js forcibly sets position:relative on its mount element,
        which would break an inner div using absolute inset-0 (collapses to 0px).
        Using the outer div directly avoids that — it already has position:relative
        and an explicit height, so Cytoscape's override is a safe no-op.

        Surface treatment:
          - `#040A18` is *deeper* than the documented `--sv-canvas-bg`
            (#050C1A) — we want "almost black" for the data canvas so
            node colors and edges pop with high contrast, per the user's
            brief. It stays navy-biased (not pure #000) to match the
            panel system's tonal discipline.
          - The `backgroundImage` radial-gradient paints a subtle 20px
            dot-field at ~0.06 opacity, matching `docs/ui-panel-system.md`
            §10.3 (0.055–0.075). It's a fixed atmospheric texture — it
            does NOT move with zoom/pan, which is the desired "editor
            canvas" feel. Cytoscape's own canvas paints on top with a
            transparent background, so the dots remain visible beneath
            nodes and edges without being obscured.
      */}
      <div
        ref={containerRef}
        className="relative h-[640px] overflow-hidden rounded-[6px] border"
        style={{
          borderColor: "rgba(147,147,147,0.16)",
          backgroundColor: "#040A18",
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.06) 0.9px, transparent 1.1px)",
          backgroundSize: "20px 20px",
          backgroundPosition: "0 0",
        }}
      >
        {/* ── Concentric fading rings for selected node ─────── */}
        {/*
          Cytoscape itself can only paint ONE halo per node. To get the
          landing's refined "two concentric rings fading outward" feel we
          paint a dedicated SVG overlay on top of the Cytoscape canvas
          and sync its position to the focused node via cy 'render'
          events (see effect above). `pointer-events: none` so clicks
          still reach the graph underneath.
        */}
        {ringState && (
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          >
            <circle
              cx={ringState.x}
              cy={ringState.y}
              r={ringState.radius + 5}
              fill="none"
              stroke={ringState.color}
              strokeWidth={1}
              strokeOpacity={0.45}
            />
            <circle
              cx={ringState.x}
              cy={ringState.y}
              r={ringState.radius + 11}
              fill="none"
              stroke={ringState.color}
              strokeWidth={1}
              strokeOpacity={0.18}
            />
          </svg>
        )}

        {/* Loading overlay */}
        {loading && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center"
            style={{ background: "rgba(4,10,24,0.85)" }}
          >
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            {filtersHidEverything ? (
              <>
                <p className="text-sm">All entities are hidden by the current filters.</p>
                <button
                  onClick={resetFilters}
                  className="rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                >
                  Reset filters
                </button>
              </>
            ) : (
              <>
                <p className="text-sm">No entities found for this project.</p>
                <p className="text-xs text-muted-foreground">
                  Process interviews to populate the graph.
                </p>
              </>
            )}
          </div>
        )}

        {/* ── Zoom controls (top-right) ──────────────────────── */}
        {!isEmpty && !error && (
          <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
            {(
              [
                { icon: ZoomIn, fn: zoomIn, label: "Zoom in" },
                { icon: ZoomOut, fn: zoomOut, label: "Zoom out" },
                { icon: Maximize2, fn: zoomFit, label: "Fit to view" },
              ] as const
            ).map(({ icon: Icon, fn, label }) => (
              <Button
                key={label}
                variant="secondary"
                size="icon"
                className="h-7 w-7 border border-border bg-card/90 text-foreground hover:bg-card"
                onClick={fn}
                aria-label={label}
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            ))}
          </div>
        )}

        {/* ── Legend (bottom-left, hidden when info card is open) ── */}
        {!isEmpty && !error && !focusedNode && (
          <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1 rounded-lg border border-border bg-card/95 px-3 py-2 backdrop-blur-sm">
            {ENTITY_TYPES.filter((t) => !hiddenTypes.has(t)).map((type) => (
              <div
                key={type}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
              >
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: nodeColor(type) }}
                />
                <span>{type.charAt(0) + type.slice(1).toLowerCase()}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Floating info card (bottom-left, when node focused) ── */}
        {focusedNode && (
          <div className="absolute bottom-4 left-4 z-20 w-[280px] rounded-xl border border-border bg-card/98 shadow-xl backdrop-blur-md">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 border-b border-border px-4 pb-3 pt-4">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: nodeColor(focusedNode.type) }}
                  />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {focusedNode.type.toLowerCase()}
                  </span>
                </div>
                <h3 className="text-sm font-semibold leading-snug text-foreground">
                  {focusedNode.name}
                </h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {focusedNode.mentionCount} mention
                  {focusedNode.mentionCount !== 1 ? "s" : ""} ·{" "}
                  {focusedEdges.length} connection
                  {focusedEdges.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setFocusedNodeId(null)}
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Description */}
            {focusedNode.description && (
              <p className="border-b border-border px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                {focusedNode.description.length > 180
                  ? `${focusedNode.description.slice(0, 178)}…`
                  : focusedNode.description}
              </p>
            )}

            {/* Connections list */}
            {focusedEdges.length > 0 ? (
              <div className="max-h-52 overflow-y-auto px-3 py-2">
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Connections ({focusedEdges.length})
                </p>
                <div className="space-y-0.5">
                  {focusedEdges.map((edge) => {
                    const s = resolveId(edge.source);
                    const t = resolveId(edge.target);
                    const otherId = s === focusedNodeId ? t : s;
                    const other = nodeIndex[otherId];
                    const dir = s === focusedNodeId ? "→" : "←";

                    return (
                      <button
                        key={edge.id}
                        className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
                        onClick={() => setFocusedNodeId(otherId)}
                      >
                        <span
                          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: nodeColor(other?.type ?? "") }}
                        />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground group-hover:text-foreground">
                          {dir} {other?.name ?? otherId}
                        </span>
                        <Badge
                          variant="outline"
                          className="shrink-0 border-border bg-transparent px-1.5 py-0 text-[9px] text-muted-foreground"
                        >
                          {edge.relationType.replace(/_/g, " ").toLowerCase()}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="px-4 py-3 text-[11px] text-muted-foreground">
                No connections in this project.
              </p>
            )}
          </div>
        )}

        {/* ── Hint text ──────────────────────────────────────── */}
        {!isEmpty && !error && !focusedNode && !loading && (
          <p className="absolute bottom-3 right-14 z-10 select-none text-[11px] text-muted-foreground">
            Click a node to explore · Scroll to zoom · Drag to pan
          </p>
        )}

      </div>
    </div>
  );
}
