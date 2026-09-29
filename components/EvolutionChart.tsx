"use client";

import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

import type { SeriesPoint } from "@/lib/metrics";

const SERIE_TEMPORAL_CONFIG = {
  total: {
    label: "Reseñas por día",
    color: "#059669",
  },
  promedio: {
    label: "Promedio de estrellas",
    color: "#18181b",
  },
} as const;

/**
 * Evolución en el tiempo: área con las reseñas publicadas por día y línea con
 * el promedio de estrellas (eje derecho 0-5). Los días sin reseñas se muestran
 * como 0 (la serie conserva los huecos, no los esconde).
 */
export function EvolutionChart({ data }: { data: SeriesPoint[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          Evolución de las reseñas
        </h2>
        <p className="text-sm text-slate-500">
          Reseñas por día · cantidad y promedio de estrellas
        </p>
      </div>

      <ChartContainer config={SERIE_TEMPORAL_CONFIG} className="h-72 w-full">
        <ComposedChart data={data} accessibilityLayer>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
            angle={-30}
            height={36}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            yAxisId="total"
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={26}
          />
          <YAxis
            yAxisId="promedio"
            orientation="right"
            domain={[0, 5]}
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={24}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Area
            yAxisId="total"
            dataKey="total"
            type="monotone"
            stroke="var(--color-total)"
            fill="var(--color-total)"
            fillOpacity={0.25}
            strokeWidth={2}
          />
          <Line
            yAxisId="promedio"
            dataKey="promedio"
            type="monotone"
            stroke="var(--color-promedio)"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls={false}
          />
        </ComposedChart>
      </ChartContainer>
    </section>
  );
}