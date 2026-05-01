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
import { ENTITY_TYPE_VALUES, type EntityType } from "@/types/database";

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

const NODE_COLORS: Record<EntityType, string> = {
  PERSON: "#60a5fa",
  COMPANY: "#34d399",
  GOVERNMENT: "#a78bfa",
  ORGANIZATION: "#fb923c",
  LOCATION: "#f87171",
  EVENT: "#fbbf24",
  COUNTRY: "#38bdf8",
  SECTOR: "#22c55e",
  COMMODITY: "#f59e0b",
  PUBLIC_INSTITUTION: "#c084fc",
  STATE_OWNED_ENTERPRISE: "#2dd4bf",
  LAW_OR_POLICY: "#e879f9",
  MEDIA_OR_PUBLICATION: "#f472b6",
};

function nodeColor(type: string): string {
  return NODE_COLORS[type as EntityType] ?? "#94a3b8";
}

// ── Project anchor (Obsidian-style central node) ─────────────────
//
// The Network Explorer used to deal with disconnected entities by
// either flinging them into a far-away grid (Hide-isolated OFF) or
// hiding them entirely (Hide-isolated ON). Both behaviours produced
// poor compositions: scattered with one and crowded with the other.
//
// The new model introduces a synthetic central "anchor" node that
// represents the current project/country (e.g. "Nigeria 2026"). It
// participates in the cose layout as a locked element at the origin,
// and we attach lightweight *context edges* from the anchor to (a) any
// truly isolated entity and (b) a small cap of the most-mentioned
// entities. Real extracted relationships are untouched and still rule
// the visual hierarchy. Context edges are dashed, low-opacity, and
// excluded from every count and detail panel — they exist only to give
// the graph a stable Obsidian-like skeleton.
const ANCHOR_ID = "__anchor__";
const ANCHOR_TYPE = "__ANCHOR__";
// Neutral slate-white. Deliberately NOT one of the entity-type
// accents (PERSON blue, COMPANY green, COUNTRY sky, …) so the anchor
// reads as "this is the project itself, not an entity" — which matters
// in projects like "Angola" where the project name happens to match a
// real COUNTRY entity in the data and a same-coloured anchor would be
// visually indistinguishable from the entity.
const ANCHOR_COLOR = "#e2e8f0";
const ANCHOR_SIZE = 16;
// Cap on additional ("hub") anchor edges drawn to non-isolated entities.
// All isolated nodes get an anchor edge unconditionally; hubs are the
// optional top-K-by-mentions tether so dense graphs still have a clear
// spine. Capping at 4 keeps the anchor from becoming a star centre.
const MAX_ANCHOR_HUBS = 4;
const ANCHOR_EDGE_PREFIX = "__anchor_edge__:";

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
// graph" look. Min 6 / max 14px diameter (model units), scaled by the
// square root of mention count so outliers do not dominate.
//
// Combined with the post-fit zoom cap (see MAX_FIT_ZOOM below) this
// keeps rendered diameters in a 6–28px band even on sparse graphs
// where cy.fit() would otherwise push zoom > 4× and turn 14px nodes
// into ~60px "balls". Tighter range + zoom cap together = landing-style
// precision dots, not toy bubbles.
function nodeSize(mentionCount: number | null | undefined): number {
  const m = Math.max(0, mentionCount ?? 0)
  return Math.max(6, Math.min(6 + Math.sqrt(m + 1) * 1.6, 14))
}

