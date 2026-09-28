import { describe, expect, it } from "vitest";

import { dedupeReviews } from "@/lib/import/dedupe";
import type { SourceReview } from "@/lib/types/review";

function source(partial: Partial<SourceReview> & { id: string }): SourceReview {
  return {
    location_id: "loc-1",
    author: "Cliente",
    rating: 4,
    text: "Texto",
    published_at: "2026-09-10T12:00:00Z",
    updated_at: "2026-09-10T12:00:00Z",
    ...partial,
  };
}

describe("RN-01 — deduplicación por updated_at", () => {
  it("gana la versión con updated_at más reciente", () => {
    // Caso real: rv-205 aparece dos veces, la segunda resolvió el problema.
    const reviews = [
      source({ id: "rv-205", rating: 1, updated_at: "2026-09-11T22:40:00Z" }),
      source({ id: "rv-205", rating: 3, updated_at: "2026-09-13T09:05:00Z" }),
    ];

    const { unique, duplicates } = dedupeReviews(reviews);

    expect(unique).toHaveLength(1);
    expect(unique[0].rating).toBe(3);
    expect(unique[0].updated_at).toBe("2026-09-13T09:05:00Z");
    expect(duplicates).toBe(1);
  });

  it("funciona aunque la versión más reciente venga primero", () => {
    const reviews = [
      source({ id: "rv-205", rating: 3, updated_at: "2026-09-13T09:05:00Z" }),
      source({ id: "rv-205", rating: 1, updated_at: "2026-09-11T22:40:00Z" }),
    ];

    const { unique } = dedupeReviews(reviews);

    expect(unique[0].rating).toBe(3);
  });

  it("con igual updated_at conserva la primera", () => {
    const reviews = [
      source({ id: "a", rating: 1, updated_at: "2026-09-13T09:05:00Z" }),
      source({ id: "a", rating: 5, updated_at: "2026-09-13T09:05:00Z" }),
    ];

    const { unique } = dedupeReviews(reviews);

    // Empate: no hay dato que diga cuál es la correcta. Conservar la primera
    // es determinista; la alternativa sería arbitraria.
    expect(unique[0].rating).toBe(1);
  });

  it("no descarta reseñas con ids distintos", () => {
    const reviews = [
      source({ id: "a" }),
      source({ id: "b" }),
      source({ id: "c" }),
    ];

    const { unique, duplicates } = dedupeReviews(reviews);

    expect(unique).toHaveLength(3);
    expect(duplicates).toBe(0);
  });

  it("cuenta los duplicados de una entrada con tres versiones", () => {
    const reviews = [
      source({ id: "a", updated_at: "2026-09-01T00:00:00Z" }),
      source({ id: "a", updated_at: "2026-09-03T00:00:00Z" }),
      source({ id: "a", updated_at: "2026-09-02T00:00:00Z" }),
    ];

    const { unique, duplicates } = dedupeReviews(reviews);

    expect(unique).toHaveLength(1);
    expect(unique[0].updated_at).toBe("2026-09-03T00:00:00Z");
    expect(duplicates).toBe(2);
  });
});
