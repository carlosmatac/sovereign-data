import { Shield, Database, Brain } from "lucide-react";
import { SectionSurface, SectionChip, StatusPill } from "@/components/panels";

type Row = { label: string; node: React.ReactNode };

export default function SettingsPage() {
  const securityRows: Row[] = [
    {
      label: "Row Level Security (RLS)",
      node: <StatusPill tone="ready" text="Enabled" />,
    },
    {
      label: "Data Region",
      node: <SectionChip tone="neutral">EU (Frankfurt)</SectionChip>,
    },
    {
      label: "AI Data Retention",
      node: <StatusPill tone="ready" text="Zero Retention" />,
    },
  ];

  const aiRows: Row[] = [
    {
      label: "Transcription",
      node: <SectionChip tone="neutral">AssemblyAI Universal-2</SectionChip>,
    },
    {
      label: "Extraction",
      node: <SectionChip tone="neutral">GPT-4o-mini</SectionChip>,
    },
    {
      label: "Embeddings",
      node: <SectionChip tone="neutral">text-embedding-3-small</SectionChip>,
    },
  ];

  const dbRows: Row[] = [
    {
      label: "Engine",
      node: <SectionChip tone="neutral">PostgreSQL 16</SectionChip>,
    },
    {
      label: "Vector Index",
      node: <SectionChip tone="neutral">HNSW (1536 dim)</SectionChip>,
    },
  ];

  return (
    <div className="px-5 py-6 lg:px-8 lg:py-7">
      <div className="mb-6">
        <p
          className="mb-1.5 text-[11px] font-semibold uppercase"
          style={{
            letterSpacing: "0.14em",
            color: "rgba(255,255,255,0.42)",
          }}
        >
          Aksum · Settings
        </p>
        <h1
          className="text-[28px] font-semibold text-white"
          style={{ letterSpacing: "-0.020em", lineHeight: 1.05 }}
        >
          Settings
        </h1>
        <p className="mt-1.5 max-w-xl text-[13px] leading-[1.6] text-white/62">
          Platform configuration and security settings.
        </p>
      </div>

      <div className="grid max-w-2xl gap-4">
        <SettingsPanel
          icon={<Shield className="h-[15px] w-[15px]" style={{ color: "#4ADE80" }} strokeWidth={1.6} />}
          accent="#4ADE80"
          title="Security & Privacy"
          subtitle="Zero Trust data handling policies"
          rows={securityRows}
        />
        <SettingsPanel
          icon={<Brain className="h-[15px] w-[15px]" style={{ color: "#A78BFA" }} strokeWidth={1.6} />}
          accent="#A78BFA"
          title="AI Pipeline"
          subtitle="Model configuration for the intelligence engine"
          rows={aiRows}
        />
        <SettingsPanel
          icon={<Database className="h-[15px] w-[15px]" style={{ color: "#5B9CF6" }} strokeWidth={1.6} />}
          accent="#5B9CF6"
          title="Database"
          subtitle="Supabase PostgreSQL with pgvector"
          rows={dbRows}
        />
      </div>
    </div>
  );
}

function SettingsPanel({
  icon,
  accent,
  title,
  subtitle,
  rows,
}: {
  icon: React.ReactNode;
  accent: string;
  title: string;
  subtitle: string;
  rows: Row[];
}) {
  return (
    <SectionSurface
      header={{
        title,
        subtitle,
        right: (
          <div
            className="flex h-[28px] w-[28px] items-center justify-center rounded-full"
            style={{
              background: `${accent}22`,
              border: `1px solid ${accent}50`,
            }}
          >
            {icon}
          </div>
        ),
      }}
      bodyClassName="flex flex-col"
    >
      {rows.map((row, i) => (
        <div
          key={row.label}
          className="flex items-center justify-between px-4 py-3"
          style={{
            borderTop: i === 0 ? "none" : "1px solid rgba(147,147,147,0.09)",
          }}
        >
          <span className="text-[12.5px] text-white/72">{row.label}</span>
          {row.node}
        </div>
      ))}
    </SectionSurface>
  );
}
