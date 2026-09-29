"use client";

import { Cell, Pie, PieChart } from "recharts";
import type { PieLabelRenderProps } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  RATING_CHART_CONFIG,
  ratingKeyFor,
} from "@/components/ratings-chart";

const RADIAN = Math.PI / 180;

/**
 * Posiciona el conteo en el centro del sector y lo pinta de blanco. La función
 * de label de Pie recibe `midAngle`/radios y el `entry` (con `count`).
 */
function renderPieLabel(props: PieLabelRenderProps) {
  const { cx, cy, midAngle = 0, innerRadius, outerRadius } = props;
  const count = (props.payload as { count?: number }).count ?? 0;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="#fff"
      fontSize={11}
      fontWeight={600}
      textAnchor="middle"
      dominantBaseline="central"
    >
      {count}
    </text>
  );
}

/**
 * Mini-dona de composición de una sede. Va arriba del promedio dentro de la
 * tarjeta del bento. Cada sector usa el MISMO color que el bar chart apilado
 * (paleta de `ratings-chart.ts`) y muestra en su interior la CANTIDAD de
 * reseñas con esa calificación (conteo por sector), **sin línea guía**
 * (`labelLine={false}`). Centro vacío a propósito: el total de reseñas y el
 * promedio ya viven en la tarjeta.
 *
 * Sin leyenda a propósito: el detalle está en los conteos por sector y en el
 * bar chart global con leyenda.
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
            label={renderPieLabel}
            // Sin "palitos": recharts dibuja la línea guía hacia el sector cada
            // vez que hay `label`. El conteo va dentro del sector, así que la
            // línea solo suma ruido.
            labelLine={false}
          >
            {segments.map((segment) => (
              <Cell key={segment.key} fill={segment.color} />
            ))}
          </Pie>
          <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
        </PieChart>
      </ChartContainer>
    </div>
  );
}