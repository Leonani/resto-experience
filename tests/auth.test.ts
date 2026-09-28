import { describe, expect, it } from "vitest";

import {
  extractBearerToken,
  isReplyAuthorized,
  readAuthConfig,
  verifyCredentials,
  verifyReplyToken,
  type AuthConfig,
} from "@/lib/auth";

/**
 * Tests de autenticación de escritura (lib/auth.ts).
 *
 * Todo es puro a propósito (sin `server-only`): se testea con vitest igual que
 * `lib/draft/budget.ts`. El caso más importante es el fail-closed: sin
 * configuración, sin header o con token inválido, la escritura nunca pasa.
 */

const config: AuthConfig = {
  loginUser: "gerente",
  loginPass: "secreto",
  replyToken: "tok-123",
};

function requestWith(authorization?: string): Request {
  return new Request("http://localhost/api/save-reply", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

describe("readAuthConfig", () => {
  it("lee y recorta las tres variables", () => {
    expect(
      readAuthConfig({
        REVIEWS_LOGIN_USER: "  gerente ",
        REVIEWS_LOGIN_PASS: " secreto ",
        REVIEWS_REPLY_TOKEN: " tok-123 ",
      }),
    ).toEqual(config);
  });

  it("devuelve null si falta cualquiera de las tres", () => {
    expect(readAuthConfig({})).toBeNull();
    expect(
      readAuthConfig({ REVIEWS_LOGIN_USER: "gerente", REVIEWS_LOGIN_PASS: "secreto" }),
    ).toBeNull();
    expect(
      readAuthConfig({ REVIEWS_LOGIN_USER: "gerente", REVIEWS_REPLY_TOKEN: "tok-123" }),
    ).toBeNull();
    expect(
      readAuthConfig({ REVIEWS_LOGIN_PASS: "secreto", REVIEWS_REPLY_TOKEN: "tok-123" }),
    ).toBeNull();
  });

  it("trata valores en blanco como ausentes (fail-closed)", () => {
    expect(
      readAuthConfig({
        REVIEWS_LOGIN_USER: "  ",
        REVIEWS_LOGIN_PASS: "secreto",
        REVIEWS_REPLY_TOKEN: "tok-123",
      }),
    ).toBeNull();
    expect(
      readAuthConfig({
        REVIEWS_LOGIN_USER: "gerente",
        REVIEWS_LOGIN_PASS: "",
        REVIEWS_REPLY_TOKEN: "tok-123",
      }),
    ).toBeNull();
  });
});

describe("verifyCredentials", () => {
  it("acepta usuario y contraseña correctos", () => {
    expect(verifyCredentials("gerente", "secreto", config)).toBe(true);
  });

  it("rechaza credenciales incorrectas en cualquiera de los dos campos", () => {
    expect(verifyCredentials("otro", "secreto", config)).toBe(false);
    expect(verifyCredentials("gerente", "otra", config)).toBe(false);
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