"use client";

import { Pie, PieChart } from "recharts";

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
 * tarjeta del bento. El centro muestra el promedio de la sede (o "Sin datos"
 * cuando no hay reseñas: RN-05, nunca un 0.0 inventado).
 *
 * Sin leyenda a propósito: el detalle con conteos está en el tooltip al pasar
 * el cursor; el bar chart global con leyenda es el que da el detalle completo.
 */
export function RatingDonut({
  buckets,
  averageRating,
  sinDatos,
}: {
  buckets: { rating: number | null; count: number }[];
  averageRating: number | null;
  sinDatos: boolean;
}) {
  const segments = buckets
    .filter((b) => b.count > 0)
    .map((b) => ({ key: ratingKeyFor(b.rating), count: b.count }));

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
          />
          <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
        </PieChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {sinDatos || averageRating === null ? (
          <span className="text-xs font-medium text-slate-400">Sin datos</span>
        ) : (
          <>
            <span className="text-xl font-semibold leading-none text-slate-900">
              {averageRating.toFixed(2)}
            </span>
            <span className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
              promedio
            </span>
          </>
        )}
      </div>
    </div>
  );
}