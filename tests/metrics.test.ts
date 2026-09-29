import { describe, expect, it } from "vitest";

import {
  calculateLocationSummary,
  calculateOverallSummary,
  calculateRatingDistribution,
  calculateRatingsByLocation,
  calculateSeriesOverTime,
  filterReviewsByDateRange,
  RATING_BUCKETS,
} from "@/lib/metrics";
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

describe("Distribución de calificaciones", () => {
  const reviews: Review[] = [
    review({ id: "a", rating: 5 }),
    review({ id: "b", rating: 5 }),
    review({ id: "c", rating: 4 }),
    review({ id: "d", rating: 3 }),
    review({ id: "e", rating: 1 }),
    review({ id: "f", rating: null }),
  ];

  it("cuenta cada valor en su bucket, en el orden canónico", () => {
    const dist = calculateRatingDistribution(reviews);
    const byRating = new Map(dist.map((b) => [b.rating, b.count]));

    expect(byRating.get(5)).toBe(2);
    expect(byRating.get(4)).toBe(1);
    expect(byRating.get(3)).toBe(1);
    expect(byRating.get(2)).toBe(0);
    expect(byRating.get(1)).toBe(1);
    expect(byRating.get(null)).toBe(1);
  });

  it("cada bucket cae en exactamente una categoría (suma = total)", () => {
    const dist = calculateRatingDistribution(reviews);
    const total = dist.reduce((sum, b) => sum + b.count, 0);

    expect(total).toBe(reviews.length);
  });

  it("existe el orden 5, 4, 3, 2, 1, sin calificación", () => {
    expect(RATING_BUCKETS.map((b) => b.rating)).toEqual([5, 4, 3, 2, 1, null]);
  });

  it("sede sin reseñas devuelve todos los buckets en 0", () => {
    const dist = calculateRatingDistribution([]);

    expect(dist.every((b) => b.count === 0)).toBe(true);
  });

  it("calculateRatingsByLocation aísla por sede (misma fuente que las donas y barras)", () => {
    const data = calculateRatingsByLocation(["loc-1", "loc-2"], [
      review({ id: "a", location_id: "loc-1", rating: 5 }),
      review({ id: "b", location_id: "loc-2", rating: 3 }),
      review({ id: "c", location_id: "loc-1", rating: null }),
    ]);

    const palermo = data.find((d) => d.locationId === "loc-1")!;
    const belgrano = data.find((d) => d.locationId === "loc-2")!;

    const count = (buckets: typeof palermo.buckets, rating: number | null) =>
      buckets.find((b) => b.rating === rating)!.count;

    expect(count(palermo.buckets, 5)).toBe(1);
    expect(count(palermo.buckets, null)).toBe(1);
    expect(palermo.buckets.reduce((s, b) => s + b.count, 0)).toBe(2);

    expect(count(belgrano.buckets, 3)).toBe(1);
    expect(belgrano.buckets.reduce((s, b) => s + b.count, 0)).toBe(1);
  });
});

describe("Resumen global (KPIs del panel)", () => {
  it("con dataset mixto: total, promedio, % respondido y pendientes consistentes", () => {
    const reviews: Review[] = [
      review({ id: "1", rating: 5 }),
      review({ id: "2", rating: 4 }),
      review({ id: "3", rating: null }),
      review({ id: "4", rating: 3, reply_text: "Gracias", replied_at: "2026-09-11T10:00:00Z" }),
      review({ id: "5", rating: 1 }),
    ];
    // Pendientes = respondidas (1) vs total (5) => 4. Total = 5, prom = (5+4+3+1)/4 = 3.25.
    const overall = calculateOverallSummary(reviews);

    expect(overall.totalReviews).toBe(5);
    expect(overall.ratedReviews).toBe(4);
    expect(overall.averageRating).toBe(3.25);
    expect(overall.repliedCount).toBe(1);
    expect(overall.replyPercentage).toBe(20);
    expect(overall.pendingCount).toBe(4);
    expect(overall.pendingPercentage).toBe(80);
  });

  it("sin reseñas: total 0, promedio null (nunca 0.0) y hoy 0", () => {
    const overall = calculateOverallSummary([], new Date("2026-09-28T12:00:00Z"));

    expect(overall.totalReviews).toBe(0);
    expect(overall.averageRating).toBeNull();
    expect(overall.replyPercentage).toBe(0);
    expect(overall.pendingCount).toBe(0);
    expect(overall.todayCount).toBe(0);
  });

  it("cuenta solo lo publicado el mismo día que `now`, en el límite UTC", () => {
    const overall = calculateOverallSummary(
      [
        review({ id: "a", published_at: "2026-09-28T15:00:00.000Z" }),
        review({ id: "b", published_at: "2026-09-28T23:59:59.999Z" }),
        review({ id: "c", published_at: "2026-09-28T00:00:00.000Z" }),
        review({ id: "d", published_at: "2026-09-27T23:59:59.999Z" }),
      ],
      new Date("2026-09-28T12:00:00.000Z"),
    );

    expect(overall.todayCount).toBe(3);
  });
});

