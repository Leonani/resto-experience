import { describe, expect, it } from "vitest";

import { calculateLocationSummary } from "@/lib/metrics";
import { isResponded, type Review } from "@/lib/types/review";

/**
 * Tests de las reglas sucias. Verifican los valores de la tabla de referencia
 * de PLAN_EJECUCION.md sin necesidad de una base de datos: `calculateLocationSummary`
 * es pura a propósito.
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

describe("RN-05 — sede sin reseñas", () => {
  it("devuelve null y 0%, nunca 0.0", () => {
    const summary = calculateLocationSummary("loc-2", []);

    expect(summary.averageRating).toBeNull();
    expect(summary.averageRating).not.toBe(0);
    expect(summary.totalReviews).toBe(0);
    expect(summary.replyPercentage).toBe(0);
  });

  it("devuelve null si la sede tiene reseñas pero ninguna calificada", () => {
    const reviews = [
      review({ id: "a", rating: null }),
      review({ id: "b", rating: null }),
      review({ id: "c", rating: null }),
    ];

    const summary = calculateLocationSummary("loc-1", reviews);

    expect(summary.totalReviews).toBe(3);
    expect(summary.ratedReviews).toBe(0);
    expect(summary.averageRating).toBeNull();
  });
});

describe("RN-03 — rating null no entra al promedio", () => {
  it("excluye del promedio pero cuenta en el total", () => {
    const reviews = [
      review({ id: "a", rating: 4 }),
      review({ id: "b", rating: null }),
      review({ id: "c", rating: 5 }),
    ];

    const summary = calculateLocationSummary("loc-1", reviews);

    expect(summary.totalReviews).toBe(3);
    expect(summary.ratedReviews).toBe(2);
    expect(summary.averageRating).toBe(4.5);
  });

  it("un rating null no arrastra el promedio hacia cero", () => {
    const conNull = calculateLocationSummary("loc-1", [
      review({ id: "a", rating: 5 }),
      review({ id: "b", rating: null }),
    ]);

    // Si el null se tratara como 0, el promedio sería 2.5.
    expect(conNull.averageRating).toBe(5);
  });
});

describe("Tabla de referencia — Palermo", () => {
  it("3.63 sobre 8 calificadas de 9 reseñas, 22.2% respondidas", () => {
    // 9 reseñas, 8 calificadas, suma 29.
    const reviews: Review[] = [
      review({ id: "1", rating: 4 }),
      review({ id: "2", rating: 5 }),
      review({ id: "3", rating: 3 }),
      review({ id: "4", rating: 2 }),
      review({ id: "5", rating: 4 }),
      review({ id: "6", rating: 5 }),
      review({ id: "7", rating: 2 }),
      review({ id: "8", rating: 4, reply_text: "Gracias", replied_at: "2026-09-11T10:00:00Z" }),
      review({ id: "9", rating: null, reply_text: "Gracias", replied_at: "2026-09-11T11:00:00Z" }),
    ];
    // Suma = 4+5+3+2+4+5+2+4 = 29 sobre 8 calificadas.

    const summary = calculateLocationSummary("loc-1", reviews);

    expect(summary.totalReviews).toBe(9);
    expect(summary.ratedReviews).toBe(8);
    expect(summary.averageRating).toBe(3.63);
    expect(summary.repliedCount).toBe(2);
    expect(summary.replyPercentage).toBe(22.2);
  });
});

describe("Tabla de referencia — Centro", () => {
  it("3.67 sobre 6 reseñas, 16.7% respondidas", () => {
    const reviews: Review[] = [
      review({ id: "1", location_id: "loc-3", rating: 4 }),
      review({ id: "2", location_id: "loc-3", rating: 3 }),
      review({ id: "3", location_id: "loc-3", rating: 5 }),
      review({ id: "4", location_id: "loc-3", rating: 4 }),
      review({ id: "5", location_id: "loc-3", rating: 2 }),
      review({ id: "6", location_id: "loc-3", rating: 4, reply_text: "Gracias", replied_at: "2026-09-11T10:00:00Z" }),
    ];
    // Suma = 4+3+5+4+2+4 = 22 sobre 6.

    const summary = calculateLocationSummary("loc-3", reviews);

    expect(summary.totalReviews).toBe(6);
    expect(summary.ratedReviews).toBe(6);
    expect(summary.averageRating).toBe(3.67);
    expect(summary.replyPercentage).toBe(16.7);
  });
});

describe("Aislamiento entre sedes", () => {
  it("solo cuenta las reseñas de la sede pedida", () => {
    const reviews = [
      review({ id: "1", location_id: "loc-1", rating: 5 }),
      review({ id: "2", location_id: "loc-3", rating: 1 }),
      review({ id: "3", location_id: "loc-3", rating: 1 }),
    ];

    expect(calculateLocationSummary("loc-1", reviews).totalReviews).toBe(1);
    expect(calculateLocationSummary("loc-3", reviews).totalReviews).toBe(2);
    expect(calculateLocationSummary("loc-2", reviews).totalReviews).toBe(0);
  });
});

describe("RN-04 — text vacío sigue siendo una reseña", () => {
  it("cuenta en el total y habilita respuesta", () => {
    const reviews = [
      review({ id: "a", rating: 5, text: "" }),
      review({ id: "b", rating: 4, text: "Muy bueno" }),
    ];

    const summary = calculateLocationSummary("loc-1", reviews);

    expect(summary.totalReviews).toBe(2);
    expect(summary.ratedReviews).toBe(2);
    expect(summary.averageRating).toBe(4.5);
  });
});

describe("isResponded — respuesta vacía es pendiente", () => {
  it("trata el texto en blanco como no respondida", () => {
    expect(isResponded({ reply_text: null })).toBe(false);
    expect(isResponded({ reply_text: "" })).toBe(false);
    expect(isResponded({ reply_text: "   " })).toBe(false);
    expect(isResponded({ reply_text: "Gracias" })).toBe(true);
  });
});
