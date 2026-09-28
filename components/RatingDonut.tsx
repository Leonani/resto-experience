"use client";

import { Cell, Pie, PieChart } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  RATING_CHART_CONFIG,
  ratingKeyFor,
} from "@/components/ratings-chart";

/**
 * Mini-dona de composición de una sede. Va arriba del promedio dentro de la
 * tarjeta del bento. Cada segmento usa el MISMO color que el bar chart
 * apilado (paleta de `ratings-chart.ts`). El centro muestra la CANTIDAD total
 * de reseñas de la sede (suma de todos los buckets), no el promedio. Una sede
 * sin reseñas muestra "0" con el anillo vacío: es un dato real, no un 0.0
 * inventado (RN-05 solo gobierna el promedio, que vive en la tarjeta).
 *
 * Sin leyenda a propósito: el detalle con conteos está en el tooltip al pasar
 * el cursor; el bar chart global con leyenda es el que da el detalle completo.
 */
export function RatingDonut({
  buckets,
}: {
  buckets: { rating: number | null; count: number }[];
}) {
  const segments = buckets
    .filter((b) => b.count > 0)
    .map((b) => {
      const key = ratingKeyFor(b.rating);
      return { key, count: b.count, color: RATING_CHART_CONFIG[key].color };
    });

  const total = buckets.reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="relative">
      <ChartContainer config={RATING_CHART_CONFIG} className="h-28 w-28">
        <PieChart>
          <Pie
            data={segments}
            dataKey="count"
            nameKey="key"
            innerRadius={34}
            outerRadius={52}
            paddingAngle={2}
            stroke="none"
          >
            {segments.map((segment) => (
              <Cell key={segment.key} fill={segment.color} />
            ))}
          </Pie>
          <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
        </PieChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold leading-none text-slate-900 tabular-nums">
          {total}
        </span>
        <span className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
          reseñas
        </span>
      </div>
    </div>
  );
}