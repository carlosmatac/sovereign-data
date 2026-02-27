// ============================================
// Mock HubSpot Service — Sales War Room Data
// ============================================
// Simulates HubSpot CRM deal data with TBY-specific products and stages.
// Toggle SIMULATE_ERROR to test error state UI.

const SIMULATE_ERROR = false;
const ARTIFICIAL_DELAY_MS = 800;

// ── Raw HubSpot Types ────────────────────────────────────────────

export interface HubspotDealRaw {
  id: string;
  properties: {
    dealname: string;
    amount: string;
    dealstage: string;
    pipeline: string;
    createdate: string;
    closedate?: string;
    hs_lastmodifieddate: string;
    currency: string;
    deal_type?: string;
    amount_paid?: string;
  };
  associations?: { companyId?: string; companyName?: string };
  owner?: { id: string; name: string };
}

// ── UI Domain Types ──────────────────────────────────────────────

export type DealStage =
  | "pitch_completed"
  | "reviewing_proposal"
  | "negotiation"
  | "contract_sent"
  | "closed_won"
  | "closed_lost";

export type DealType = "cash" | "barter";

export interface Deal {
  id: string;
  name: string;
  company: string;
  amount: number;
  amountPaid: number;
  outstanding: number;
  stage: DealStage;
  type: DealType;
  owner: string;
  createdAt: string;
  closedAt?: string;
  lastModified: string;
  currency: string;
}

export const STAGE_LABELS: Record<DealStage, string> = {
  pitch_completed: "Pitch Completed",
  reviewing_proposal: "Reviewing Proposal",
  negotiation: "Negotiation",
  contract_sent: "Contract Sent",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
};

export const STAGE_ORDER: DealStage[] = [
  "pitch_completed",
  "reviewing_proposal",
  "negotiation",
  "contract_sent",
  "closed_won",
  "closed_lost",
];

// ── KPI & Pipeline Selector Types ────────────────────────────────

export interface DealKpis {
  closedCash: number;
  pendingCollection: number;
  barterVolume: number;
  progressPct: number;
  target: number;
  totalPipeline: number;
  closedCashCount: number;
  pendingCount: number;
  barterCount: number;
}

export interface PipelineStage {
  stage: DealStage;
  label: string;
  count: number;
  value: number;
}

// ── Mock Data ────────────────────────────────────────────────────

