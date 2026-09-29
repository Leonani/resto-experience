import { describe, expect, it } from "vitest";

import { dedupeReviews } from "@/lib/import/dedupe";
import {
  importReviewsFile,
  upsertReviews,
  type ImportClient,
} from "@/lib/import/reviews";
import type {
  ReviewsFile,
  SourceLocation,
  SourceRestaurant,
  SourceReview,
} from "@/lib/types/review";

/**
 * RN-01 se testea sobre el módulo puro (`dedupeReviews`), sin nada que stubbear.
 *
 * RN-02, la idempotencia y la preservación de respuestas viven en
 * `lib/import/reviews.ts`, que sí habla con Supabase. Se testea con un cliente
 * falso **con estado**: tablas en memoria donde `upsert` hace merge por `id`,
 * que es lo que hace Postgres con `onConflict: 'id'`.
 *
 * El estado es lo que hace que los tests signifiquen algo. Un fake que solo
 * registrara llamadas podría comprobar "se llamó upsert", pero no podría
 * comparar la base después del run 2 contra la del run 1 — que es exactamente
 * la definición de idempotencia.
 */

type Row = Record<string, unknown>;

type FakeDb = {
  client: ImportClient;
  /** Filas guardadas de `reviews`, por id. */
  reviews: Map<string, Row>;
  /** Filas guardadas de `locations`, por id. */
  locations: Map<string, Row>;
  restaurants: Map<string, Row>;
  /** Errores inyectables, para probar los caminos de fallo. */
  fail: {
    selectReviews: { message: string } | null;
    upsertReviews: { message: string } | null;
  };
  /** Filas que llegaron a cada `upsert`, para asertar qué se intentó escribir. */
  upserted: { table: string; rows: Row[] }[];
};

function createFakeDb(seed: { reviews?: Row[]; locations?: Row[] } = {}): FakeDb {
  const toMap = (rows: Row[] = []) =>
    new Map(rows.map((row) => [String(row.id), { ...row }]));

  const reviews = toMap(seed.reviews);
  const locations = toMap(seed.locations);
  const restaurants = toMap();
  const upserted: { table: string; rows: Row[] }[] = [];

  const fail = {
    selectReviews: null as { message: string } | null,
    upsertReviews: null as { message: string } | null,
  };

  const client: ImportClient = {
    from: (table) => ({
      select: (columns) => {
        if (table === 'reviews' && fail.selectReviews) {
          return Promise.resolve({ data: null, error: fail.selectReviews });
        }

        const table_ =
          table === 'reviews' ? reviews : table === 'locations' ? locations : restaurants;

        // El importador solo pide `id, reply_text, replied_at`; se devuelve la
        // fila completa porque un select más amplio no cambia lo que se prueba.
        return Promise.resolve({
          data: [...table_.values()].map((row) => ({ ...row, _selected: columns })),
          error: null,
        });
      },

      upsert: (rows, options) => {
        // El fake solo mergea por `id` si el código pide `onConflict: 'id'`.
        // Sin esto, simularía un insert que Postgres rechazaría, y los tests de
        // idempotencia pasarían por una razón equivocada.
        if (options?.onConflict !== "id") {
          throw new Error(
            `upsert en ${table} sin onConflict: 'id' (recibido: ${JSON.stringify(options)})`,
          );
        }

        if (table === "reviews" && fail.upsertReviews) {
          return Promise.resolve({ error: fail.upsertReviews });
        }

        upserted.push({ table, rows: rows.map((row) => ({ ...row })) });

        const target =
          table === 'reviews' ? reviews : table === 'locations' ? locations : restaurants;

        // `onConflict: 'id'` en Postgres: la fila entrante pisa la existente.
        for (const row of rows) {
          target.set(String(row.id), { ...row });
        }

        return Promise.resolve({ error: null });
      },
    }),
  };

  return { client, reviews, locations, restaurants, fail, upserted };
}

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

function location(partial: Partial<SourceLocation> & { id: string }): SourceLocation {
  return {
    restaurant_id: "rest-1",
    name: "Sede",
    ...partial,
  };
}

function restaurant(partial: Partial<SourceRestaurant> & { id: string }): SourceRestaurant {
  return { name: "Restaurante", ...partial };
}

