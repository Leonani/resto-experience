"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  RATING_CHART_CONFIG,
  RATING_KEYS,
  ratingKeyFor,
  type RatingKey,
} from "@/components/ratings-chart";

import type { RatingBucket } from "@/lib/metrics";

/**
 * Bar chart apilado: una barra por sede, segmentada por calificación (misma
 * paleta y claves que la dona de cada tarjeta). Con leyenda (la "M reseñas en
 * N sedes" de la bandeja vive en el header; acá el subtítulo lo repite para
 * anclar el gráfico al contexto).
 */
export function RatingsStackedChart({
  data,
  reviewCount,
  locationCount,
}: {
  data: { locationName: string; buckets: RatingBucket[] }[];
  reviewCount: number;
  locationCount: number;
}) {
  const points = data.map(({ locationName, buckets }) => {
    const point: { location: string } & Record<RatingKey, number> = {
      location: locationName,
      r5: 0,
      r4: 0,
      r3: 0,
      r2: 0,
      r1: 0,
      rnull: 0,
    };
    for (const bucket of buckets) {
      point[ratingKeyFor(bucket.rating)] = bucket.count;
    }
    return point;
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          Composición de las reseñas
        </h2>
        <p className="text-sm text-slate-500">
          {reviewCount} reseñas en {locationCount} sedes
        </p>
      </div>

      <ChartContainer config={RATING_CHART_CONFIG} className="h-72 w-full">
        <BarChart data={points} accessibilityLayer>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="location"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {RATING_KEYS.map((key) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="composicion"
              fill={`var(--color-${key})`}
              radius={[0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </section>
  );
}