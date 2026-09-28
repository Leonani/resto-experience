import { isResponded, type Review } from '@/lib/types/review';

/**
 * Cálculo de métricas por sede.
 *
 * Función PURA a propósito: no toca Supabase. Es la única forma de testear los
 * casos sucios (`rating: null`, sede vacía, duplicados) sin una base de datos.
 * Un `expect` sin mocks vale más que un test de integración que necesita
 * credenciales para verificar que 29/8 da 3.63.
 */

export type LocationSummary = {
  locationId: string;
  /** Reseñas recibidas, calificadas o no (RN-03). */
  totalReviews: number;
  /** Reseñas con `rating` distinto de `null`. Es el denominador del promedio. */
  ratedReviews: number;
  /**
   * Promedio redondeado a 2 decimales, o `null` cuando no hay ninguna reseña
   * calificada.
   *
   * `null` NUNCA se convierte en `0`. Ver RN-05: `0.0` afirma que hubo reseñas
   * y todas fueron de 0 estrellas, que es falso.
   */
  averageRating: number | null;
  repliedCount: number;
  /** 0..100, con 1 decimal. Calculado sobre el TOTAL de reseñas, no sobre las calificadas. */
  replyPercentage: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Un decimal, que es lo que se muestra en la UI. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Resumen de una sede.
 *
 * `averageRating` sale del filtro explícito de `rated`, no de confiar en que
 * `AVG` ignores los `NULL`. El filtro documenta RN-03 en el código y sobrevive
 * a que alguien cambie el tipo de la columna.
 */
export function calculateLocationSummary(
  locationId: string,
  reviews: Review[],
): LocationSummary {
  const own = reviews.filter((r) => r.location_id === locationId);

  const rated = own.filter((r) => r.rating !== null);

  const averageRating =
    rated.length === 0
      ? null
      : round2(rated.reduce((sum, r) => sum + (r.rating as number), 0) / rated.length);

  const repliedCount = own.filter(isResponded).length;

  return {
    locationId,
    totalReviews: own.length,
    ratedReviews: rated.length,
    averageRating,
    repliedCount,
    // Se divide por el total de reseñas, no por las calificadas: la pregunta
    // del gerente es "de las 9 que recibimos, respondimos 2".
    //
    // Un decimal, no dos: 2/9 da 22.22% y se mostraría 22.2%. Rounderar a dos
    // decimales haría que el dato del modelo no coincida con lo que se ve, y
    // ese desajuste es la clase de detalle que hace dudar de todo el panel.
    replyPercentage: own.length === 0 ? 0 : round1((repliedCount / own.length) * 100),
  };
}

/** Resumen de todas las sedes a la vez, para el bento del header. */
export function calculateAllSummaries(
  locationIds: string[],
  reviews: Review[],
): LocationSummary[] {
  return locationIds.map((id) => calculateLocationSummary(id, reviews));
}

// ---------------------------------------------------------------------------
// Distribución de calificaciones (alimenta la dona de cada tarjeta y el bar
// chart apilado de la bandeja)
// ---------------------------------------------------------------------------

/**
 * Buckets canónicos del promedio, en el orden en que se muestran en la dona y
 * en la leyenda. `rating: null` es un bucket obligatorio (RN-03): esas reseñas
 * existen, se responden y no entran al promedio, pero sí se ven en la UI.
 */
export const RATING_BUCKETS: ReadonlyArray<{ rating: number | null; label: string }> = [
  { rating: 5, label: "5 estrellas" },
  { rating: 4, label: "4 estrellas" },
  { rating: 3, label: "3 estrellas" },
  { rating: 2, label: "2 estrellas" },
  { rating: 1, label: "1 estrella" },
  { rating: null, label: "Sin calificación" },
];

export type RatingBucket = {
  rating: number | null;
  label: string;
  count: number;
};

export type RatingsByLocation = {
  locationId: string;
  buckets: RatingBucket[];
};

/** Conteo por bucket de calificación para un conjunto de reseñas. */
export function calculateRatingDistribution(reviews: Review[]): RatingBucket[] {
  return RATING_BUCKETS.map(({ rating, label }) => ({
    rating,
    label,
    count: reviews.filter((r) => r.rating === rating).length,
  }));
}

/**
 * Distribución por sede. Es la MISMA fuente para las mini-donas de las
 * tarjetas y para el bar chart apilado: si un número cambia, cambia en ambos
 * lados. La suma de los buckets de una sede coincide con `totalReviews` de su
 * `LocationSummary` (toda reseña cae en exactamente un bucket).
 */
export function calculateRatingsByLocation(
  locationIds: string[],
  reviews: Review[],
): RatingsByLocation[] {
  return locationIds.map((locationId) => ({
    locationId,
    buckets: calculateRatingDistribution(
      reviews.filter((r) => r.location_id === locationId),
    ),
  }));
}
