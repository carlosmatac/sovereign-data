"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface TopicDataPoint {
  topic: string;
  count: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: TopicDataPoint }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="rounded-[5px] px-2.5 py-2"
      style={{
        background: "#080F1E",
        border: "1px solid rgba(147,147,147,0.18)",
        boxShadow:
          "0 0 0 1px rgba(255,255,255,0.025), 0 8px 24px -6px rgba(0,0,0,0.55)",
      }}
    >
      <p className="max-w-[220px] truncate text-[12px] font-semibold text-white/95">
        {d.topic}
      </p>
      <p className="mt-0.5 text-[11.5px] text-white/65">
        <span className="font-semibold tabular-nums text-white/95">
          {d.count}
        </span>{" "}
        mention{d.count !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

// Donut colour palette — Sovereign fixed accent family.
const PALETTE = [
  "#5B9CF6",
  "#34D399",
  "#A78BFA",
  "#7DD3FC",
  "#FBBF24",
  "#F472B6",
  "#818CF8",
  "#94A3B8",
];

interface Props {
  data: TopicDataPoint[];
}

export function TopicDistributionChart({ data }: Props) {
  if (!data.length) return null;

  const displayData = data.slice(0, 8);

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      {/* Donut */}
      <div className="mx-auto h-[200px] w-full max-w-[200px] shrink-0 sm:mx-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={displayData}
              dataKey="count"
              nameKey="topic"
              cx="50%"
              cy="50%"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={2}
              strokeWidth={0}
            >
              {displayData.map((entry, index) => (
                <Cell
                  key={entry.topic}
                  fill={PALETTE[index % PALETTE.length]}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <ul className="flex min-w-0 flex-1 flex-col gap-2">
        {displayData.map((entry, index) => (
          <li key={entry.topic} className="flex min-w-0 items-center gap-2.5">
            <span
              className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
              style={{ background: PALETTE[index % PALETTE.length] }}
            />
            <span className="flex-1 truncate text-[12px] text-white/78">
              {entry.topic}
            </span>
            <span className="shrink-0 text-[11.5px] font-medium tabular-nums text-white/50">
              {entry.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
