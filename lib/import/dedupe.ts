import type { SourceReview } from '@/lib/types/review';

/**
 * RN-01. Deduplicación por `updated_at` más reciente.
 *
 * Módulo puro a propósito: no toca Supabase y por eso no lleva el guard
 * `server-only`. La regla de negocio no es código de servidor, y meterla
 * detrás de un guard obligaría a cada test a stubbear el guard para poder
 * ejercitar la regla.
 */

/**
 * Si dos registros comparten `id`, gana el `updated_at` más reciente.
 *
 * Los timestamps se comparan como strings porque todos llegan en el mismo
 * formato ISO 8601 con zona `Z`, así que el orden lexicográfico coincide con
 * el cronológico. No hace falta `new Date()`: es más lento y no aporta nada.
 */
export function dedupeReviews(reviews: SourceReview[]): {
  unique: SourceReview[];
  duplicates: number;
} {
  const byId = new Map<string, SourceReview>();

  for (const review of reviews) {
    const existing = byId.get(review.id);
    if (!existing || review.updated_at > existing.updated_at) {
      byId.set(review.id, review);
    }
  }

  return { unique: [...byId.values()], duplicates: reviews.length - byId.size };
}
