import { describe, expect, it } from "vitest";

import {
  SESSION_COOKIE_NAME,
  buildSessionCookie,
  clearSessionCookie,
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  isSameOrigin,
  isValidSessionToken,
  readSessionConfig,
  readSessionCookie,
  verifyPassword,
} from "@/lib/auth";

/**
 * Tests de autenticación de escritura (lib/auth.ts).
 *
 * Todo es puro a propósito (sin `server-only`, sin base de datos): se testea con
 * vitest igual que `lib/draft/budget.ts`. Lo que cubre:
 *
 *  - contraseñas: scrypt autodescriptivo, sal distinta, comparación a tiempo
 *    constante, formato inválido → false y nunca lanza.
 *  - sesión: el token se genera con entropía real, solo se hashea, y su formato
 *    se valida antes de tocar la base.
 *  - CSRF: la cookie la manda el navegador sola, así que el origen de la request
 *    es la frontera de seguridad. La matriz de `isSameOrigin` es el test que más
 *    importa de este archivo.
 *  - cookie: los atributos que la vuelven ilegible desde JS.
 */

const URL_SAVE_REPLY = "http://localhost:3000/api/save-reply";

function requestWith(headers: Record<string, string>, url = URL_SAVE_REPLY): Request {
  return new Request(url, { method: "POST", headers });
}

// ---------------------------------------------------------------------------
// Contraseñas
// ---------------------------------------------------------------------------

