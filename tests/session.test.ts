import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hashSessionToken } from "@/lib/auth";
import {
  asSessionClient,
  createSession,
  getSession,
  isSessionActive,
  purgeExpiredSessions,
  revokeSession,
  type SessionClient,
} from "@/lib/session";

/**
 * Tests de la capa de sesiones sobre `auth_sessions` (lib/session.ts).
 *
 * Se testea con un cliente falso, no contra Supabase: la tabla todavía no
 * existe y aun así esta capa queda cubierta antes de crearla. El fake registra
 * las llamadas, así que además de "qué devuelve" se puede afirmar "qué se
 * consultó", que es donde viven los errores caros (filtrar por el token plano,
 * saltarse la revocación, tratar una cookie basura como sesión válida).
 *
 * El fake tiene que mantener la forma que declara `SessionClient`: es el mismo
 * contrato que `asSessionClient` le asegura al cliente real.
 */

const NOW = new Date("2026-09-28T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

type SingleResult = { data: unknown; error: { message: string } | null };

type FakeOptions = {
  selectResult?: SingleResult;
  insertResult?: SingleResult;
  updateError?: { message: string } | null;
};

function createFakeClient(options: FakeOptions = {}): {
  client: SessionClient;
  calls: string[];
} {
  const calls: string[] = [];

  const client: SessionClient = {
    from: (table) => {
      calls.push(`from:${table}`);

      return {
        select: (columns) => {
          calls.push(`select:${columns}`);

          return {
            eq: (column, value) => {
              calls.push(`eq:${column}=${String(value)}`);

              return {
                maybeSingle: async () => {
                  calls.push("maybeSingle");
                  return options.selectResult ?? { data: null, error: null };
                },
              };
            },
          };
        },

        insert: (values) => {
          calls.push(`insert:${JSON.stringify(values)}`);

          return {
            select: () => ({
              single: async () => {
                calls.push("insert:single");
                return options.insertResult ?? { data: null, error: null };
              },
            }),
          };
        },

        update: (values) => {
          calls.push(`update:${JSON.stringify(values)}`);

          return {
            eq: (column, value) => {
              calls.push(`eq:${column}=${String(value)}`);

              return {
                is: (isColumn, isValue) => {
                  calls.push(`is:${isColumn}=${String(isValue)}`);
                  return Promise.resolve({ error: options.updateError ?? null });
                },
              };
            },
          };
        },

        delete: () => {
          calls.push("delete");

          return {
            lt: (column) => {
              calls.push(`lt:${column}`);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };

  return { client, calls };
}

function sessionRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "sess-1",
    username: "gerente",
    expires_at: new Date(NOW.getTime() + 8 * HOUR).toISOString(),
    revoked_at: null,
    ...overrides,
  };
}

function insertedValues(calls: string[]): Record<string, unknown> | null {
  const call = calls.find((entry) => entry.startsWith("insert:"));
  return call ? (JSON.parse(call.slice("insert:".length)) as Record<string, unknown>) : null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// asSessionClient
// ---------------------------------------------------------------------------

describe("asSessionClient", () => {
  it("devuelve el mismo cliente, sin transformarlo", () => {
    const { client } = createFakeClient();

    expect(asSessionClient(client)).toBe(client);
  });
});

// ---------------------------------------------------------------------------
// isSessionActive
// ---------------------------------------------------------------------------

describe("isSessionActive", () => {
  it("una sesión vigente y sin revocar está activa", () => {
    const row = sessionRow() as never;

    expect(isSessionActive(row)).toBe(true);
  });

  it("una sesión revocada no está activa aunque la fecha sea futura", () => {
    const row = sessionRow({ revoked_at: NOW.toISOString() }) as never;

    expect(isSessionActive(row)).toBe(false);
  });

  it("una sesión vencida no está activa", () => {
    const row = sessionRow({ expires_at: new Date(NOW.getTime() - 1).toISOString() }) as never;

    expect(isSessionActive(row)).toBe(false);
  });

  it("expira exactamente en el instante de expires_at, no un ms después", () => {
    const row = sessionRow({ expires_at: NOW.toISOString() }) as never;

    expect(isSessionActive(row, NOW.getTime())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createSession
// ---------------------------------------------------------------------------

describe("createSession", () => {
  it("guarda el SHA-256 del token, nunca el token plano", async () => {
    const { client, calls } = createFakeClient({
      insertResult: { data: sessionRow(), error: null },
    });

    const result = await createSession(client, "gerente", 8 * HOUR);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const values = insertedValues(calls);
    expect(values?.token_hash).toBe(hashSessionToken(result.token));
    expect(values?.username).toBe("gerente");
    expect(JSON.stringify(values)).not.toContain(result.token);
  });

  it("fija expires_at según el TTL recibido", async () => {
    const { client, calls } = createFakeClient({
      insertResult: { data: sessionRow(), error: null },
    });

    await createSession(client, "gerente", 8 * HOUR);

    expect(insertedValues(calls)?.expires_at).toBe(
      new Date(NOW.getTime() + 8 * HOUR).toISOString(),
    );
  });

  it("pura las sesiones vencidas antes de insertar", async () => {
    const { client, calls } = createFakeClient({
      insertResult: { data: sessionRow(), error: null },
    });

    await createSession(client, "gerente", 8 * HOUR);

    expect(calls.indexOf("delete")).toBeLessThan(calls.findIndex((c) => c.startsWith("insert:")));
  });

  it("devuelve el token y la sesión creada", async () => {
    const { client } = createFakeClient({ insertResult: { data: sessionRow(), error: null } });

    const result = await createSession(client, "gerente", 8 * HOUR);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.token).toHaveLength(43);
    expect(result.session.username).toBe("gerente");
  });

  it("un error de insert no emite sesión", async () => {
    const { client } = createFakeClient({
      insertResult: { data: null, error: { message: "violación de FK" } },
    });

    const result = await createSession(client, "gerente", 8 * HOUR);

    expect(result).toEqual({ success: false, message: "violación de FK" });
  });

  it("una fila con forma inválida no se toma por sesión válida", async () => {
    const { client } = createFakeClient({
      insertResult: { data: { id: "", username: "gerente" }, error: null },
    });

    const result = await createSession(client, "gerente", 8 * HOUR);

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getSession
// ---------------------------------------------------------------------------

describe("getSession", () => {
  const validToken = "a".repeat(43);

  it("devuelve la sesión de un token vigente", async () => {
    const { client } = createFakeClient({
      selectResult: { data: sessionRow(), error: null },
    });

    const session = await getSession(client, validToken);

    expect(session?.username).toBe("gerente");
  });

  it("busca por el hash del token, no por el token", async () => {
    const { client, calls } = createFakeClient({
      selectResult: { data: sessionRow(), error: null },
    });

    await getSession(client, validToken);

    const eq = calls.find((call) => call.startsWith("eq:token_hash=")) ?? "";
    expect(eq).toContain(hashSessionToken(validToken));
    expect(eq).not.toContain(`,${validToken}`);
  });

  it("un token con formato inválido no genera consulta a la base", async () => {
    const { client, calls } = createFakeClient();

    expect(await getSession(client, "basura")).toBeNull();
    expect(await getSession(client, null)).toBeNull();
    expect(await getSession(client, "")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("una sesión revocada no resuelve", async () => {
    const { client } = createFakeClient({
      selectResult: { data: sessionRow({ revoked_at: NOW.toISOString() }), error: null },
    });

    expect(await getSession(client, validToken)).toBeNull();
  });

  it("una sesión vencida no resuelve", async () => {
    const { client } = createFakeClient({
      selectResult: {
        data: sessionRow({ expires_at: new Date(NOW.getTime() - 1).toISOString() }),
        error: null,
      },
    });

    expect(await getSession(client, validToken)).toBeNull();
  });

  it("un error de base o una fila vacía devuelven null, nunca una sesión a medias", async () => {
    const conError = createFakeClient({ selectResult: { data: null, error: { message: "boom" } } });
    const vacio = createFakeClient({ selectResult: { data: null, error: null } });
    const malformada = createFakeClient({
      selectResult: { data: { username: 42 }, error: null },
    });

    expect(await getSession(conError.client, validToken)).toBeNull();
    expect(await getSession(vacio.client, validToken)).toBeNull();
    expect(await getSession(malformada.client, validToken)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// revokeSession
// ---------------------------------------------------------------------------

describe("revokeSession", () => {
  const validToken = "b".repeat(43);

  it("marca revoked_at filtrando por hash y por revocación pendiente", async () => {
    const { client, calls } = createFakeClient();

    expect(await revokeSession(client, validToken)).toBe(true);

    const update = calls.find((call) => call.startsWith("update:")) ?? "";
    expect(update).toContain("revoked_at");
    expect(calls).toContain(`eq:token_hash=${hashSessionToken(validToken)}`);
    expect(calls).toContain("is:revoked_at=null");
  });

  it("un token inválido no consulta y se reporta como no revocado", async () => {
    const { client, calls } = createFakeClient();

    expect(await revokeSession(client, "basura")).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("un error de base devuelve false en vez de prometer un logout limpio", async () => {
    const { client } = createFakeClient({ updateError: { message: "boom" } });

    expect(await revokeSession(client, validToken)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// purgeExpiredSessions
// ---------------------------------------------------------------------------

describe("purgeExpiredSessions", () => {
  it("borra por expires_at", async () => {
    const { client, calls } = createFakeClient();

    await purgeExpiredSessions(client);

    expect(calls).toContain("delete");
    expect(calls).toContain("lt:expires_at");
  });
});