const MOCK_DEALS: HubspotDealRaw[] = [
  // Closed Won — Cash
  {
    id: "d-001",
    properties: {
      dealname: "Full Page + Interview",
      amount: "35000",
      dealstage: "closed_won",
      pipeline: "default",
      createdate: "2025-11-15T10:00:00Z",
      closedate: "2026-01-20T14:30:00Z",
      hs_lastmodifieddate: "2026-01-20T14:30:00Z",
      currency: "USD",
      deal_type: "cash",
      amount_paid: "35000",
    },
    associations: { companyId: "c-001", companyName: "Dangote Group" },
    owner: { id: "o-01", name: "Maria Santos" },
  },
  {
    id: "d-002",
    properties: {
      dealname: "Full Page + Interview",
      amount: "30000",
      dealstage: "closed_won",
      pipeline: "default",
      createdate: "2025-12-01T09:00:00Z",
      closedate: "2026-02-05T11:00:00Z",
      hs_lastmodifieddate: "2026-02-10T08:00:00Z",
      currency: "USD",
      deal_type: "cash",
      amount_paid: "20000",
    },
    associations: { companyId: "c-002", companyName: "MTN Group" },
    owner: { id: "o-01", name: "Maria Santos" },
  },
  {
    id: "d-003",
    properties: {
      dealname: "Half Page + Interview",
      amount: "18000",
      dealstage: "closed_won",
      pipeline: "default",
      createdate: "2025-12-10T08:30:00Z",
      closedate: "2026-01-28T16:00:00Z",
      hs_lastmodifieddate: "2026-01-28T16:00:00Z",
      currency: "USD",
      deal_type: "cash",
      amount_paid: "18000",
    },
    associations: { companyId: "c-003", companyName: "Ecobank" },
    owner: { id: "o-02", name: "João Pereira" },
  },
  {
    id: "d-004",
    properties: {
      dealname: "Full Page + Interview",
      amount: "32000",
      dealstage: "closed_won",
      pipeline: "default",
      createdate: "2025-11-20T07:00:00Z",
      closedate: "2026-02-12T10:00:00Z",
      hs_lastmodifieddate: "2026-02-12T10:00:00Z",
      currency: "USD",
      deal_type: "cash",
      amount_paid: "32000",
    },
    associations: { companyId: "c-004", companyName: "Sonangol" },
    owner: { id: "o-01", name: "Maria Santos" },
  },
  {
    id: "d-005",
    properties: {
      dealname: "Interview Only",
      amount: "12500",
      dealstage: "closed_won",
      pipeline: "default",
      createdate: "2026-01-05T13:00:00Z",
      closedate: "2026-02-18T09:00:00Z",
      hs_lastmodifieddate: "2026-02-20T15:00:00Z",
      currency: "USD",
      deal_type: "cash",
      amount_paid: "0",
    },
    associations: {
      companyId: "c-005",
      companyName: "Ministry of Finance",
    },
    owner: { id: "o-02", name: "João Pereira" },
  },
  // Closed Won — Barter
  {
    id: "d-006",
    properties: {
      dealname: "Full Page + Interview (Barter: Flights)",
      amount: "25000",
      dealstage: "closed_won",
      pipeline: "default",
      createdate: "2025-12-20T11:00:00Z",
      closedate: "2026-02-01T10:00:00Z",
      hs_lastmodifieddate: "2026-02-01T10:00:00Z",
      currency: "USD",
      deal_type: "barter",
      amount_paid: "0",
    },
    associations: {
      companyId: "c-006",
      companyName: "Ethiopian Airlines",
    },
    owner: { id: "o-01", name: "Maria Santos" },
  },
  {
    id: "d-007",
    properties: {
      dealname: "Logo Placement (Barter: Accommodation)",
      amount: "10000",
      dealstage: "closed_won",
      pipeline: "default",
      createdate: "2026-01-10T14:00:00Z",
      closedate: "2026-02-08T12:00:00Z",
      hs_lastmodifieddate: "2026-02-08T12:00:00Z",
      currency: "USD",
      deal_type: "barter",
      amount_paid: "0",
    },
    associations: { companyId: "c-007", companyName: "Hilton Addis" },
    owner: { id: "o-02", name: "João Pereira" },
  },
  // Pipeline — Active
  {
    id: "d-008",
    properties: {
      dealname: "Full Page + Interview",
      amount: "40000",
      dealstage: "negotiation",
      pipeline: "default",
      createdate: "2026-02-01T08:00:00Z",
      hs_lastmodifieddate: "2026-02-24T17:00:00Z",
      currency: "USD",
      deal_type: "cash",
    },
    associations: {
      companyId: "c-008",
      companyName: "TotalEnergies Mozambique",
    },
    owner: { id: "o-01", name: "Maria Santos" },
  },
  {
    id: "d-009",
    properties: {
      dealname: "Half Page + Interview",
      amount: "15000",
      dealstage: "reviewing_proposal",
      pipeline: "default",
      createdate: "2026-02-10T10:00:00Z",
      hs_lastmodifieddate: "2026-02-22T14:00:00Z",
      currency: "USD",
      deal_type: "cash",
    },
    associations: { companyId: "c-009", companyName: "Banco BIC" },
    owner: { id: "o-02", name: "João Pereira" },
  },
  {
    id: "d-010",
    properties: {
      dealname: "Full Page + Interview",
      amount: "28000",
      dealstage: "pitch_completed",
      pipeline: "default",
      createdate: "2026-02-15T09:00:00Z",
      hs_lastmodifieddate: "2026-02-23T11:00:00Z",
      currency: "USD",
      deal_type: "cash",
    },
    associations: { companyId: "c-010", companyName: "Vodacom" },
    owner: { id: "o-01", name: "Maria Santos" },
  },
  {
    id: "d-011",
    properties: {
      dealname: "Interview Only",
      amount: "8000",
      dealstage: "pitch_completed",
      pipeline: "default",
      createdate: "2026-02-18T15:00:00Z",
      hs_lastmodifieddate: "2026-02-25T09:00:00Z",
      currency: "USD",
      deal_type: "cash",
    },
    associations: { companyId: "c-011", companyName: "Central Bank" },
    owner: { id: "o-02", name: "João Pereira" },
  },
  {
    id: "d-012",
    properties: {
      dealname: "Half Page + Interview",
      amount: "20000",
      dealstage: "contract_sent",
      pipeline: "default",
      createdate: "2026-02-05T11:00:00Z",
      hs_lastmodifieddate: "2026-02-24T08:00:00Z",
      currency: "USD",
      deal_type: "cash",
    },
    associations: { companyId: "c-012", companyName: "Sasol" },
    owner: { id: "o-01", name: "Maria Santos" },
  },
  // Closed Lost
  {
    id: "d-013",
    properties: {
      dealname: "Full Page + Interview",
      amount: "35000",
      dealstage: "closed_lost",
      pipeline: "default",
      createdate: "2025-12-05T08:00:00Z",
      closedate: "2026-02-15T16:00:00Z",
      hs_lastmodifieddate: "2026-02-15T16:00:00Z",
      currency: "USD",
      deal_type: "cash",
    },
    associations: { companyId: "c-013", companyName: "AngloGold Ashanti" },
    owner: { id: "o-02", name: "João Pereira" },
  },
];