describe("calculateSeriesOverTime — evolución por día", () => {
  it("devuelve lista vacía si no hay reseñas", () => {
    expect(calculateSeriesOverTime([])).toEqual([]);
  });

  it("cubre el rango entero inclusive con los huecos como total 0", () => {
    const series = calculateSeriesOverTime([
      review({ id: "a", published_at: "2026-09-02T15:00:00.000Z" }),
      review({ id: "b", published_at: "2026-09-02T01:00:00.000Z" }),
      review({ id: "c", published_at: "2026-09-04T10:00:00.000Z" }),
    ]);

    expect(series.map((p) => [p.label, p.total])).toEqual([
      ["02/09", 2],
      ["03/09", 0],
      ["04/09", 1],
    ]);
  });

  it("promedia con 1 decimal solo las calificadas del día", () => {
    const series = calculateSeriesOverTime([
      review({ id: "a", rating: 5, published_at: "2026-09-10T10:00:00.000Z" }),
      review({ id: "b", rating: 4, published_at: "2026-09-10T11:00:00.000Z" }),
      review({ id: "c", rating: null, published_at: "2026-09-10T12:00:00.000Z" }),
    ]);

    expect(series).toHaveLength(1);
    expect(series[0].total).toBe(3);
    expect(series[0].promedio).toBe(4.5);
  });

  it("deja promedio null en un día sin calificadas (RN-05)", () => {
    const series = calculateSeriesOverTime([
      review({ id: "a", rating: null, published_at: "2026-09-10T10:00:00.000Z" }),
    ]);

    expect(series[0].promedio).toBeNull();
    expect(series[0].promedio).not.toBe(0);
  });

  it("usa días UTC: 23:59 local de un día no se mezcla con el otro", () => {
    const series = calculateSeriesOverTime([
      review({ id: "a", published_at: "2026-09-01T23:59:59.000Z" }),
      review({ id: "b", published_at: "2026-09-02T00:00:00.000Z" }),
    ]);

    expect(series.map((p) => p.label)).toEqual(["01/09", "02/09"]);
    expect(series[0].total).toBe(1);
    expect(series[1].total).toBe(1);
  });
});

describe("filterReviewsByDateRange — filtro de fechas de las métricas", () => {
  const reviews = [
    review({ id: "a", published_at: "2026-09-01T12:00:00.000Z" }),
    review({ id: "b", published_at: "2026-09-10T23:59:59.999Z" }),
    review({ id: "c", published_at: "2026-09-16T18:00:00.000Z" }),
  ];

  it("sin rango devuelve todo (default = historial completo)", () => {
    expect(filterReviewsByDateRange(reviews, {})).toHaveLength(3);
    expect(filterReviewsByDateRange(reviews, { desde: null, hasta: null })).toHaveLength(3);
  });

  it("incluye los bordes: desde 00:00:00 y hasta 23:59:59.999", () => {
    const enRango = filterReviewsByDateRange(reviews, {
      desde: "2026-09-10",
      hasta: "2026-09-10",
    });

    expect(enRango.map((r) => r.id)).toEqual(["b"]);
  });

  it("ignora fechas inválidas en vez de devolver todo en silencio", () => {
    const enRango = filterReviewsByDateRange(reviews, { desde: "10/09/2026" });

    expect(enRango).toHaveLength(3);
    expect(filterReviewsByDateRange(reviews, { desde: "2026-13-45" })).toHaveLength(3);
  });

  it("rango invertido devuelve vacío, no cambia los límites", () => {
    expect(
      filterReviewsByDateRange(reviews, { desde: "2026-09-16", hasta: "2026-09-01" }),
    ).toEqual([]);
  });

  it("soporta rango abierto por un solo lado", () => {
    expect(
      filterReviewsByDateRange(reviews, { desde: "2026-09-10" }).map((r) => r.id),
    ).toEqual(["b", "c"]);
    expect(
      filterReviewsByDateRange(reviews, { hasta: "2026-09-01" }).map((r) => r.id),
    ).toEqual(["a"]);
  });
});
