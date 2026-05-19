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
        background: "var(--sv-surface-bg)",
        border: "1px solid var(--sv-border-surface-strong)",
        boxShadow: "var(--sv-shadow-compact)",
      }}
    >
      <p
        className="mb-1 max-w-[220px] truncate text-[12px] font-semibold"
        style={{ color: "var(--sv-text-primary)" }}
      >
        {label}
      </p>
      {d.country && (
        <p className="mb-1 text-[11px]" style={{ color: "var(--sv-text-dim)" }}>
          {d.country}
        </p>
      )}
      <p className="text-[11.5px]" style={{ color: "var(--sv-text-secondary)" }}>
        <span
          className="font-semibold tabular-nums"
          style={{ color: "var(--sv-text-primary)" }}
        >
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
          tick={{ fill: "var(--sv-text-placeholder)", fontSize: 11 }}
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
                    ? "var(--sv-text-primary)"
                    : isDimmed
                      ? "var(--sv-text-dim)"
                      : "var(--sv-text-body)",
                  fontSize: 12,
                  transition: "fill 220ms cubic-bezier(0.22, 1, 0.36, 1)",
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
          cursor={{ fill: "var(--sv-accent,rgba(255,255,255,0.025))" }}
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
                transition: "fill 260ms cubic-bezier(0.22, 1, 0.36, 1)",
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
