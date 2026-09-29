import 'server-only';

import type { SkippedReview } from '@/lib/types/api';
import { dedupeReviews } from '@/lib/import/dedupe';
import type { SourceReview, ReviewsFile } from '@/lib/types/review';

/**
 * Importación de reseñas. Tres reglas en orden, y el orden importa:
 *
 *   1. Deduplicar por `updated_at` más reciente   (RN-01)
 *   2. Validar que la sede exista en el catálogo   (RN-02)
 *   3. Upsert preservando las respuestas ya guardadas
 *
 * Deduplicar ANTES de validar evita que un duplicado con sede inválida se
 * cuente dos veces como omitido. Y hace que los contadores de inserted /
 * updated / skipped sumen exactamente `received - duplicates`.
 *
 * El cliente de Supabase se INYECTA por parámetro, igual que en `lib/session.ts`:
 * `createClientAdmin()` importa `server-only` y lee el entorno, así que sin
 * inyección esta capa no se puede testear sin red. La Route Handler lo pasa.
 */

type QueryError = { message: string } | null;
type ManyResult = { data: unknown; error: QueryError };

/**
 * Subconjunto de `SupabaseClient` que usa esta capa.
 *
 * Los builders de supabase-js v2 son *thenable*, no `Promise`: por eso el
 * contrato dice `PromiseLike`. Ver la nota sobre `TS2589` en `lib/session.ts`.
 */
export type ImportClient = {
  from: (
    table: 'restaurants' | 'locations' | 'reviews',
  ) => {
    select: (columns: string) => PromiseLike<ManyResult>;
    upsert: (
      rows: Record<string, unknown>[],
      options: { onConflict: string },
    ) => PromiseLike<{ error: QueryError }>;
  };
};

/** Adaptador de `SupabaseClient` a `ImportClient`. Único casteo del módulo. */
export function asImportClient(client: unknown): ImportClient {
  return client as ImportClient;
}

/**
 * Fila de `reviews` tal como la necesita la preservación de respuestas.
 *
 * Valida la forma en runtime en vez de confiar en el tipo genérico: `data` es
 * `unknown` a propósito, porque la respuesta de PostgREST no está garantizada
 * por el compilador.
 */
function toExistingReply(value: unknown): { id: string; reply_text: string | null; replied_at: string | null } | null {
  if (!value || typeof value !== 'object') return null;

  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string') return null;

  return {
    id: row.id,
    reply_text: typeof row.reply_text === 'string' ? row.reply_text : null,
    replied_at: typeof row.replied_at === 'string' ? row.replied_at : null,
  };
}

export type ImportOutcome = {
  received: number;
  inserted: number;
  updated: number;
  skipped: number;
  duplicates: number;
  skippedDetails: SkippedReview[];
};

/**
 * Inserta o actualiza las reseñas ya deduplicadas, descartando las que
 * apuntan a una sede inexistente.
 */
