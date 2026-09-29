import { CalendarDays, Target } from "lucide-react";
import { Suspense } from "react";

import { AuthGate } from "@/components/AuthGate";
import { EmptyState } from "@/components/EmptyState";
import { EvolutionChart } from "@/components/EvolutionChart";
import { FilterBar } from "@/components/FilterBar";
import { KPICards } from "@/components/KPICards";
import { MetricsDateFilter } from "@/components/MetricsDateFilter";
import { MobileSidebar } from "@/components/MobileSidebar";
import { ReviewCard } from "@/components/ReviewCard";
import { SessionErrorBanner } from "@/components/SessionErrorBanner";
import { Sidebar } from "@/components/Sidebar";
import { SidebarNav } from "@/components/sidebar-nav";
import { SiteHeader } from "@/components/SiteHeader";
import { SummaryHeader } from "@/components/SummaryHeader";
import type { ReviewWithLocation } from "@/components/star-rating";
import {
  calculateAllSummaries,
  calculateOverallSummary,
  calculateRatingsByLocation,
  calculateSeriesOverTime,
  filterReviewsByDateRange,
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
  // Rango de fechas de las MÉTRICAS. Sin params = todo el historial.
  const desde = typeof params.desde === "string" ? params.desde : null;
  const hasta = typeof params.hasta === "string" ? params.hasta : null;

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

  const reviewsEnRango = filterReviewsByDateRange(reviews, { desde, hasta });
  const overall = calculateOverallSummary(reviewsEnRango);

  const summaries = calculateAllSummaries(
    locations.map((l) => l.id),
    reviews,
  );

  const ratingsByLocation = calculateRatingsByLocation(
    locations.map((l) => l.id),
    reviews,
  );

  const serieTemporal = calculateSeriesOverTime(reviews);

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
    <main className="flex min-h-screen flex-col bg-[#f8f6f3] text-slate-900 lg:flex-row">
      <AuthGate>
        {/* En tablet/móvil la sidebar vive en un drawer abierto con el menú
            hamburguesa; en lg+ se renderiza la sidebar fija (`hidden lg:flex`) */}
        <MobileSidebar>
          <SidebarNav restaurantName={restaurants[0]?.name} />
        </MobileSidebar>
        <Sidebar restaurantName={restaurants[0]?.name} />

        <div className="flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <SiteHeader />

          <SessionErrorBanner />

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
              {/* Métricas globales */}
              <section className="flex flex-col gap-3" aria-label="Métricas">
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#0f172a] px-5 py-4 text-white shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="grid size-8 place-items-center rounded-lg bg-white/10 text-sky-300">
                      <Target className="size-4" aria-hidden="true" />
                    </span>
                    <h2 className="text-sm font-semibold tracking-wide">
                      Métricas
                    </h2>
                  </div>
                  <span className="text-sm text-white/60">
                    {desde || hasta ? `${formatearRango(desde, hasta)} · ` : ""}
                    {overall.totalReviews} reseñas
                  </span>
                </div>

                <Suspense
                  fallback={<div className="h-[76px] rounded-2xl border border-slate-200 bg-white" />}
                >
                  <MetricsDateFilter reviewCount={overall.totalReviews} />
                </Suspense>

                <KPICards overall={overall} />
              </section>

              {/* Gráfico de evolución temporal, a ancho completo */}
              <EvolutionChart data={serieTemporal} />

              {/* Banner oscuro de contexto diario, justo arriba de los filtros */}
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#0f172a] px-5 py-4 text-white shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-lg bg-white/10 text-sky-300">
                    <CalendarDays className="size-4" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold tracking-wide">
                    Reseñas · Hoy & Este Mes
                  </span>
                </div>
                <span
                  className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold tabular-nums"
                  data-testid="resenas-hoy"
                >
                  {overall.todayCount} hoy
                </span>
              </div>

              {/* Bento de donas por sede, debajo del banner y arriba de los filtros */}
              <SummaryHeader
                summaries={summaries}
                locations={locations}
                restaurants={restaurants}
                ratingsByLocation={ratingsByLocation}
              />

              <Suspense
                fallback={<div className="h-[120px] rounded-2xl border border-slate-200 bg-white" />}
              >
                <FilterBar
                  locations={locations}
                  restaurants={restaurants}
                  visibleCount={visible.length}
                />
              </Suspense>

              {/* Reseñas: debajo de los filtros, a todo el ancho del contenido */}
              <section
                className="flex flex-col gap-3"
                aria-label="Feed de reseñas"
              >
                {visible.length === 0 ? (
                  <EmptyState hayFiltros={hayFiltros} />
                ) : (
                  <div className="flex flex-col gap-3">
                    {visible.map((review) => (
                      <ReviewCard key={review.id} review={review} />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </AuthGate>
    </main>
  );
}

/** "2026-09-01" → "01/09/2026". Formato fijo (sin `Intl`) para que servidor y cliente no difieran. */
function formatearDia(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Etiqueta del período activo; cadena vacía si no hay rango (historial completo). */
function formatearRango(desde: string | null, hasta: string | null): string {
  const d = formatearDia(desde);
  const h = formatearDia(hasta);

  if (d && h) return `${d} – ${h}`;
  if (d) return `desde ${d}`;
  if (h) return `hasta ${h}`;
  return "";
}

/**
 * Filtros aplicados en el servidor.
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
