"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface ProjectDataPoint {
  name: string;
  country: string | null;
  total: number;
  completed: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: ProjectDataPoint }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
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
      <p className="mb-1 max-w-[220px] truncate text-[12px] font-semibold text-white/95">
        {label}
      </p>
      {d.country && (
        <p className="mb-1 text-[11px] text-white/40">{d.country}</p>
      )}
      <p className="text-[11.5px] text-white/65">
        <span className="font-semibold tabular-nums text-white/95">
          {d.total}
        </span>{" "}
        sources
      </p>
    </div>
  );
}

interface Props {
  data: ProjectDataPoint[];
}

export function InterviewsByProjectChart({ data }: Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!data.length) return null;

  const chartData = data.slice(0, 10).map((d) => ({
    ...d,
    displayName: d.name.length > 22 ? d.name.slice(0, 21) + "…" : d.name,
  }));

  // Fill rule mirrors the donut chart: calm ramp by rank when nothing is
  // hovered, single bar emphasised with the rest dimmed on hover.
  const fillFor = (index: number) => {
    const rankAlpha = Math.max(0.42, 1 - index * 0.08);
    if (hoveredIndex === null) return `rgba(78,120,207,${rankAlpha})`;
    if (hoveredIndex === index) return "rgba(91,156,246,1)";
    return `rgba(78,120,207,${rankAlpha * 0.22})`;
  };

  return (
    <ResponsiveContainer
      width="100%"
      height={Math.max(200, chartData.length * 42)}
    >
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 20, bottom: 4, left: 0 }}
        barCategoryGap="28%"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <XAxis
          type="number"
          tick={{ fill: "rgba(255,255,255,0.42)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          tickCount={4}
        />
        <YAxis
          type="category"
          dataKey="displayName"
          width={140}
          tick={(props) => {
            const { x, y, payload, index } = props as {
              x: number;
              y: number;
              payload: { value: string };
              index: number;
            };
            const isActive = hoveredIndex === index;
            const isDimmed = hoveredIndex !== null && !isActive;
            return (
              <text
                x={x}
                y={y}
                dy={4}
                textAnchor="end"
                style={{
                  fill: isActive
                    ? "rgba(255,255,255,0.95)"
                    : isDimmed
                      ? "rgba(255,255,255,0.38)"
                      : "rgba(255,255,255,0.78)",
                  fontSize: 12,
                  transition:
                    "fill 220ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                {payload.value}
              </text>
            );
          }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: "rgba(255,255,255,0.025)" }}
          isAnimationActive={false}
        />
        <Bar
          dataKey="total"
          radius={[0, 3, 3, 0]}
          isAnimationActive={false}
          onMouseEnter={(_, index) => setHoveredIndex(index)}
        >
          {chartData.map((entry, index) => (
            <Cell
              key={entry.name}
              fill={fillFor(index)}
              style={{
                transition:
                  "fill 260ms cubic-bezier(0.22, 1, 0.36, 1)",
                cursor: "pointer",
                outline: "none",
              }}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
