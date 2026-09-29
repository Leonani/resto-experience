import { describe, expect, it } from "vitest";

import {
  checkAiBudget,
  countRealAiAttempts,
  DEFAULT_BUDGET_PER_DAY,
  DEFAULT_BUDGET_PER_HOUR,
  readAiBudget,
  type AiAttemptCount,
} from "@/lib/draft/budget";

/**
 * Tests de la protección de costos (lib/draft/budget.ts).
 *
 * El contador consulta `audit_logs` con supabase-js, así que se testea con un
 * cliente falso que encadena `.from().select().eq()/.not().gte()` y devuelve
 * respuestas de count que se van consumiendo en orden. `checkAiBudget` es
 * directamente puro salvo la inyección del contador.
 */

function countClient(responses: AiAttemptCount[]) {
  let n = 0;
  // Los métodos encadenados devuelven el mismo builder; `gte` es el único que
  // resuelve, y cada consulta consume la siguiente respuesta.
  const query = {
    eq: () => query,
    not: () => query,
    gte: async () => responses[n++] ?? { count: 0, error: null },
  };
  return { from: () => ({ select: () => query }) };
}

const always = (count: number): AiAttemptCount => ({ count, error: null });
const seq = (...responses: AiAttemptCount[]): ((fromIso: string) => Promise<AiAttemptCount>) => {
  const queue = [...responses];
  return async () => queue.shift() ?? always(0);
};

describe("readAiBudget", () => {
  it("usa los defaults con entorno vacío", () => {
    expect(readAiBudget({})).toEqual({
      maxPerHour: DEFAULT_BUDGET_PER_HOUR,
      maxPerDay: DEFAULT_BUDGET_PER_DAY,
    });
  });

  it("respeta los límites configurados", () => {
    const budget = readAiBudget({ LLM_BUDGET_PER_HOUR: "5", LLM_BUDGET_PER_DAY: "40" });

    expect(budget.maxPerHour).toBe(5);
    expect(budget.maxPerDay).toBe(40);
  });

  it("los valores inválidos caen a los defaults, nunca a 'ilimitado'", () => {
    expect(readAiBudget({ LLM_BUDGET_PER_HOUR: "0" }).maxPerHour).toBe(DEFAULT_BUDGET_PER_HOUR);
    expect(readAiBudget({ LLM_BUDGET_PER_HOUR: "-3" }).maxPerHour).toBe(DEFAULT_BUDGET_PER_HOUR);
    expect(readAiBudget({ LLM_BUDGET_PER_HOUR: "abc" }).maxPerHour).toBe(DEFAULT_BUDGET_PER_HOUR);
    expect(readAiBudget({ LLM_BUDGET_PER_DAY: "NaN" }).maxPerDay).toBe(DEFAULT_BUDGET_PER_DAY);
  });
});

describe("countRealAiAttempts", () => {
  it("suma los intentos IA exitosos y los fallidos del log", async () => {
    const client = countClient([always(7), always(3)]);

    const result = await countRealAiAttempts(client, "2026-09-01T00:00:00Z");

    expect(result).toEqual({ count: 10, error: null });
  });

  it("propaga un error del count", async () => {
    const client = countClient([{ count: null, error: { message: "boom" } }, always(0)]);

    const result = await countRealAiAttempts(client, "2026-09-01T00:00:00Z");

    expect(result).toEqual({ count: null, error: { message: "boom" } });
  });
});

describe("checkAiBudget", () => {
  const budget = { maxPerHour: DEFAULT_BUDGET_PER_HOUR, maxPerDay: DEFAULT_BUDGET_PER_DAY };

  it("permite la IA cuando hay margen en ambas ventanas", async () => {
    const verdict = await checkAiBudget(seq(always(5), always(30)), budget);

    expect(verdict).toEqual({ allowed: true, reason: null });
  });

  it("bloquea al alcanzar el límite por hora", async () => {
    const verdict = await checkAiBudget(seq(always(DEFAULT_BUDGET_PER_HOUR), always(0)), budget);

    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("por hora");
  });

  it("bloquea al alcanzar el límite por día", async () => {
    const verdict = await checkAiBudget(seq(always(1), always(DEFAULT_BUDGET_PER_DAY)), budget);

    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("por día");
  });

  it("falla cerrado si no se puede leer el contador por hora", async () => {
    const verdict = await checkAiBudget(
      seq({ count: null, error: { message: "boom" } }),
      budget,
    );

    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("No se pudo verificar");
  });

  it("falla cerrado si no se puede leer el contador por día", async () => {
    const verdict = await checkAiBudget(seq(always(1), { count: null, error: { message: "boom" } }), budget);

    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("No se pudo verificar");
  });
});