"use client";

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
    <div className="rounded-md border border-white/10 bg-[oklch(0.18_0.03_264)] px-3 py-2 shadow-xl">
      <p className="mb-1 max-w-[200px] truncate text-xs font-semibold text-white/90">
        {label}
      </p>
      {d.country && (
        <p className="text-[11px] text-white/40 mb-1">{d.country}</p>
      )}
      <p className="text-xs text-white/60">
        <span className="font-medium text-white/90">{d.total}</span> interviews
      </p>
    </div>
  );
}

interface Props {
  data: ProjectDataPoint[];
}

export function InterviewsByProjectChart({ data }: Props) {
  if (!data.length) return null;

  const chartData = data.slice(0, 10).map((d) => ({
    ...d,
    displayName:
      d.name.length > 22 ? d.name.slice(0, 21) + "…" : d.name,
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 38)}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
        barCategoryGap="30%"
      >
        <XAxis
          type="number"
          tick={{ fill: "oklch(0.55 0.018 264)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          tickCount={4}
        />
        <YAxis
          type="category"
          dataKey="displayName"
          width={130}
          tick={{ fill: "oklch(0.70 0.018 264)", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: "oklch(1 0 0 / 0.04)" }}
        />
        <Bar dataKey="total" radius={[0, 3, 3, 0]}>
          {chartData.map((entry, index) => {
            const intensity = 1 - index * 0.07;
            return (
              <Cell
                key={entry.name}
                fill={`oklch(${0.58 + index * 0.02} ${0.14 - index * 0.008} 264 / ${Math.max(0.45, intensity)})`}
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
