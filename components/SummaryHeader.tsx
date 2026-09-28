"use client";

import { Progress } from "@/components/ui/progress";
import { Star } from "lucide-react";

import { RatingDonut } from "@/components/RatingDonut";
import { toneClasses, toneForRating } from "@/components/star-rating";
import type { LocationSummary, RatingsByLocation } from "@/lib/metrics";
import type { Location, Restaurant } from "@/lib/types/review";

/**
 * Bento de métricas: una tarjeta por sede, con la mini-dona de composición
 * arriba del promedio.
 *
 * Client Component por la dona (recharts), pero los datos llegan ya calculados
 * desde `page.tsx` como props: no hay `useEffect` ni fetch en el cliente.
 */
export function SummaryHeader({
  summaries,
  locations,
  restaurants,
  ratingsByLocation,
}: {
  summaries: LocationSummary[];
  locations: Location[];
  restaurants: Restaurant[];
  ratingsByLocation: RatingsByLocation[];
}) {
  return (
    <section aria-label="Resumen por sede" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {summaries.map((summary) => {
        const location = locations.find((l) => l.id === summary.locationId);
        const restaurant = restaurants.find(
          (r) => r.id === location?.restaurant_id,
        );
        const ratingData = ratingsByLocation.find(
          (by) => by.locationId === summary.locationId,
        );

        return (
          <LocationCard
            key={summary.locationId}
            summary={summary}
            buckets={ratingData?.buckets ?? []}
            locationName={location?.name ?? summary.locationId}
            restaurantName={restaurant?.name ?? ""}
          />
        );
      })}
    </section>
  );
}

function LocationCard({
  summary,
  buckets,
  locationName,
  restaurantName,
}: {
  summary: LocationSummary;
  buckets: RatingsByLocation["buckets"];
  locationName: string;
  restaurantName: string;
}) {
  const tone = toneForRating(summary.averageRating);
  const classes = toneClasses(tone);
  const sinDatos = summary.averageRating === null;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">{locationName}</h2>
        <p className="text-xs text-slate-500">{restaurantName}</p>
      </header>

      <div className="mb-4 flex justify-center">
        <RatingDonut buckets={buckets} />
      </div>

      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Reseñas
          </dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {summary.totalReviews}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Promedio
          </dt>
          <dd className="mt-1">
            {sinDatos ? (
              // RN-05. Nunca "0.0": sería afirmar que hubo reseñas y todas
              // fueron de 0 estrellas, que es falso.
              <span
                className="text-lg font-medium text-slate-400"
                data-testid="sin-datos"
              >
                Sin datos
              </span>
            ) : (
              <span
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xl font-semibold tabular-nums ${classes.bg} ${classes.border} ${classes.text}`}
                data-testid="promedio"
              >
                <Star className="size-4 fill-current" aria-hidden="true" />
                {summary.averageRating?.toFixed(2)}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <footer className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Respondido
          </span>
          <span className="text-sm font-semibold tabular-nums text-slate-700">
            {summary.replyPercentage.toFixed(1)}%
            <span className="ml-1 font-normal text-slate-400">
              ({summary.repliedCount}/{summary.totalReviews})
            </span>
          </span>
        </div>
        <Progress value={summary.replyPercentage} className="h-1.5" />
      </footer>
    </article>
  );
}