// ── Adapter ──────────────────────────────────────────────────────

export function mapHubspotDealsToUiDeals(raw: HubspotDealRaw[]): Deal[] {
  return raw.map((d) => {
    const amount = parseFloat(d.properties.amount) || 0;
    const amountPaid = parseFloat(d.properties.amount_paid ?? "0") || 0;
    const type: DealType =
      d.properties.deal_type === "barter" ? "barter" : "cash";

    return {
      id: d.id,
      name: d.properties.dealname,
      company: d.associations?.companyName ?? "Unknown",
      amount,
      amountPaid: type === "barter" ? 0 : amountPaid,
      outstanding: type === "barter" ? 0 : Math.max(amount - amountPaid, 0),
      stage: d.properties.dealstage as DealStage,
      type,
      owner: d.owner?.name ?? "Unassigned",
      createdAt: d.properties.createdate,
      closedAt: d.properties.closedate,
      lastModified: d.properties.hs_lastmodifieddate,
      currency: d.properties.currency,
    };
  });
}

// ── Selectors (pure functions) ───────────────────────────────────

export function selectKpis(deals: Deal[], target = 200_000): DealKpis {
  const closedCashDeals = deals.filter(
    (d) => d.stage === "closed_won" && d.type === "cash"
  );
  const closedCash = closedCashDeals.reduce((s, d) => s + d.amount, 0);
  const pendingCollection = closedCashDeals.reduce(
    (s, d) => s + d.outstanding,
    0
  );
  const pendingCount = closedCashDeals.filter((d) => d.outstanding > 0).length;

  const barterDeals = deals.filter(
    (d) => d.stage === "closed_won" && d.type === "barter"
  );
  const barterVolume = barterDeals.reduce((s, d) => s + d.amount, 0);

  const activePipeline = deals.filter(
    (d) => d.stage !== "closed_won" && d.stage !== "closed_lost"
  );
  const totalPipeline = activePipeline.reduce((s, d) => s + d.amount, 0);

  return {
    closedCash,
    pendingCollection,
    barterVolume,
    progressPct: target > 0 ? Math.min((closedCash / target) * 100, 100) : 0,
    target,
    totalPipeline,
    closedCashCount: closedCashDeals.length,
    pendingCount,
    barterCount: barterDeals.length,
  };
}

export function selectPipelineHealth(deals: Deal[]): PipelineStage[] {
  return STAGE_ORDER.filter(
    (s) => s !== "closed_won" && s !== "closed_lost"
  ).map((stage) => {
    const inStage = deals.filter((d) => d.stage === stage);
    return {
      stage,
      label: STAGE_LABELS[stage],
      count: inStage.length,
      value: inStage.reduce((s, d) => s + d.amount, 0),
    };
  });
}

// ── Mock API ─────────────────────────────────────────────────────

export async function getDeals(
  _projectId: string
): Promise<HubspotDealRaw[]> {
  await new Promise((r) => setTimeout(r, ARTIFICIAL_DELAY_MS));
  if (SIMULATE_ERROR) {
    throw new Error("HubSpot API: Connection refused (simulated)");
  }
  return MOCK_DEALS;
}
