import type { ComponentType, ReactNode } from "react";
import { CheckCheck, Clock, MessageSquareText, Star } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import type { OverallSummary } from "@/lib/metrics";

/**
 * Fila de indicadores globales del panel. Datos ya calculados por
 * `calculateOverallSummary` en el servidor: acá solo se formatean.
 *
 * Regla obligatoria del proyecto: nunca fabricar un comparativo. El "+12% vs
 * período anterior" del diseño de referencia se omite porque no hay período
 * anterior cargado; el único dato temporal real es el conteo de hoy.
 */
export function KPICards({ overall }: { overall: OverallSummary }) {
  const sinDatos = overall.averageRating === null;

  return (
    <section
      aria-label="Indicadores del panel"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <KPICard
        label="Reseñas totales"
        icon={MessageSquareText}
        badge={
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-100 tabular-nums">
            {overall.todayCount} hoy
          </span>
        }
      >
        <span className="text-3xl font-bold tabular-nums text-slate-900">
          {overall.totalReviews}
        </span>
      </KPICard>

      <KPICard label="Promedio de estrellas" icon={Star}>
        {sinDatos ? (
          <span className="text-3xl font-bold text-slate-400" data-testid="avg-sin-datos">
            Sin datos
          </span>
        ) : (
          <span className="flex items-baseline gap-1 text-3xl font-bold tabular-nums text-slate-900">
            {overall.averageRating?.toFixed(2)}
            <span className="text-base font-medium text-slate-400">/ 5.0</span>
          </span>
        )}
        <p className="text-xs text-slate-400">Promedio general · solo reseñas calificadas</p>
      </KPICard>

      <KPICard label="Respondido" icon={CheckCheck}>
        <span className="text-3xl font-bold tabular-nums text-slate-900">
          {overall.replyPercentage.toFixed(1)}%
        </span>
        <div className="space-y-1">
          <Progress value={overall.replyPercentage} className="h-1.5" />
          <p className="text-xs text-slate-400 tabular-nums">
            {overall.repliedCount} respuestas enviadas de {overall.totalReviews}
          </p>
        </div>
      </KPICard>

      <KPICard
        label="Pendientes de respuesta"
        icon={Clock}
        badge={
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-100 tabular-nums">
            {overall.pendingPercentage.toFixed(1)}% sin responder
          </span>
        }
      >
        <span className="text-3xl font-bold tabular-nums text-slate-900">
          {overall.pendingCount}
        </span>
      </KPICard>
    </section>
  );
}

function KPICard({
  label,
  icon: Icon,
  badge,
  children,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          {label}
        </h3>
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-500">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {children}
        {badge}
      </div>
    </article>
  );
}