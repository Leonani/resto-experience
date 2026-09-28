import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Autenticación de escritura (single user).
 *
 * Usuario único definido en `.env`: `REVIEWS_LOGIN_USER`, `REVIEWS_LOGIN_PASS`
 * y el token `REVIEWS_REPLY_TOKEN`. El login valida usuario/contraseña y
 * devuelve el token; los endpoints de contestaciones (`save-reply`,
 * `generate-draft`) lo exigen en `Authorization: Bearer <token>`.
 *
 * Los filtros y el listado son públicos por diseño: se puede pasar la URL a
 * otra persona y que vea los filtros que usamos. Escribir exige sesión.
 *
 * Este módulo es deliberadamente SIN `server-only` para poder testearlo con
 * vitest. Nunca se importa desde un Client Component: las variables
 * `REVIEWS_*` no llevan `NEXT_PUBLIC_`, así que si un cliente las recibiera
 * estarían vacías y `readAuthConfig` devuelve `null` → fail-closed.
 */

export type AuthConfig = {
  loginUser: string;
  loginPass: string;
  replyToken: string;
};

/**
 * Lee la configuración del entorno. Devuelve `null` si falta cualquiera de las
 * tres variables: sin configuración, todas las escrituras quedan cerradas
 * (fail-closed). Valores en blanco se tratan como ausentes.
 */
export function readAuthConfig(
  env: Record<string, string | undefined> = process.env,
): AuthConfig | null {
  const loginUser = env.REVIEWS_LOGIN_USER?.trim();
  const loginPass = env.REVIEWS_LOGIN_PASS?.trim();
  const replyToken = env.REVIEWS_REPLY_TOKEN?.trim();

  if (!loginUser || !loginPass || !replyToken) return null;

  return { loginUser, loginPass, replyToken };
}

/**
 * Comparación a tiempo constante. Se hashean ambos lados con SHA-256 para
 * igualar longitud (requisito de `timingSafeEqual`) sin revelar cuál es la
 * referencia por la longitud de lo que llega del cliente.
 */
function safeEqual(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a, 'utf8').digest();
  const hashB = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(hashA, hashB);
}

/** ¿Coinciden usuario y contraseña recibidos con la configuración? */
export function verifyCredentials(
  username: string,
  password: string,
  config: AuthConfig,
): boolean {
  return safeEqual(username, config.loginUser) && safeEqual(password, config.loginPass);
}

/** ¿Es este el token de contestaciones? */
export function verifyReplyToken(token: string, config: AuthConfig): boolean {
  return safeEqual(token, config.replyToken);
}

/**
 * Extrae el token de `Authorization: Bearer <token>`. Devuelve `null` si el
 * header falta, no es Bearer, trae tokens de más o el token es vacío.
 */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;

  const [scheme, token, ...rest] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length > 0) return null;

  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * ¿La request está autorizada a escribir una contestación?
 *
 * Fail-closed: sin configuración, sin header o con token inválido → `false`.
 * El servidor nunca deja pasar una escritura por un accidente de entorno.
 */
export function isReplyAuthorized(request: Request, config: AuthConfig | null): boolean {
  if (!config) return false;

  const token = extractBearerToken(request);
  if (!token) return false;

  return verifyReplyToken(token, config);
}