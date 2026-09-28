import type { ChartConfig } from "@/components/ui/chart";

/**
 * Paleta y claves compartidas por los gráficos de calificaciones (dona de cada
 * tarjeta y bar chart apilado). Un solo lugar define los colores y labels:
 * si cambia un bucket, cambia en ambos lados.
 *
 * Colores oklch fijos (no `var(--color-*)`) para no depender de que Tailwind
 * emita la variable: los valores son los de la paleta de Tailwind.
 */
export const RATING_KEYS = ["r5", "r4", "r3", "r2", "r1", "rnull"] as const;
export type RatingKey = (typeof RATING_KEYS)[number];

export const RATING_CHART_CONFIG = {
  r5: { label: "5 estrellas", color: "oklch(0.596 0.145 163.225)" },
  r4: { label: "4 estrellas", color: "oklch(0.765 0.177 163.223)" },
  r3: { label: "3 estrellas", color: "oklch(0.769 0.188 70.08)" },
  r2: { label: "2 estrellas", color: "oklch(0.712 0.209 9.889)" },
  r1: { label: "1 estrella", color: "oklch(0.586 0.253 17.585)" },
  rnull: { label: "Sin calificación", color: "oklch(0.704 0.04 256.788)" },
} satisfies ChartConfig;

export function ratingKeyFor(rating: number | null): RatingKey {
  if (rating === null) return "rnull";
  return (`r${rating}` as RatingKey);
}