function file(partial: Partial<ReviewsFile> = {}): ReviewsFile {
  return {
    restaurants: [restaurant({ id: "rest-1" })],
    locations: [location({ id: "loc-1" })],
    reviews: [source({ id: "rv-1" })],
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

describe("RN-02 — la sede inexistente se descarta y no se crea", () => {
  it("no importa la reseña y dice por qué", async () => {
    const db = createFakeDb();

    const result = await importReviewsFile(
      file({ reviews: [source({ id: "rv-301", location_id: "loc-99" })] }),
      db.client,
    );

    expect(result.error).toBeNull();
    expect(result.outcome.skipped).toBe(1);
    expect(result.outcome.skippedDetails[0]).toMatchObject({
      reviewId: "rv-301",
      reason: "LOCATION_NOT_FOUND",
    });
    expect(result.outcome.skippedDetails[0].detail).toContain("loc-99");
    expect(db.reviews.has("rv-301")).toBe(false);
  });

  // El corazón de la regla: no solo que la reseña no entre, sino que la sede
  // tampoco se fabrique. Una sede creada por un error de tipeo tendría métricas
  // propias que el gerente leería como reales.
  it("nunca crea la sede que la reseña pedía", async () => {
    const db = createFakeDb();

    await importReviewsFile(
      file({ reviews: [source({ id: "rv-301", location_id: "loc-99" })] }),
      db.client,
    );

    expect(db.locations.has("loc-99")).toBe(false);
    expect([...db.locations.keys()]).toEqual(["loc-1"]);
  });

  // Más fuerte que "escribió una fila vacía": con todo descartado, el importador
  // ni siquiera llega a hacer upsert (corta con `rows.length === 0`).
  it("no intenta escribir nada cuando todas las reseñas se descartan", async () => {
    const db = createFakeDb();

    await importReviewsFile(
      file({ reviews: [source({ id: "rv-301", location_id: "loc-99" })] }),
      db.client,
    );

    expect(db.upserted.some((call) => call.table === "reviews")).toBe(false);
    expect(db.reviews.size).toBe(0);
  });

  it("no incluye la fila descartada entre las que escribe cuando otras sí pasan", async () => {
    const db = createFakeDb();

    await importReviewsFile(
      file({
        reviews: [source({ id: "rv-1" }), source({ id: "rv-301", location_id: "loc-99" })],
      }),
      db.client,
    );

    const written = db.upserted.find((call) => call.table === "reviews");
    expect(written?.rows.map((row) => row.id)).toEqual(["rv-1"]);
  });

  // Justifica el orden dedupe-antes-de-validar: el duplicado se colapsa primero,
  // así que la misma sede inválida no se cuenta como omitida dos veces.
  it("cuanta una vez cuando el duplicado también apunta a una sede inexistente", async () => {
    const db = createFakeDb();

    const result = await importReviewsFile(
      file({
        reviews: [
          source({ id: "rv-301", location_id: "loc-99", updated_at: "2026-09-11T00:00:00Z" }),
          source({ id: "rv-301", location_id: "loc-99", updated_at: "2026-09-13T00:00:00Z" }),
        ],
      }),
      db.client,
    );

    expect(result.outcome.duplicates).toBe(1);
    expect(result.outcome.skipped).toBe(1);
    expect(result.outcome.received).toBe(2);
  });

  it("los contadores suman exactamente received - duplicates", async () => {
    const db = createFakeDb();

    const result = await importReviewsFile(
      file({
        reviews: [
          source({ id: "rv-1" }),
          source({ id: "rv-1", updated_at: "2026-09-11T00:00:00Z" }),
          source({ id: "rv-301", location_id: "loc-99" }),
        ],
      }),
      db.client,
    );

    const { received, duplicates, inserted, skipped } = result.outcome;
    expect(received).toBe(3);
    expect(duplicates).toBe(1);
    expect(inserted + skipped).toBe(received - duplicates);
  });

  it("propaga el error si no se puede leer el estado previo, sin escribir nada", async () => {
    const db = createFakeDb();
    db.fail.selectReviews = { message: "connection refused" };

    const result = await importReviewsFile(file(), db.client);

    expect(result.error).toBe("connection refused");
    expect(result.outcome.inserted).toBe(0);
    expect(db.upserted.some((call) => call.table === "reviews")).toBe(false);
  });

  it("propaga el error del upsert sin reportar inserciones", async () => {
    const db = createFakeDb();
    db.fail.upsertReviews = { message: "duplicate key value" };

    const result = await importReviewsFile(file(), db.client);

    expect(result.error).toBe("duplicate key value");
    expect(result.outcome.inserted).toBe(0);
  });
});

describe("Preservación del trabajo del gerente", () => {
  it("la respuesta ya guardada gana sobre la del archivo", async () => {
    const db = createFakeDb({
      reviews: [
        {
          id: "rv-1",
          location_id: "loc-1",
          reply_text: "Gracias por venir, gerente.",
          replied_at: "2026-09-20T10:00:00Z",
        },
      ],
    });

    await importReviewsFile(
      file({
        reviews: [
          source({
            id: "rv-1",
            reply: { text: "Respuesta vieja del archivo", replied_at: "2026-09-01T00:00:00Z" },
          }),
        ],
      }),
      db.client,
    );

    expect(db.reviews.get("rv-1")?.reply_text).toBe("Gracias por venir, gerente.");
    expect(db.reviews.get("rv-1")?.replied_at).toBe("2026-09-20T10:00:00Z");
  });

  // El caso de alguien que edita el JSON y saca respuestas ya escritas.
  it("conserva la respuesta aunque el archivo no traiga ninguna", async () => {
    const db = createFakeDb({
      reviews: [
        { id: "rv-1", location_id: "loc-1", reply_text: "Contestada a mano", replied_at: "2026-09-20T10:00:00Z" },
      ],
    });

    await importReviewsFile(file({ reviews: [source({ id: "rv-1" })] }), db.client);

    expect(db.reviews.get("rv-1")?.reply_text).toBe("Contestada a mano");
  });

  // `isResponded` trata "" y "   " como pendiente, así que un espacio en
  // blanco en el archivo no es "respuesta" y no debe pisar la respuesta real.
  it.each([["", "cadena vacía"], ["   ", "solo espacios"]])(
    "no pisa la respuesta real con %s del archivo (%s)",
    async (replyText) => {
      const db = createFakeDb({
        reviews: [
          { id: "rv-1", location_id: "loc-1", reply_text: "La respuesta del gerente", replied_at: "2026-09-20T10:00:00Z" },
        ],
      });

      await importReviewsFile(
        file({
          reviews: [source({ id: "rv-1", reply: { text: replyText, replied_at: "2026-09-01T00:00:00Z" } })],
        }),
        db.client,
      );

      expect(db.reviews.get("rv-1")?.reply_text).toBe("La respuesta del gerente");
    },
  );

  it("la primera importación sí siembra la respuesta del archivo", async () => {
    const db = createFakeDb();

    await importReviewsFile(
      file({
        reviews: [
          source({ id: "rv-1", reply: { text: "Viene del archivo", replied_at: "2026-09-01T00:00:00Z" } }),
        ],
      }),
      db.client,
    );

    expect(db.reviews.get("rv-1")?.reply_text).toBe("Viene del archivo");
    expect(db.reviews.get("rv-1")?.replied_at).toBe("2026-09-01T00:00:00Z");
  });

  it("preserva la respuesta al reejecutar sobre el mismo archivo", async () => {
    const db = createFakeDb();
    const conReply = file({
      reviews: [source({ id: "rv-1", reply: { text: "Del archivo", replied_at: "2026-09-01T00:00:00Z" } })],
    });

    await importReviewsFile(conReply, db.client);

    // El gerente responde desde la app.
    db.reviews.set("rv-1", {
      ...(db.reviews.get("rv-1") as Row),
      reply_text: "Editada en la app",
      replied_at: "2026-09-25T12:00:00Z",
    });

    await importReviewsFile(conReply, db.client);

    expect(db.reviews.get("rv-1")?.reply_text).toBe("Editada en la app");
  });
});

describe("Idempotencia — correr dos veces deja la base igual", () => {
  it("el estado de reviews es idéntico después del segundo run", async () => {
    const db = createFakeDb();
    const reviews = [
      source({ id: "rv-1" }),
      source({ id: "rv-2", location_id: "loc-1", rating: 2 }),
      source({ id: "rv-3", location_id: "loc-1", rating: 5 }),
    ];
    const doc = file({ reviews });

    await importReviewsFile(doc, db.client);
    const afterFirst = [...db.reviews.entries()].map(([id, row]) => [id, { ...row }]);

    await importReviewsFile(doc, db.client);
    const afterSecond = [...db.reviews.entries()].map(([id, row]) => [id, { ...row }]);

    expect(afterSecond).toEqual(afterFirst);
    expect(db.reviews.size).toBe(3);
  });

  it("el segundo run no inserta nada: todo cae en updated", async () => {
    const db = createFakeDb();
    const doc = file({ reviews: [source({ id: "rv-1" }), source({ id: "rv-2" })] });

    const first = await importReviewsFile(doc, db.client);
    const second = await importReviewsFile(doc, db.client);

    expect(first.outcome.inserted).toBe(2);
    expect(first.outcome.updated).toBe(0);
    expect(second.outcome.inserted).toBe(0);
    expect(second.outcome.updated).toBe(2);
  });

  it("el catálogo no se duplica ni se toca en el segundo run", async () => {
    const db = createFakeDb();
    const doc = file({
      restaurants: [restaurant({ id: "rest-1" })],
      locations: [location({ id: "loc-1" }), location({ id: "loc-2" })],
    });

    await importReviewsFile(doc, db.client);
    const afterFirst = [...db.locations.entries()].map(([id, row]) => [id, { ...row }]);

    await importReviewsFile(doc, db.client);

    expect([...db.locations.entries()].map(([id, row]) => [id, { ...row }])).toEqual(afterFirst);
    expect(db.locations.size).toBe(2);
    expect(db.restaurants.size).toBe(1);
  });
});

describe("Acumulativo — importar otro archivo agrega, no sustituye", () => {
  it("las reseñas nuevas entran y las viejas quedan intactas", async () => {
    const db = createFakeDb();
    const original = file({ reviews: [source({ id: "rv-1" }), source({ id: "rv-2" })] });

    await importReviewsFile(original, db.client);
    db.reviews.set("rv-1", {
      ...(db.reviews.get("rv-1") as Row),
      reply_text: "Contestada",
      replied_at: "2026-09-25T12:00:00Z",
    });

    const ampliado = file({
      reviews: [source({ id: "rv-1" }), source({ id: "rv-2" }), source({ id: "rv-9" })],
    });
    const result = await importReviewsFile(ampliado, db.client);

    expect(result.outcome.inserted).toBe(1);
    expect(db.reviews.size).toBe(3);
    expect(db.reviews.get("rv-9")).toBeDefined();
    expect(db.reviews.get("rv-1")?.reply_text).toBe("Contestada");
  });

  // Este test documenta la decisión: quitar una reseña del JSON no la saca de la
  // app. El importador no pregunta "¿qué hay en la base que no esté en el
  // archivo?", así que lo que sale del archivo se queda.
  it("las reseñas que salen del archivo permanecen en la base", async () => {
    const db = createFakeDb();
    const original = file({ reviews: [source({ id: "rv-1" }), source({ id: "rv-2" }), source({ id: "rv-3" })] });

    await importReviewsFile(original, db.client);
    db.reviews.set("rv-3", {
      ...(db.reviews.get("rv-3") as Row),
      reply_text: "Contestada",
      replied_at: "2026-09-25T12:00:00Z",
    });

    const reducido = file({ reviews: [source({ id: "rv-1" })] });
    const result = await importReviewsFile(reducido, db.client);

    expect(result.outcome.inserted).toBe(0);
    expect(result.outcome.updated).toBe(1);
    expect(db.reviews.size).toBe(3);
    expect(db.reviews.has("rv-2")).toBe(true);
    expect(db.reviews.get("rv-3")?.reply_text).toBe("Contestada");
  });

  it("crea las sedes nuevas del archivo y sus reseñas dejan de saltearse", async () => {
    const db = createFakeDb();
    const original = file({
      locations: [location({ id: "loc-1" })],
      reviews: [source({ id: "rv-1" })],
    });

    await importReviewsFile(original, db.client);

    const ampliado = file({
      locations: [location({ id: "loc-1" }), location({ id: "loc-4", name: "Caballito" })],
      reviews: [source({ id: "rv-1" }), source({ id: "rv-4", location_id: "loc-4" })],
    });
    const result = await importReviewsFile(ampliado, db.client);

    expect(db.locations.has("loc-4")).toBe(true);
    expect(result.outcome.skipped).toBe(0);
    expect(db.reviews.has("rv-4")).toBe(true);
  });

  // Asimetría conocida, no corregida a propósito: `validLocationIds` se arma solo
  // con las sedes del ARCHIVO (reviews.ts:160). Quitar una sede del JSON deja la
  // fila en la base (el upsert no borra) pero suprimir las reseñas que la
  // apuntan, como si no existiera. Solo se nota al editar el JSON a mano.
  it("documenta la asimetría: quitar una sede del archivo hace saltear sus reseñas", async () => {
    const db = createFakeDb();
    const original = file({
      locations: [location({ id: "loc-1" }), location({ id: "loc-2" })],
      reviews: [source({ id: "rv-1" }), source({ id: "rv-2", location_id: "loc-2" })],
    });

    await importReviewsFile(original, db.client);
    expect(db.reviews.has("rv-2")).toBe(true);

    // El archivo deja de declarar loc-2, pero su fila sigue en la base.
    const sinLoc2 = file({
      locations: [location({ id: "loc-1" })],
      reviews: [source({ id: "rv-1" }), source({ id: "rv-2", location_id: "loc-2" })],
    });
    const result = await importReviewsFile(sinLoc2, db.client);

    expect(result.outcome.skipped).toBe(1);
    expect(db.locations.has("loc-2")).toBe(true);
    // Y rv-2 conserva la fila que tenía, con lo que el gerente ya había escrito.
    expect(db.reviews.get("rv-2")?.location_id).toBe("loc-2");
  });
});

describe("upsertReviews con el conjunto de sedes explícito", () => {
  it("acepta reseñas contra un conjunto que no viene del archivo", async () => {
    const db = createFakeDb();

    const result = await upsertReviews(
      [source({ id: "rv-1", location_id: "loc-7" })],
      new Set(["loc-7"]),
      db.client,
    );

    expect(result.error).toBeNull();
    expect(result.inserted).toBe(1);
    expect(result.skipped).toEqual([]);
  });
});
