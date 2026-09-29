import { CalendarDays } from "lucide-react";
import { Suspense } from "react";

import { AuthGate } from "@/components/AuthGate";
import { EmptyState } from "@/components/EmptyState";
import { FilterBar } from "@/components/FilterBar";
import { KPICards } from "@/components/KPICards";
import { RatingsStackedChart } from "@/components/RatingsStackedChart";
import { ReviewCard } from "@/components/ReviewCard";
import { Sidebar } from "@/components/Sidebar";
import { SiteHeader } from "@/components/SiteHeader";
import { SummaryHeader } from "@/components/SummaryHeader";
import type { ReviewWithLocation } from "@/components/star-rating";
import {
  calculateAllSummaries,
  calculateOverallSummary,
  calculateRatingsByLocation,
} from "@/lib/metrics";
import { compareReviewsByPriority } from "@/lib/review-order";
import { createClientPublic } from "@/lib/supabase/server";
import {
  ESTRELLAS_RANGO,
  isResponded,
  type EstadoFilter,
  type EstrellasFilter,
  type Location,
  type Restaurant,
  type Review,
} from "@/lib/types/review";

export const dynamic = "force-dynamic";

/**
 * Server Component.
 *
 * Los filtros viven en la URL, no en el estado del cliente. `searchParams` es
 * una Promise en Next.js 16: se accede con `await`.
 *
 * El listado se filtra acá, en el servidor. El `FilterBar` solo escribe en la
 * URL; el cliente nunca decide qué reseñas se muestran.
 */
export default async function Page({ searchParams }: PageProps<"/">) {
  const params = await searchParams;

  const sede = typeof params.sede === "string" ? params.sede : null;
  const restaurante = typeof params.restaurante === "string" ? params.restaurante : null;
  const estado = (typeof params.estado === "string" ? params.estado : "pendientes") as EstadoFilter;
  const estrellas = (typeof params.estrellas === "string" ? params.estrellas : "todas") as EstrellasFilter;

  let locations: Location[] = [];
  let restaurants: Restaurant[] = [];
  let reviews: Review[] = [];
  let loadError: string | null = null;

  try {
    const supabase = createClientPublic();

    const [locRes, restRes, revRes] = await Promise.all([
      supabase.from("locations").select("id, restaurant_id, name").order("name"),
      supabase.from("restaurants").select("id, name").order("name"),
      supabase.from("reviews").select("*").order("published_at", { ascending: false }),
    ]);

    if (locRes.error) throw new Error(locRes.error.message);
    if (restRes.error) throw new Error(restRes.error.message);
    if (revRes.error) throw new Error(revRes.error.message);

    locations = locRes.data ?? [];
    restaurants = restRes.data ?? [];
    reviews = revRes.data ?? [];
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "No se pudo conectar con la base de datos.";
  }

  const overall = calculateOverallSummary(reviews);

  const summaries = calculateAllSummaries(
    locations.map((l) => l.id),
    reviews,
  );

  const ratingsByLocation = calculateRatingsByLocation(
    locations.map((l) => l.id),
    reviews,
  );

  const stackedChartData = ratingsByLocation.map((by) => ({
    locationName: locations.find((l) => l.id === by.locationId)?.name ?? by.locationId,
    buckets: by.buckets,
  }));

  const visible = applyFilters(reviews, locations, restaurants, {
    sede,
    restaurante,
    estado,
    estrellas,
  });

  const hayFiltros =
    sede !== null ||
    restaurante !== null ||
    params.estado != null ||
    params.estrellas != null;

  return (
    <main className="flex min-h-screen bg-[#f8f6f3] text-slate-900">
      <AuthGate>
        <Sidebar restaurantName={restaurants[0]?.name} />

        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <SiteHeader />

          {/* Banner oscuro de contexto diario */}
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#0f172a] px-5 py-4 text-white shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg bg-white/10 text-sky-300">
                <CalendarDays className="size-4" aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold tracking-wide">
                Reseñas · Hoy & Este Mes
              </span>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold tabular-nums" data-testid="resenas-hoy">
              {overall.todayCount} hoy
            </span>
          </div>

          {loadError ? (
            <div
              className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
              role="alert"
            >
              <p className="font-medium">No se pudieron cargar los datos</p>
              <p className="mt-1">{loadError}</p>
              <p className="mt-2 text-rose-600">
                Verificá que las variables de entorno estén cargadas y que la base de datos
                tenga el schema aplicado.
              </p>
            </div>
          ) : (
            <>
              <KPICards overall={overall} />

              <Suspense
                fallback={<div className="h-[120px] rounded-2xl border border-slate-200 bg-white" />}
              >
                <FilterBar
                  locations={locations}
                  restaurants={restaurants}
                  visibleCount={visible.length}
                />
              </Suspense>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
                {/* Columna izquierda: gráficos y bento por sede */}
                <div className="flex min-w-0 flex-col gap-6">
                  <RatingsStackedChart
                    data={stackedChartData}
                    reviewCount={reviews.length}
                    locationCount={locations.length}
                  />

                  <SummaryHeader
                    summaries={summaries}
                    locations={locations}
                    restaurants={restaurants}
                    ratingsByLocation={ratingsByLocation}
                  />
                </div>

                {/* Columna derecha: feed de reseñas (la cabecera vive en la
                    card de filtros; acá solo el listado) */}
                <aside className="flex min-w-0 flex-col gap-3" aria-label="Feed de reseñas">
                  {visible.length === 0 ? (
                    <EmptyState hayFiltros={hayFiltros} />
                  ) : (
                    <section
                      className="flex flex-col gap-3"
                      aria-label="Listado de reseñas"
                    >
                      {visible.map((review) => (
                        <ReviewCard key={review.id} review={review} />
                      ))}
                    </section>
                  )}
                </aside>
              </div>
            </>
          )}
        </div>
      </AuthGate>
    </main>
  );
}

