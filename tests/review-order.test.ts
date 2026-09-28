import { describe, expect, it } from "vitest";

import { compareReviewsByPriority, prioridadEstrellas } from "@/lib/review-order";
import type { Review } from "@/lib/types/review";

/**
 * Tests del ordenamiento de la bandeja (design-system §1): estrellas
 * ascendentes (1, 2, 3, sin calificación, 4, 5), pendientes antes que
 * respondidas, y `published_at` descendente dentro de cada rango.
 */

function review(partial: Partial<Review> & { id: string }): Review {
  return {
    location_id: "loc-1",
    author: "Cliente",
    rating: 4,
    text: "Texto",
    published_at: "2026-09-10T12:00:00Z",
    updated_at: "2026-09-10T12:00:00Z",
    reply_text: null,
    replied_at: null,
    ...partial,
  };
}

function sortIds(reviews: Review[]): string[] {
  return reviews.sort(compareReviewsByPriority).map((r) => r.id);
}

describe("prioridadEstrellas", () => {
  it("orden ascendente estricto: 1, 2, 3, null, 4, 5", () => {
    expect(prioridadEstrellas(1)).toBe(0);
    expect(prioridadEstrellas(2)).toBe(1);
    expect(prioridadEstrellas(3)).toBe(2);
    expect(prioridadEstrellas(null)).toBe(3);
    expect(prioridadEstrellas(4)).toBe(4);
    expect(prioridadEstrellas(5)).toBe(5);
  });
});

describe("compareReviewsByPriority — listado", () => {
  it("ordena estrictamente por estrellas: 1, luego 2, luego 3", () => {
    const una = review({ id: "una", rating: 1, published_at: "2026-09-09T12:00:00Z" });
    const dos = review({ id: "dos", rating: 2, published_at: "2026-09-10T12:00:00Z" });
    const tres = review({ id: "tres", rating: 3, published_at: "2026-09-11T12:00:00Z" });

    expect(sortIds([tres, una, dos])).toEqual(["una", "dos", "tres"]);
  });

  it("una de 1 estrella gana a una de 5 aunque sea más vieja", () => {
    const reclamo = review({ id: "reclamo", rating: 1, published_at: "2026-09-01T12:00:00Z" });
    const positiva = review({ id: "positiva", rating: 5, published_at: "2026-09-10T12:00:00Z" });

    expect(sortIds([positiva, reclamo])).toEqual(["reclamo", "positiva"]);
  });

  it("sin calificación va entre 3 estrellas y 4-5", () => {
    const tres = review({ id: "tres", rating: 3, published_at: "2026-09-01T12:00:00Z" });
    const sin = review({ id: "sin", rating: null, published_at: "2026-09-05T12:00:00Z" });
    const alta = review({ id: "alta", rating: 5, published_at: "2026-09-10T12:00:00Z" });

    expect(sortIds([alta, sin, tres])).toEqual(["tres", "sin", "alta"]);
  });

  it("las pendientes van antes que las respondidas aunque la respondida sea un reclamo", () => {
    const pendiente = review({ id: "pendiente", rating: 5 });
    const respondida = review({
      id: "respondida",
      rating: 1,
      reply_text: "Gracias",
      replied_at: "2026-09-10T12:00:00Z",
    });

    expect(sortIds([respondida, pendiente])).toEqual(["pendiente", "respondida"]);
  });

  it("dentro del mismo rango, más recientes primero", () => {
    const vieja = review({ id: "vieja", rating: 3, published_at: "2026-09-01T12:00:00Z" });
    const nueva = review({ id: "nueva", rating: 3, published_at: "2026-09-10T12:00:00Z" });

    expect(sortIds([vieja, nueva])).toEqual(["nueva", "vieja"]);
  });
});