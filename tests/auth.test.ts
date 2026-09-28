import { describe, expect, it } from "vitest";

import {
  extractBearerToken,
  hashPassword,
  isReplyAuthorized,
  readAuthConfig,
  verifyPassword,
  verifyReplyToken,
  type AuthConfig,
} from "@/lib/auth";

/**
 * Tests de autenticación de escritura (lib/auth.ts).
 *
 * Todo es puro a propósito (sin `server-only`): se testea con vitest igual que
 * `lib/draft/budget.ts`. El caso más importante es el fail-closed: sin
 * configuración, sin header o con token inválido, la escritura nunca pasa.
 *
 * La contraseña se guarda hasheada con scrypt en `auth_users` (no en env); acá
 * se testea que el hash sea autodescriptivo y que la verificación sea
 * inequívoca (tiempo constante, formato inválido → false, nunca lanza).
 */

const config: AuthConfig = {
  replyToken: "tok-123",
};

function requestWith(authorization?: string): Request {
  return new Request("http://localhost/api/save-reply", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

describe("readAuthConfig", () => {
  it("lee y recorta el token de escritura", () => {
    expect(readAuthConfig({ REVIEWS_REPLY_TOKEN: " tok-123 " })).toEqual(config);
  });

  it("devuelve null si falta el token (fail-closed)", () => {
    expect(readAuthConfig({})).toBeNull();
    expect(readAuthConfig({ REVIEWS_LOGIN_USER: "gerente" })).toBeNull();
  });

  it("trata valores en blanco como ausentes (fail-closed)", () => {
    expect(readAuthConfig({ REVIEWS_REPLY_TOKEN: "  " })).toBeNull();
    expect(readAuthConfig({ REVIEWS_REPLY_TOKEN: "" })).toBeNull();
  });
});

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

describe("verifyReplyToken", () => {
  it("acepta el token configurado y rechaza cualquier otro", () => {
    expect(verifyReplyToken("tok-123", config)).toBe(true);
    expect(verifyReplyToken("tok-124", config)).toBe(false);
    expect(verifyReplyToken("", config)).toBe(false);
  });
});

describe("extractBearerToken", () => {
  it("extrae un único token Bearer", () => {
    expect(extractBearerToken(requestWith("Bearer tok-123"))).toBe("tok-123");
    expect(extractBearerToken(requestWith("bearer tok-123"))).toBe("tok-123");
  });

  it("devuelve null sin header de autorización", () => {
    expect(extractBearerToken(requestWith())).toBeNull();
  });

  it("devuelve null si el esquema no es Bearer", () => {
    expect(extractBearerToken(requestWith("Basic abc"))).toBeNull();
  });

  it("devuelve null si el header trae más de un token", () => {
    expect(extractBearerToken(requestWith("Bearer a b"))).toBeNull();
  });

  it("devuelve null si el token es vacío o solo espacios", () => {
    expect(extractBearerToken(requestWith("Bearer"))).toBeNull();
    expect(extractBearerToken(requestWith("Bearer  "))).toBeNull();
  });
});

describe("isReplyAuthorized", () => {
  it("permite pasar con el token correcto", () => {
    expect(isReplyAuthorized(requestWith("Bearer tok-123"), config)).toBe(true);
  });

  it("rechaza un token incorrecto", () => {
    expect(isReplyAuthorized(requestWith("Bearer tok-999"), config)).toBe(false);
  });

  it("rechaza sin header de autorización", () => {
    expect(isReplyAuthorized(requestWith(), config)).toBe(false);
  });

  it("falla cerrado sin configuración, aunque el token sea correcto", () => {
    expect(isReplyAuthorized(requestWith("Bearer tok-123"), null)).toBe(false);
  });
});