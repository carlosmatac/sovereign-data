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
    <div className="rounded-md border border-white/10 bg-[oklch(0.18_0.03_264)] px-3 py-2 shadow-xl">
      <p className="max-w-[180px] truncate text-xs font-semibold text-white/90">
        {d.topic}
      </p>
      <p className="mt-0.5 text-xs text-white/60">
        <span className="font-medium text-white/90">{d.count}</span>{" "}
        mention{d.count !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

// Donut colour palette — slate/blue family matching brand
const PALETTE = [
  "oklch(0.70 0.16 264)",
  "oklch(0.75 0.14 200)",
  "oklch(0.68 0.12 230)",
  "oklch(0.62 0.18 270)",
  "oklch(0.78 0.13 220)",
  "oklch(0.55 0.15 250)",
  "oklch(0.72 0.10 195)",
  "oklch(0.65 0.14 280)",
];

interface Props {
  data: TopicDataPoint[];
}

export function TopicDistributionChart({ data }: Props) {
  if (!data.length) return null;

  const displayData = data.slice(0, 8);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {/* Donut */}
      <div className="h-[180px] w-full max-w-[180px] shrink-0 mx-auto sm:mx-0">
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
      <ul className="flex flex-1 flex-col gap-1.5 min-w-0">
        {displayData.map((entry, index) => (
          <li key={entry.topic} className="flex items-center gap-2 min-w-0">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-sm"
              style={{ background: PALETTE[index % PALETTE.length] }}
            />
            <span className="flex-1 truncate text-xs text-white/70">
              {entry.topic}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-white/40">
              {entry.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
