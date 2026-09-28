import { isResponded } from "@/lib/types/review";

/**
 * Ordenamiento de la bandeja (design-system §1).
 *
 * Orden estricto ascendente por estrellas: 1, 2, 3, sin calificación, 4 y
 * finalmente 5. Los reclamos de menos estrellas van arriba porque dejar a un
 * cliente enojado sin respuesta es más costoso que una reseña positiva sin
 * responder. `rating: null` (RN-03) no es un reclamo ni un elogio: no
 * clasifica como mal servicio, por eso queda entre 3 y 4.
 */

export type ReviewForSorting = {
  rating: number | null;
  published_at: string;
  reply_text: string | null;
};

export function prioridadEstrellas(rating: number | null): number {
  if (rating === null) return 3;
  if (rating <= 3) return rating - 1;
  return rating;
}

/**
 * Comparador puro: pendientes primero, respondidas después. Dentro de cada
 * grupo, orden ascendente estricto por estrellas (1, 2, 3, sin calificación,
 * 4, 5); dentro del mismo rango, más recientes primero.
 */
export function compareReviewsByPriority(
  a: ReviewForSorting,
  b: ReviewForSorting,
): number {
  const aRespondida = isResponded(a) ? 1 : 0;
  const bRespondida = isResponded(b) ? 1 : 0;
  if (aRespondida !== bRespondida) return aRespondida - bRespondida;

  const aPrioridad = prioridadEstrellas(a.rating);
  const bPrioridad = prioridadEstrellas(b.rating);
  if (aPrioridad !== bPrioridad) return aPrioridad - bPrioridad;

  return b.published_at.localeCompare(a.published_at);
}