describe("hashPassword / verifyPassword", () => {
  it("un hash scrypt es autodescriptivo: scrypt$salt$hash", () => {
    const hash = hashPassword("Password123");
    const [format, saltHex, hashHex] = hash.split("$");

    expect(format).toBe("scrypt");
    expect(saltHex).toHaveLength(32); // 16 bytes en hex
    expect(hashHex).toHaveLength(128); // 64 bytes en hex
  });

  it("sal de cada hash es distinta aunque la contraseña se repita", () => {
    expect(hashPassword("Password123")).not.toBe(hashPassword("Password123"));
  });

  it("acepta la contraseña correcta y rechaza cualquier otra", () => {
    const hash = hashPassword("Password123");

    expect(verifyPassword("Password123", hash)).toBe(true);
    expect(verifyPassword("password123", hash)).toBe(false);
    expect(verifyPassword("Password123 ", hash)).toBe(false);
  });

  it("rechaza un usuario inexistente sin lanzar", () => {
    expect(verifyPassword("Password123", "")).toBe(false);
  });

  it("rechaza hashes con formato inválido sin lanzar", () => {
    expect(verifyPassword("Password123", "md5$$ab")).toBe(false);
    expect(verifyPassword("Password123", "scrypt$$")).toBe(false); // sin salt ni hash
    expect(verifyPassword("Password123", "scrypt$00$nothex")).toBe(false);
  });

  it("rechaza contraseñas vacías o desmedidas (límite de costo)", () => {
    const hash = hashPassword("Password123");

    expect(verifyPassword("", hash)).toBe(false);
    expect(verifyPassword("x".repeat(257), hash)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Token de sesión
// ---------------------------------------------------------------------------

describe("generateSessionToken", () => {
  it("devuelve 43 caracteres base64url (32 bytes de entropía)", () => {
    const token = generateSessionToken();

    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("no repite token entre llamadas", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateSessionToken()));

    expect(tokens.size).toBe(50);
  });
});

describe("hashSessionToken", () => {
  it("es determinista: el mismo token da siempre el mismo hash", () => {
    const token = generateSessionToken();

    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("devuelve 64 hex (sha256) y no el token", () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });

  it("tokens distintos dan hashes distintos", () => {
    expect(hashSessionToken(generateSessionToken())).not.toBe(
      hashSessionToken(generateSessionToken()),
    );
  });
});

describe("isValidSessionToken", () => {
  it("acepta un token emitido", () => {
    expect(isValidSessionToken(generateSessionToken())).toBe(true);
  });

  it("rechaza null, undefined y vacío sin lanzar", () => {
    expect(isValidSessionToken(null)).toBe(false);
    expect(isValidSessionToken(undefined)).toBe(false);
    expect(isValidSessionToken("")).toBe(false);
  });

  it("rechaza longitudes incorrectas", () => {
    expect(isValidSessionToken("abc")).toBe(false);
    expect(isValidSessionToken("a".repeat(42))).toBe(false);
    expect(isValidSessionToken("a".repeat(44))).toBe(false);
  });

  it("rechaza caracteres fuera de base64url", () => {
    expect(isValidSessionToken("a".repeat(42) + "+")).toBe(false);
    expect(isValidSessionToken("a".repeat(42) + "/")).toBe(false);
    expect(isValidSessionToken("a".repeat(42) + "=")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

describe("readSessionConfig", () => {
  it("por defecto son 8 horas", () => {
    expect(readSessionConfig({}).sessionTtlMs).toBe(8 * 60 * 60 * 1000);
  });

  it("lee SESSION_TTL_HOURS cuando es un número válido", () => {
    expect(readSessionConfig({ SESSION_TTL_HOURS: "24" }).sessionTtlMs).toBe(
      24 * 60 * 60 * 1000,
    );
  });

  it("un valor inválido cae al default en vez de romper el login", () => {
    expect(readSessionConfig({ SESSION_TTL_HOURS: "mucho" }).sessionTtlMs).toBe(
      8 * 60 * 60 * 1000,
    );
    expect(readSessionConfig({ SESSION_TTL_HOURS: "0" }).sessionTtlMs).toBe(
      8 * 60 * 60 * 1000,
    );
    expect(readSessionConfig({ SESSION_TTL_HOURS: "-5" }).sessionTtlMs).toBe(
      8 * 60 * 60 * 1000,
    );
    expect(readSessionConfig({ SESSION_TTL_HOURS: "  " }).sessionTtlMs).toBe(
      8 * 60 * 60 * 1000,
    );
  });

  it("acota la duración a 30 días aunque se pida más", () => {
    expect(readSessionConfig({ SESSION_TTL_HOURS: "99999" }).sessionTtlMs).toBe(
      30 * 24 * 60 * 60 * 1000,
    );
  });

  it("lee APP_ORIGIN recortado, y null si falta o está en blanco", () => {
    expect(readSessionConfig({ APP_ORIGIN: " https://app.com " }).appOrigin).toBe(
      "https://app.com",
    );
    expect(readSessionConfig({ APP_ORIGIN: "   " }).appOrigin).toBeNull();
    expect(readSessionConfig({}).appOrigin).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CSRF
// ---------------------------------------------------------------------------

describe("isSameOrigin", () => {
  it("permite el mismo origen", () => {
    expect(isSameOrigin(requestWith({ origin: "http://localhost:3000" }), null)).toBe(
      true,
    );
  });

  it("rechaza un origin distinto", () => {
    expect(
      isSameOrigin(requestWith({ origin: "https://sitio-malicioso.com" }), null),
    ).toBe(false);
  });

  it("sin Origin, cae a Referer", () => {
    const ok = requestWith({ referer: "http://localhost:3000/dashboard" });
    const bad = requestWith({ referer: "https://sitio-malicioso.com/form" });

    expect(isSameOrigin(ok, null)).toBe(true);
    expect(isSameOrigin(bad, null)).toBe(false);
  });

  it("un Referer malformado se rechaza en vez de dejarlo pasar", () => {
    expect(isSameOrigin(requestWith({ referer: "no-es-una-url" }), null)).toBe(false);
  });

  it("sin Origin ni Referer permite: es un cliente no-navegador", () => {
    expect(isSameOrigin(requestWith({}), null)).toBe(true);
  });

  it("rechaza sec-fetch-site que no sea same-origin", () => {
    expect(
      isSameOrigin(requestWith({ "sec-fetch-site": "cross-site", origin: "http://localhost:3000" }), null),
    ).toBe(false);
  });

  it("rechaza same-site: en Vercel los previews comparten sitio y podrían hacer CSRF", () => {
    expect(
      isSameOrigin(requestWith({ "sec-fetch-site": "same-site", origin: "http://localhost:3000" }), null),
    ).toBe(false);
  });

  it("acepta sec-fetch-site same-origin", () => {
    expect(
      isSameOrigin(
        requestWith({ "sec-fetch-site": "same-origin", origin: "http://localhost:3000" }),
        null,
      ),
    ).toBe(true);
  });

  it("con APP_ORIGIN configurado, manda ese valor y no el de la request", () => {
    const request = requestWith({ origin: "https://proxy.interno" });

    expect(isSameOrigin(request, "https://app.com")).toBe(false);
    expect(isSameOrigin(requestWith({ origin: "https://app.com" }), "https://app.com")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Cookie
// ---------------------------------------------------------------------------

describe("buildSessionCookie", () => {
  const token = generateSessionToken();

  it("lleva el token, HttpOnly, SameSite=Lax y Path=/", () => {
    const cookie = buildSessionCookie(token, 8 * 60 * 60 * 1000, false);

    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=${token}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });

  it("Max-Age en segundos, derivado del TTL", () => {
    expect(buildSessionCookie(token, 8 * 60 * 60 * 1000, false)).toContain(
      "Max-Age=28800",
    );
  });

  it("Secure solo en producción: en localhost el navegador la descartaría", () => {
    expect(buildSessionCookie(token, 1000, false)).not.toContain("Secure");
    expect(buildSessionCookie(token, 1000, true)).toContain("Secure");
  });

  it("nunca emite Max-Age negativo", () => {
    expect(buildSessionCookie(token, -5000, false)).toContain("Max-Age=0");
  });
});

describe("clearSessionCookie", () => {
  it("borra la cookie conservando nombre y atributos", () => {
    const cookie = clearSessionCookie();

    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=0");
  });
});

describe("readSessionCookie", () => {
  it("devuelve null si no hay header Cookie", () => {
    expect(readSessionCookie(requestWith({}))).toBeNull();
  });

  it("lee el token de la cookie de sesión", () => {
    const request = requestWith({ cookie: `${SESSION_COOKIE_NAME}=tok-abc` });

    expect(readSessionCookie(request)).toBe("tok-abc");
  });

  it("ignora otras cookies y tolera espacios", () => {
    const request = requestWith({
      cookie: `otro=1; ${SESSION_COOKIE_NAME}=tok-abc ; fin=2`,
    });

    expect(readSessionCookie(request)).toBe("tok-abc");
  });

  it("devuelve null si la cookie viene vacía", () => {
    expect(readSessionCookie(requestWith({ cookie: `${SESSION_COOKIE_NAME}=` }))).toBeNull();
    expect(readSessionCookie(requestWith({ cookie: `${SESSION_COOKIE_NAME}=   ` }))).toBeNull();
  });
});
