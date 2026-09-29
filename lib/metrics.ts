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

// ---------------------------------------------------------------------------
// Resumen global (alimenta los KPIs del tope del panel)
// ---------------------------------------------------------------------------

export type OverallSummary = {
  totalReviews: number;
  ratedReviews: number;
  /** Promedio general, `null` si no hay ninguna calificada (RN-05). */
  averageRating: number | null;
  repliedCount: number;
  /** 0..100 con 1 decimal, sobre el total de reseñas. */
  replyPercentage: number;
  pendingCount: number;
  /** 0..100 con 1 decimal, sobre el total de reseñas. */
  pendingPercentage: number;
  /** Reseñas publicadas el día de `now` (mismo día UTC). Alimenta el badge "hoy". */
  todayCount: number;
};

/**
 * Instante de referencia para las fechas relativas de un render.
 *
 * Vive acá y no dentro del componente a propósito. `page.tsx` corre una vez
 * por request (`force-dynamic`) y este número viaja serializado en el payload
 * RSC, así que el cliente hidrata contra el mismo instante que el servidor y
 * las tarjetas no cambian de texto. Adentro del componente, en cambio,
 * `react-hooks/purity` lo marcaría: la regla protege los re-renders del
 * cliente, y un Server Component no vuelve a renderizar por su cuenta.
 */
export function instanteDeRender(): number {
  return Date.now();
}

/**
 * Resumen global del panel. Pura a propósito, igual que el resto de `metrics`:
 * los KPIs salen de una sola función testable, no de SQL diseminado en cada
 * tarjeta.
 *
 * `pendingCount` es el complemento de `repliedCount` sobre el total: una
 * reseña pendiente es una que no fue respondida (RN-06), no una que nadie
 * importó.
 *
 * "Hoy" se compara en UTC con `now.toISOString()` para que el test sea
 * determinista sin importar la zona horaria de la máquina.
 */
export function calculateOverallSummary(
  reviews: Review[],
  now: Date = new Date(),
): OverallSummary {
  const rated = reviews.filter((r) => r.rating !== null);
  const repliedCount = reviews.filter(isResponded).length;
  const pendingCount = reviews.length - repliedCount;

  const startOfUtcDay = new Date(now.toISOString().slice(0, 10) + "T00:00:00.000Z");
  const todayCount = reviews.filter(
    (r) => new Date(r.published_at).getTime() >= startOfUtcDay.getTime(),
  ).length;

  return {
    totalReviews: reviews.length,
    ratedReviews: rated.length,
    averageRating:
      rated.length === 0
        ? null
        : round2(rated.reduce((sum, r) => sum + (r.rating as number), 0) / rated.length),
    repliedCount,
    replyPercentage: reviews.length === 0 ? 0 : round1((repliedCount / reviews.length) * 100),
    pendingCount,
    pendingPercentage: reviews.length === 0 ? 0 : round1((pendingCount / reviews.length) * 100),
    todayCount,
  };
}

// ---------------------------------------------------------------------------
// Rango de fechas de las métricas
// ---------------------------------------------------------------------------

export type DateRange = {
  /** "YYYY-MM-DD" inclusive (00:00:00 UTC). Vacío/null = sin límite inferior. */
  desde?: string | null;
  /** "YYYY-MM-DD" inclusive (23:59:59.999 UTC). Vacío/null = sin límite superior. */
  hasta?: string | null;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Un día es válido solo si tiene forma de fecha Y existe en el calendario. */
function esDiaValido(valor: string | null | undefined): valor is string {
  if (typeof valor !== "string" || !ISO_DAY.test(valor)) return false;
  return !Number.isNaN(Date.parse(`${valor}T00:00:00.000Z`));
}

/**
 * Filtra reseñas por rango de fechas de publicación, con bordes INCLUSIVE en
 * UTC (un "hasta 16/09" incluye las 23:59:59.999 de ese día).
 *
 * Sin `desde` ni `hasta` devuelve la lista completa: el default del panel es
 * "todo el historial", no un rango inventado.
 *
 * Un rango invertido (`desde > hasta`) devuelve lista vacía en vez de cambiar
 * los límites por detrás: la UI impide invertido, y si llega por URL lo que se
 * ve es 0, no un rango distinto del pedido.
 */
export function filterReviewsByDateRange(
  reviews: Review[],
  range: DateRange,
): Review[] {
  const desde = esDiaValido(range.desde) ? range.desde : null;
  const hasta = esDiaValido(range.hasta) ? range.hasta : null;

  if (desde === null && hasta === null) return reviews;
  if (desde !== null && hasta !== null && desde > hasta) return [];

  const desdeMs = desde === null ? null : Date.parse(`${desde}T00:00:00.000Z`);
  const hastaMs = hasta === null ? null : Date.parse(`${hasta}T23:59:59.999Z`);

  return reviews.filter((review) => {
    const time = new Date(review.published_at).getTime();

    // Con un rango activo, una fecha ilegible no se puede ubicar: queda fuera.
    if (Number.isNaN(time)) return false;
    if (desdeMs !== null && time < desdeMs) return false;
    if (hastaMs !== null && time > hastaMs) return false;

    return true;
  });
}

// ---------------------------------------------------------------------------
// Evolución en el tiempo (alimenta el gráfico "Evolución de las reseñas")
// ---------------------------------------------------------------------------

export type SeriesPoint = {
  /** Día UTC con formato "dd/MM". */
  label: string;
  /** Reseñas publicadas ese día. */
  total: number;
  /**
   * Promedio de estrellas del día con 1 decimal, o `null` si ese día no tuvo
   * ninguna calificada (RN-05: nunca `0`).
   */
  promedio: number | null;
};

/**
 * Serie de reseñas por día entre la primera y la última publicación (ambos
 * días INCLUSIVE, en UTC). Los días sin reseñas aparecen con `total: 0` para
 * no maquillar la sparsidad: un hueco real se ve como un valle, no se esconde.
 *
 * Pura a propósito, igual que el resto del módulo: un gráfico honesto sale de
 * una función testable con `expect` sin mocks.
 */
export function calculateSeriesOverTime(reviews: Review[]): SeriesPoint[] {
  if (reviews.length === 0) return [];

  const times = reviews.map((r) => new Date(r.published_at).getTime());
  const start = new Date(Math.min(...times));
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(Math.max(...times));
  end.setUTCHours(0, 0, 0, 0);

  const byDay = new Map<string, Review[]>();
  for (const review of reviews) {
    const key = new Date(review.published_at).toISOString().slice(0, 10);
    const bucket = byDay.get(key) ?? [];
    bucket.push(review);
    byDay.set(key, bucket);
  }

  const points: SeriesPoint[] = [];
  for (let day = new Date(start); day.getTime() <= end.getTime(); day.setUTCDate(day.getUTCDate() + 1)) {
    const key = day.toISOString().slice(0, 10);
    const dayReviews = byDay.get(key) ?? [];
    const rated = dayReviews.filter((r) => r.rating !== null);

    points.push({
      label: `${key.slice(8, 10)}/${key.slice(5, 7)}`, // "YYYY-MM-DD" → "DD/MM"
      total: dayReviews.length,
      promedio:
        rated.length === 0
          ? null
          : round1(rated.reduce((sum, r) => sum + (r.rating as number), 0) / rated.length),
    });
  }

  return points;
}
