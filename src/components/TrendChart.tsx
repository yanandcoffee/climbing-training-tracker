import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDarkMode } from "../lib/useDarkMode";

export interface TrendPoint {
  date: string;
  value: number;
}

/**
 * Single-series trend line. Follows the dataviz method: one series (no legend —
 * the section title names it), thin 2px mark, recessive grid/axes, theme-aware
 * accent validated for contrast against both surfaces, hover tooltip by default.
 */
export default function TrendChart({
  data,
  label,
  unit,
}: {
  data: TrendPoint[];
  label: string;
  unit?: string;
}) {
  const dark = useDarkMode();
  // Sky accent: #0284c7 on light, #38bdf8 on dark — both clear the contrast
  // floor against their surface; single series needs no CVD separation.
  const accent = dark ? "#38bdf8" : "#0284c7";
  const grid = dark ? "#1e293b" : "#e2e8f0";
  const axis = dark ? "#64748b" : "#94a3b8";

  return (
    <div style={{ width: "100%", height: 220 }} role="img" aria-label={`${label} trend`}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: axis }}
            tickLine={false}
            axisLine={{ stroke: grid }}
            minTickGap={16}
          />
          <YAxis
            tick={{ fontSize: 11, fill: axis }}
            tickLine={false}
            axisLine={false}
            width={44}
            allowDecimals={false}
          />
          <Tooltip
            content={<ChartTooltip unit={unit} />}
            cursor={{ stroke: axis, strokeDasharray: "3 3" }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={accent}
            strokeWidth={2}
            dot={{ r: 3, fill: accent, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipInjectedProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ value?: number; payload?: { date?: string } }>;
  unit?: string;
}

function ChartTooltip({ active, payload, label: xLabel, unit }: TooltipInjectedProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900">
      <div className="font-medium text-slate-500">{p.payload?.date ?? xLabel}</div>
      <div className="font-semibold tabular-nums">
        {p.value}
        {unit ? ` ${unit}` : ""}
      </div>
    </div>
  );
}