export async function upsertReviews(
  reviews: SourceReview[],
  validLocationIds: Set<string>,
  supabase: ImportClient,
): Promise<{ inserted: number; updated: number; skipped: SkippedReview[]; error: string | null }> {
  // Respuestas ya guardadas, para no sobrescribirlas con las del archivo.
  const { data: existing, error: readError } = await supabase
    .from('reviews')
    .select('id, reply_text, replied_at');

  if (readError) {
    return { inserted: 0, updated: 0, skipped: [], error: readError.message };
  }

  // Una fila con una forma inesperada no es una respuesta guardada: se ignora
  // en vez de romper el import entero.
  const existingRows = (Array.isArray(existing) ? existing : [])
    .map(toExistingReply)
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const savedReplies = new Map<string, { text: string; at: string | null }>();
  for (const row of existingRows) {
    if (row.reply_text) {
      savedReplies.set(row.id, { text: row.reply_text, at: row.replied_at });
    }
  }
  const existingIds = new Set(existingRows.map((r) => r.id));

  const rows = [];
  const skipped: SkippedReview[] = [];
  let inserted = 0;
  let updated = 0;

  for (const review of reviews) {
    // RN-02. La FK de Postgres también lo rechaza, pero prevalidar produce un
    // mensaje accionable en lugar de un error de integridad opaco. Y la
    // prevalidación es la que garantiza que nunca se intente crear la sede.
    if (!validLocationIds.has(review.location_id)) {
      skipped.push({
        reviewId: review.id,
        reason: 'LOCATION_NOT_FOUND',
        detail: `La sede ${review.location_id} no existe en el catálogo. No se crea automáticamente.`,
      });
      continue;
    }

    const saved = savedReplies.get(review.id);

    rows.push({
      id: review.id,
      location_id: review.location_id,
      author: review.author,
      rating: review.rating,
      text: review.text,
      published_at: review.published_at,
      updated_at: review.updated_at,
      // Una respuesta ya escrita por una persona tiene prioridad sobre la del
      // archivo. La primera importación sí siembra las respuestas del JSON
      // (mapeando el objeto anidado `reply`); las siguientes no las pisan.
      reply_text: saved ? saved.text : (review.reply?.text ?? null),
      replied_at: saved ? saved.at : (review.reply?.replied_at ?? null),
    });

    if (existingIds.has(review.id)) updated += 1;
    else inserted += 1;
  }

  if (rows.length === 0) {
    return { inserted, updated, skipped, error: null };
  }

  const { error } = await supabase.from('reviews').upsert(rows, { onConflict: 'id' });

  if (error) {
    return { inserted: 0, updated: 0, skipped, error: error.message };
  }

  return { inserted, updated, skipped, error: null };
}

/**
 * Importación completa desde el contenido de `data/reviews.json`.
 */
export async function importReviewsFile(file: ReviewsFile, supabase: ImportClient): Promise<{
  outcome: ImportOutcome;
  restaurantsSeeded: number;
  locationsSeeded: number;
  error: string | null;
}> {
  // El catálogo se siembra desde el archivo, de forma idempotente por
  // `onConflict`. Reejecutar actualiza el nombre sin duplicar. Solo se crean
  // las sedes que el archivo declara: nunca una sede nueva por un dato sucio.
  const { error: restErr } = await supabase
    .from('restaurants')
    .upsert(
      file.restaurants.map((r) => ({ id: r.id, name: r.name })),
      { onConflict: 'id' },
    );

  if (restErr) {
    return {
      outcome: emptyOutcome(file.reviews.length),
      restaurantsSeeded: 0,
      locationsSeeded: 0,
      error: `No se pudo sembrar el catálogo de restaurantes: ${restErr.message}`,
    };
  }

  const { error: locErr } = await supabase
    .from('locations')
    .upsert(
      file.locations.map((l) => ({
        id: l.id,
        restaurant_id: l.restaurant_id,
        name: l.name,
      })),
      { onConflict: 'id' },
    );

  if (locErr) {
    return {
      outcome: emptyOutcome(file.reviews.length),
      restaurantsSeeded: file.restaurants.length,
      locationsSeeded: 0,
      error: `No se pudo sembrar el catálogo de sedes: ${locErr.message}`,
    };
  }

  // RN-01 primero.
  const { unique, duplicates } = dedupeReviews(file.reviews);
  const validLocationIds = new Set(file.locations.map((l) => l.id));

  // RN-02 y upsert después.
  const { inserted, updated, skipped, error } = await upsertReviews(
    unique,
    validLocationIds,
    supabase,
  );

  return {
    outcome: {
      received: file.reviews.length,
      inserted,
      updated,
      skipped: skipped.length,
      duplicates,
      skippedDetails: skipped,
    },
    restaurantsSeeded: file.restaurants.length,
    locationsSeeded: file.locations.length,
    error,
  };
}

function emptyOutcome(received: number): ImportOutcome {
  return {
    received,
    inserted: 0,
    updated: 0,
    skipped: 0,
    duplicates: 0,
    skippedDetails: [],
  };
}