// Post-fit zoom band. cy.fit() picks whatever zoom level encompasses
// the whole bounding box, which on the two extreme densities produces
// the wrong visual scale:
//   - SPARSE graphs (e.g. 6 connected entities) → fit zoom ≈ 4–6× →
//     6–14px nodes render as 24–80px "balls" and labels as 30–45px
//     — the toy-graph symptom.
//   - DENSE/SPREAD graphs (e.g. 20+ entities scattered on a wide
//     anchor orbit) → fit zoom ≈ 0.3–0.5× → nodes shrink to 2–5px
//     and labels become almost unreadable.
// Clamping to a 0.7×–1.6× window keeps rendered diameters in a
// readable 4–22px band on every density. Manual zoom still goes
// 0.05×–8× (see Cytoscape init), this is only the *initial fit*.
const MIN_FIT_ZOOM = 0.7;
const MAX_FIT_ZOOM = 1.6;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fitWithZoomCap(cy: any) {
  cy.fit(undefined, 60);
  const z = cy.zoom();
  if (z > MAX_FIT_ZOOM) cy.zoom(MAX_FIT_ZOOM);
  else if (z < MIN_FIT_ZOOM) cy.zoom(MIN_FIT_ZOOM);
  // Center the viewport on the project anchor when present so the
  // composition reads as "project at the centre, entities orbiting".
  // Falls back to the natural bbox centre if there is no anchor (empty
  // graphs render the empty-state overlay anyway).
  const anchor = cy.getElementById(ANCHOR_ID);
  if (anchor.length > 0) {
    cy.center(anchor);
  } else {
    cy.center();
  }
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
  // the node stays the dominant visual element. Combined with the
  // post-fit zoom cap, rendered text lands in a calm 6.5–10px band even
  // on the sparsest graphs.
  //
  // `min-zoomed-font-size` ensures labels never disappear when the user
  // pans/zooms out manually past the cap.
  {
    selector: "node.show-label",
    style: {
      label: "data(displayName)",
      "font-size": 6.5,
      "min-zoomed-font-size": 9,
      "font-family": "Inter, system-ui, sans-serif",
      "font-weight": 500,
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 5,
      color: "rgba(255,255,255,0.48)",
      "text-background-opacity": 0,
      "text-max-width": "110px",
      "text-wrap": "ellipsis",
    },
  },
  // Focused (selected) node — thin 1px white hairline ring on the node
  // itself; the soft concentric rings are painted as a separate SVG
  // overlay (see applyConcentricRings / <ConcentricRings />). Keeping
  // the node itself tight avoids the "big ball" look — emphasis comes
  // from the ring + label brightness, not from scaling the node.
  {
    selector: "node.focused",
    style: {
      label: "data(displayName)",
      "font-size": 8.5,
      "min-zoomed-font-size": 11,
      "font-weight": 600,
      color: "rgba(255,255,255,0.94)",
      "text-background-opacity": 0,
      "text-margin-y": 7,
      "border-width": 1,
      "border-color": "#ffffff",
      "border-opacity": 0.8,
      "z-index": 9999,
    },
  },
  // Direct neighbours of focused node
  {
    selector: "node.neighbor",
    style: {
      label: "data(displayName)",
      "font-size": 7.5,
      "min-zoomed-font-size": 10,
      "font-weight": 500,
      color: "rgba(255,255,255,0.74)",
      "text-background-opacity": 0,
      "text-margin-y": 6,
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
  // ── Project anchor node ────────────────────────────────────────
  //
  // Visually distinct from any entity type: solid sky-cyan core with
  // a subtle same-colour ring around it, and a permanent label one
  // step above regular show-label nodes. It sits at the visual centre
  // of the graph, labelled with the project/country name. 16px (vs
  // the 6–14px entity range) — clearly larger but not balloon-sized.
  // Emphasis comes from solidity + label weight + slight halo, never
  // raw diameter.
  {
    selector: "node.anchor",
    style: {
      "background-color": ANCHOR_COLOR,
      "background-opacity": 0.95,
      width: ANCHOR_SIZE,
      height: ANCHOR_SIZE,
      "border-width": 3,
      "border-color": ANCHOR_COLOR,
      "border-opacity": 0.18,
      label: "data(displayName)",
      "font-size": 9,
      "min-zoomed-font-size": 12,
      "font-family": "Inter, system-ui, sans-serif",
      "font-weight": 600,
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 9,
      color: "rgba(255,255,255,0.92)",
      "text-background-opacity": 0,
      "text-max-width": "140px",
      "text-wrap": "ellipsis",
      "z-index": 50,
    },
  },
  // Anchor explicitly should NOT inherit the .show-label / .focused
  // / .neighbor / .dimmed visual changes meant for entity nodes —
  // its presentation is owned by .anchor only. The applyHighlight
  // helper guarantees it never receives those classes.

  // ── Context (anchor) edges ─────────────────────────────────────
  //
  // Dashed, low-opacity, anchor-coloured. Read as "belongs to this
  // project context", not as an extracted relationship. The dash
  // pattern is the principal cue (real edges are solid) and is
  // preserved across all states (.neighbor, .dimmed) below.
  {
    selector: "edge.context",
    style: {
      width: 0.7,
      "line-color": ANCHOR_COLOR,
      "line-style": "dashed",
      "line-dash-pattern": [3, 4],
      opacity: 0.18,
      "curve-style": "straight",
    },
  },
  // Context edge becomes a touch brighter when the anchor or the
  // tethered entity is focused — but stays dashed and capped well
  // below the brightness of a real .neighbor edge so it never
  // visually upgrades into a "relationship".
  {
    selector: "edge.context.neighbor",
    style: {
      width: 0.7,
      "line-color": ANCHOR_COLOR,
      "line-style": "dashed",
      "line-dash-pattern": [3, 4],
      opacity: 0.55,
    },
  },
  // Context edge dimmed alongside other unrelated edges.
  {
    selector: "edge.context.dimmed",
    style: {
      width: 0.7,
      "line-color": ANCHOR_COLOR,
      "line-style": "dashed",
      "line-dash-pattern": [3, 4],
      opacity: 0.05,
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

    // Special case: when an entity (not the anchor) is focused, we
    // do NOT want the anchor itself to fade into the background just
    // because it isn't a direct relationship neighbour. The anchor's
    // job is to provide constant context; dimming it would make the
    // graph feel collapsed. Lift the .dimmed class off the anchor and
    // let the .anchor selector keep painting it at full presence. Its
    // own context edge to the focused node, if any, still received
    // .neighbor above so the visual link reads correctly.
    if (nodeId !== ANCHOR_ID) {
      cy.getElementById(ANCHOR_ID).removeClass("dimmed");
    }
  });
}

// ── Layout options ───────────────────────────────────────────────
//
// Tuned for the landing's "spread, composed, breathable" graph feel.
// Two problems the previous tuning created:
//
//   1. A post-fit `zoom * 0.52` multiplier was applied to make the
//      graph "less zoomed-in by default". Combined with the strong
//      repulsion below, that visually halved the gap between connected
//      nodes and made the cluster feel cramped. Removed below — the
//      view is now the natural `cy.fit()` with moderate padding, which
//      gives connected nodes their full intended breathing room.
//   2. `componentSpacing: 360` told cose to fling every disconnected
//      component (every isolated node is its own component) far away
//      from the rest. With Hide-Isolated OFF that meant the bounding
//      box exploded and the useful cluster shrank to a corner.
//
// ── Manual radial layout ────────────────────────────────────────
//
// We tried two cose variants (random start with locked anchor; radial
// pre-seed with `randomize: false`). Both produced the same failure
// mode: cose's repulsion + edge-length forces drift the satellites
// off the seeded circle within a few hundred iterations and the final
// composition reads as "scattered" rather than "orbiting an anchor".
//
// The fix is to drop cose entirely for the anchored model and compute
// every node position deterministically. The result is a perfect
// Obsidian-style radial composition every time, with zero drift, and
// it's also faster (no force simulation) — the entire layout is one
// pass of trigonometry.
//
// Composition rules:
//   - Anchor: at the origin (0, 0).
//   - Tethered nodes (isolated entities + hub entities, in that
//     deterministic order): evenly distributed on a circle of radius
//     `TETHER_RADIUS` around the anchor, starting at the 12-o'clock
//     position (-π/2) so the layout feels balanced.
//   - Non-tethered entities (connected to a hub via a real edge but
//     not directly to the anchor): grouped by their primary tethered
//     neighbour (the "hub") and arranged in a small arc just outside
//     that hub, away from the anchor. This produces the Obsidian-like
//     "tight relationship cluster hanging off a satellite" look.
//   - Any straggler with no positioned neighbours falls back to a
//     small inner ring so it never lands on top of the anchor.
const TETHER_RADIUS = 240;
const HUB_CLUSTER_OFFSET = 110;
const HUB_CLUSTER_ARC_PER_NODE = 0.18; // radians per cluster member
const HUB_CLUSTER_MAX_ARC = 1.0;
const FALLBACK_INNER_RADIUS = 110;

interface XY {
  x: number;
  y: number;
}

/**
 * Compute the manual radial position of every node and apply it via
 * Cytoscape's `preset` layout. The `preset` layout simply assigns the
 * positions we provide and animates the transition from the previous
 * positions — no force simulation, no drift, no surprises.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runLayout(cy: any) {
  const anchor = cy.getElementById(ANCHOR_ID);

  // Defensive: if the graph has no anchor (shouldn't happen in
  // practice — the anchor is always added when entities are present),
  // fall back to grid so at least nothing piles on (0, 0).
  if (anchor.length === 0) {
    cy.layout({
      name: "grid",
      animate: true,
      animationDuration: 500,
      fit: false,
    }).run();
    fitWithZoomCap(cy);
    return;
  }

  const positions: Record<string, XY> = {};
  positions[ANCHOR_ID] = { x: 0, y: 0 };

  // ── Step 1: place every tether on the orbit ────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tetherNodes = anchor.connectedEdges().connectedNodes().not(anchor);
  const tetherIds: string[] = tetherNodes.map((n: { id: () => string }) =>
    n.id()
  );
  const N = tetherIds.length;
  // Map each tether to its own angle so we can place hub clusters
  // along the same radial line later.
  const tetherAngle: Record<string, number> = {};
  if (N > 0) {
    tetherIds.forEach((id, i) => {
      const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
      tetherAngle[id] = angle;
      positions[id] = {
        x: Math.cos(angle) * TETHER_RADIUS,
        y: Math.sin(angle) * TETHER_RADIUS,
      };
    });
  }

  // ── Step 2: group non-tethered nodes by their primary hub ──
  const tetherIdSet = new Set(tetherIds);
  const nonTethered = cy.nodes().not(anchor).not(tetherNodes);
  const hubGroups: Record<string, string[]> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nonTethered.forEach((node: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const neighbours = node.openNeighborhood("node").filter((n: any) => {
      const id = n.id() as string;
      return id !== ANCHOR_ID && tetherIdSet.has(id);
    });
    if (neighbours.length > 0) {
      // Use the first tethered neighbour as the cluster hub. Multi-
      // hub nodes still pick a deterministic single hub, so they end
      // up in exactly one cluster — preferable to averaging, which
      // tends to dump nodes back near the anchor.
      const hubId = neighbours[0].id() as string;
      (hubGroups[hubId] ??= []).push(node.id() as string);
    }
  });

  // ── Step 3: place hub clusters in an arc just outside the hub
  Object.entries(hubGroups).forEach(([hubId, members]) => {
    const hubAngle = tetherAngle[hubId] ?? 0;
    const arc = Math.min(
      HUB_CLUSTER_MAX_ARC,
      HUB_CLUSTER_ARC_PER_NODE * Math.max(1, members.length - 1)
    );
    const r = TETHER_RADIUS + HUB_CLUSTER_OFFSET;
    members.forEach((memberId, i) => {
      const offset =
        members.length === 1
          ? 0
          : (i - (members.length - 1) / 2) *
            (arc / Math.max(1, members.length - 1));
      const angle = hubAngle + offset;
      positions[memberId] = {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
      };
    });
  });

  // ── Step 4: any non-tethered node not yet placed → inner ring
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unplaced = nonTethered.filter((n: any) => !(n.id() in positions));
  const unplacedList: string[] = unplaced.map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (n: any) => n.id() as string
  );
  if (unplacedList.length > 0) {
    unplacedList.forEach((id: string, i: number) => {
      const angle =
        (i / unplacedList.length) * 2 * Math.PI -
        Math.PI / 2 +
        Math.PI / Math.max(1, unplacedList.length);
      positions[id] = {
        x: Math.cos(angle) * FALLBACK_INNER_RADIUS,
        y: Math.sin(angle) * FALLBACK_INNER_RADIUS,
      };
    });
  }

  // ── Step 5: apply via preset layout (animated) + fit ───
  const layout = cy.layout({
    name: "preset",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    positions: (node: any) =>
      positions[node.id() as string] ?? { x: 0, y: 0 },
    animate: true,
    animationDuration: 500,
    animationEasing: "ease-out",
    fit: false,
  });
  layout.on("layoutstop", () => fitWithZoomCap(cy));
  layout.run();
}

// ── Main component ───────────────────────────────────────────────

export function EntityGraph({ projects, initialProjectId }: EntityGraphProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(
    initialProjectId ?? projects[0]?.id ?? ""
  );
  const [rawData, setRawData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  // Filters — Locations hidden by default. Note: there is no longer a
  // "Hide isolated" mode — isolated entities are tethered to the
  // project anchor with a context edge so they always have a stable
  // place in the layout.
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(
    () => new Set<string>(["LOCATION"])
  );

  // Display name of the currently selected project — used as the
  // anchor's permanent label.
  const selectedProjectName = useMemo(
    () =>
      projects.find((p) => p.id === selectedProjectId)?.name ?? "Project",
    [projects, selectedProjectId]
  );

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

  // ── Filtered data (entity-type filter only) ───────────────
  //
  // Returns the REAL entities + REAL relationships visible after the
  // type filter. The synthetic project anchor and its context edges
  // are added at the Cytoscape load step (see the effect below) and
  // are intentionally NOT part of `filteredData`, so every count and
  // connection panel keeps reporting real-only numbers.
  const filteredData = useMemo((): {
    nodes: GraphNode[];
    edges: GraphEdge[];
  } | null => {
    if (!rawData) return null;

    const typeVisibleNodes = rawData.nodes.filter(
      (n) => !hiddenTypes.has(n.type)
    );
    const nodeSet = new Set(typeVisibleNodes.map((n) => n.id));
    const edges = rawData.edges.filter(
      (e) =>
        nodeSet.has(resolveId(e.source)) && nodeSet.has(resolveId(e.target))
    );

    return { nodes: typeVisibleNodes, edges };
  }, [rawData, hiddenTypes]);

  // ── Load elements into Cytoscape when filteredData changes ──
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady || !filteredData) return;

    if (filteredData.nodes.length === 0) {
      // Empty graph (no entities or all types hidden) → clear cy and
      // let the empty-state overlay take over. Skip the anchor too;
      // an anchor floating alone on an otherwise empty canvas would
      // be more confusing than helpful.
      cy.elements().remove();
      setFocusedNodeId(null);
      return;
    }

    // ── Real-edge degree per visible entity ──────────────────
    //
    // Used to (a) detect isolated nodes and (b) pick the small set
    // of "hub" nodes that also get a context edge to the anchor.
    const realDegree: Record<string, number> = {};
    for (const e of filteredData.edges) {
      const s = resolveId(e.source);
      const t = resolveId(e.target);
      realDegree[s] = (realDegree[s] ?? 0) + 1;
      realDegree[t] = (realDegree[t] ?? 0) + 1;
    }

    // Permanent labels: a small top-N selection by mention count plus
    // ~40% of total visible nodes (capped at 8). The anchor is excluded
    // from this budget — it always shows its name via the .anchor style.
    const sorted = [...filteredData.nodes].sort(
      (a, b) => b.mentionCount - a.mentionCount
    );
    const labelCount = Math.min(
      8,
      Math.max(3, Math.ceil(filteredData.nodes.length * 0.4))
    );
    const topIds = new Set(sorted.slice(0, labelCount).map((n) => n.id));

    // ── Pick anchor "hub" tethers ────────────────────────────
    //
    // Rule:
    //   - every isolated node (real degree 0) gets a context edge,
    //     unconditionally, so it has a place in the layout.
    //   - additionally, up to MAX_ANCHOR_HUBS of the most-mentioned
    //     non-isolated nodes get a context edge. This gives the graph
    //     a clear spine even when most entities already have real
    //     relationships, without devolving into a star.
    const isolatedIds = new Set(
      filteredData.nodes
        .filter((n) => (realDegree[n.id] ?? 0) === 0)
        .map((n) => n.id)
    );
    const hubIds = new Set(
      sorted
        .filter((n) => (realDegree[n.id] ?? 0) > 0)
        .slice(0, MAX_ANCHOR_HUBS)
        .map((n) => n.id)
    );
    const anchorTetherIds = new Set<string>([...isolatedIds, ...hubIds]);

    // Truncate the anchor's label too so very long project names
    // (e.g. "Some Long Country 2026 Edition") do not stretch across
    // the central area.
    const anchorDisplay =
      selectedProjectName.length > 22
        ? `${selectedProjectName.slice(0, 20)}…`
        : selectedProjectName;

    cy.batch(() => {
      cy.elements().remove();

      cy.add([
        // ── Project anchor ─────────────────────────────────
        {
          group: "nodes" as const,
          data: {
            id: ANCHOR_ID,
            name: selectedProjectName,
            displayName: anchorDisplay,
            type: ANCHOR_TYPE,
            color: ANCHOR_COLOR,
            size: ANCHOR_SIZE,
            mentionCount: 0,
            description: null,
          },
          classes: "anchor",
        },
        // ── Real entity nodes ──────────────────────────────
        ...filteredData.nodes.map((n) => ({
          group: "nodes" as const,
          data: {
            id: n.id,
            name: n.name,
            // Truncate long names for labels (16 + ellipsis at 18+)
            // so the longest entity names collapse to a compact pill
            // instead of overlapping neighbours. Full name remains
            // available in the floating info card on selection.
            displayName:
              n.name.length > 18 ? `${n.name.slice(0, 16)}…` : n.name,
            type: n.type,
            color: nodeColor(n.type),
            // Intentionally small (6–14px model units). With the
            // MAX_FIT_ZOOM cap of 1.5×, rendered diameters stay in a
            // 6–21px band — landing-style precision dots, never balls.
            size: nodeSize(n.mentionCount),
            mentionCount: n.mentionCount,
            description: n.description,
          },
          classes: topIds.has(n.id) ? "show-label" : "",
        })),
        // ── Real relationship edges ────────────────────────
        ...filteredData.edges.map((e) => ({
          group: "edges" as const,
          data: {
            id: e.id,
            source: resolveId(e.source),
            target: resolveId(e.target),
            relationType: e.relationType,
            confidence: e.confidence,
            isContext: false,
          },
        })),
        // ── Synthetic context edges (anchor → tethers) ─────
        ...Array.from(anchorTetherIds).map((entityId) => ({
          group: "edges" as const,
          data: {
            id: `${ANCHOR_EDGE_PREFIX}${entityId}`,
            source: ANCHOR_ID,
            target: entityId,
            relationType: "context",
            confidence: 1,
            isContext: true,
          },
          classes: "context",
        })),
      ]);
    });

    runLayout(cy);
    setFocusedNodeId(null);
  }, [filteredData, cyReady, selectedProjectName]);

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
    // Same capped fit as the post-layout fit so manual "Fit to view"
    // matches the default framing exactly and never produces the
    // over-zoomed "toy bubble" look on sparse graphs (see MAX_FIT_ZOOM).
    fitWithZoomCap(cy);
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
    setFocusedNodeId(null);
  }, []);

  // True when the anchor is the currently selected node — used to
  // swap in the project overview card and dim the legend/hint.
  const isAnchorFocused = focusedNodeId === ANCHOR_ID;

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
      {/*
        Pills follow the panel-system tonal accent recipe (see
        `docs/ui-panel-system.md` §6 and the `TonalActionButton` primitive):

          active  →  bg @ ~0.13 of accent / border @ ~0.32 of accent
                     / text & dot @ accent (full)
          inactive → soft hairline border, transparent fill, dim text

        Previously the active state painted the *full* saturated accent as
        the background, which read as opaque/blocky next to the rest of the
        Sovereign UI. The tonal version preserves the semantic colour
        mapping (PERSON → blue, COMPANY → green, …) while dropping the
        fill weight so the chips feel refined and consistent with the
        accent ramp used elsewhere (Quick Actions, IconWell, StatusPill).

        `color-mix(in srgb, <hex> X%, transparent)` is the same CSS we
        already use on the dashboard Quick Actions surface and works in
        every browser the app supports.
      */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-[11px] uppercase tracking-[0.08em] text-white/40">
          Show
        </span>
        {ENTITY_TYPE_VALUES.map((type) => {
          const active = !hiddenTypes.has(type);
          const accent = nodeColor(type);
          return (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`
                inline-flex cursor-pointer select-none items-center gap-1.5
                rounded-full border px-2.5 py-[3px] text-[11px] font-medium
                transition-colors duration-150
                ${
                  active
                    ? ""
                    : "border-[rgba(147,147,147,0.18)] bg-transparent text-white/35 hover:text-white/55 hover:border-[rgba(147,147,147,0.28)]"
                }
              `}
              style={
                active
                  ? {
                      background: `color-mix(in srgb, ${accent} 13%, transparent)`,
                      borderColor: `color-mix(in srgb, ${accent} 32%, transparent)`,
                      color: accent,
                    }
                  : undefined
              }
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background: active
                    ? accent
                    : "rgba(255,255,255,0.25)",
                }}
              />
              {type.charAt(0) + type.slice(1).toLowerCase()}
            </button>
          );
        })}

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
              r={ringState.radius + 4}
              fill="none"
              stroke={ringState.color}
              strokeWidth={1}
              strokeOpacity={0.5}
            />
            <circle
              cx={ringState.x}
              cy={ringState.y}
              r={ringState.radius + 9}
              fill="none"
              stroke={ringState.color}
              strokeWidth={1}
              strokeOpacity={0.2}
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
        {!isEmpty && !error && !focusedNode && !isAnchorFocused && (
          <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1 rounded-lg border border-border bg-card/95 px-3 py-2 backdrop-blur-sm">
            {ENTITY_TYPE_VALUES.filter((t) => !hiddenTypes.has(t)).map((type) => (
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
        {!isEmpty && !error && !focusedNode && !isAnchorFocused && !loading && (
          <p className="absolute bottom-3 right-14 z-10 select-none text-[11px] text-muted-foreground">
            Click a node to explore · Scroll to zoom · Drag to pan
          </p>
        )}

        {/* ── Project anchor info card (bottom-left, when anchor focused) ── */}
        {/*
          Mirrors the entity info card layout/footprint so the canvas
          composition stays stable when the user toggles between the
          anchor and a regular entity. The card explicitly states that
          context links are NOT extracted relationships, to remove any
          confusion between the two edge kinds.
        */}
        {isAnchorFocused && filteredData && (
          <div className="absolute bottom-4 left-4 z-20 w-[280px] rounded-xl border border-border bg-card/98 shadow-xl backdrop-blur-md">
            <div className="flex items-start justify-between gap-2 border-b border-border px-4 pb-3 pt-4">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: ANCHOR_COLOR }}
                  />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Project anchor
                  </span>
                </div>
                <h3 className="text-sm font-semibold leading-snug text-foreground">
                  {selectedProjectName}
                </h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {filteredData.nodes.length} entit
                  {filteredData.nodes.length !== 1 ? "ies" : "y"} ·{" "}
                  {filteredData.edges.length} relationship
                  {filteredData.edges.length !== 1 ? "s" : ""}
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
            <p className="px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
              The dashed lines are <span className="text-foreground">context links</span>{" "}
              from this project to its isolated entities and a few main
              hubs. They are not extracted relationships.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