/**
 * Filtros aplicados en el servidor.
 *
 * `rating: null` se resuelve por separado de los rangos numéricos: no es un
 * 0, así que no entra en `ESTRELLAS_RANGO`.
 */
function applyFilters(
  reviews: Review[],
  locations: Location[],
  restaurants: Restaurant[],
  filters: {
    sede: string | null;
    restaurante: string | null;
    estado: EstadoFilter;
    estrellas: EstrellasFilter;
  },
): ReviewWithLocation[] {
  let result = reviews;

  if (filters.sede) {
    result = result.filter((r) => r.location_id === filters.sede);
  }

  // Una sede pertenece a un restaurante: filtrar por restaurante deja las
  // reseñas de todas sus sedes, y se combina con el filtro de sede (AND).
  if (filters.restaurante) {
    result = result.filter(
      (r) =>
        locations.find((l) => l.id === r.location_id)?.restaurant_id ===
        filters.restaurante,
    );
  }

  if (filters.estado !== "todas") {
    result = result.filter((r) => {
      const respondida = isResponded(r);
      return filters.estado === "respondidas" ? respondida : !respondida;
    });
  }

  if (filters.estrellas === "sin") {
    result = result.filter((r) => r.rating === null);
  } else if (filters.estrellas !== "todas") {
    const rango = ESTRELLAS_RANGO[filters.estrellas];
    result = result.filter((r) => r.rating !== null && rango.includes(r.rating));
  }

  // Jerarquía del design-system §1: pendientes primero, respondidas después.
  // Dentro de cada grupo, estrellas ascendentes: 1, 2, 3, sin calificación,
  // 4, 5; más recientes primero dentro del mismo rango.
  return result
    .sort(compareReviewsByPriority)
    .map((review) => {
      const location = locations.find((l) => l.id === review.location_id);
      const restaurant = restaurants.find(
        (r) => r.id === location?.restaurant_id,
      );

      return {
        ...review,
        locationName: location?.name ?? review.location_id,
        restaurantName: restaurant?.name ?? "",
      };
    });
}
