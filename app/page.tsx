import { Suspense } from "react";

import { AuthGate } from "@/components/AuthGate";
import { EmptyState } from "@/components/EmptyState";
import { FilterBar } from "@/components/FilterBar";
import { ReviewCard } from "@/components/ReviewCard";
import { SummaryHeader } from "@/components/SummaryHeader";
import type { ReviewWithLocation } from "@/components/star-rating";
import { calculateAllSummaries } from "@/lib/metrics";
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

  const summaries = calculateAllSummaries(
    locations.map((l) => l.id),
    reviews,
  );

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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <AuthGate>
        <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Bandeja de reseñas
        </h1>
        <p className="text-sm text-slate-500">
          {loadError
            ? "Sin conexión con la base de datos"
            : `${reviews.length} reseñas en ${locations.length} sedes`}
        </p>
      </header>

      {loadError ? (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
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
          <SummaryHeader
            summaries={summaries}
            locations={locations}
            restaurants={restaurants}
          />

          <Suspense
            fallback={<div className="h-[86px] rounded-xl border border-slate-200 bg-white" />}
          >
            <FilterBar locations={locations} restaurants={restaurants} />
          </Suspense>

          {visible.length === 0 ? (
            <EmptyState hayFiltros={hayFiltros} />
          ) : (
            <section className="flex flex-col gap-4" aria-label="Listado de reseñas">
              {visible.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </section>
          )}
        </>
      )}
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
