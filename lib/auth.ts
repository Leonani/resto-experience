import { randomBytes, scryptSync, createHash, timingSafeEqual } from 'node:crypto';

/**
 * Autenticación de escritura (single user).
 *
 * El usuario vive en la tabla `auth_users` de Supabase: `username` + el hash
 * scrypt de la contraseña. El hash se genera con `hashPassword` (script de
 * seed) y se verificada con `verifyPassword`; se usa scrypt y NO SHA-256 para
 * guardar contraseñas: un hash rápido convierte "Password123" en algo
 * decodificable por fuerza bruta, scrypt existe justamente para eso.
 *
 * El token `REVIEWS_REPLY_TOKEN` sí sigue en `.env` (es un secreto de sesión,
 * no una credencial): el login lo valida contra la tabla y lo devuelve, y los
 * endpoints de contestaciones (`save-reply`, `generate-draft`) lo exigen en
 * `Authorization: Bearer <token>`.
 *
 * Los filtros y el listado son públicos por diseño: se puede pasar la URL a
 * otra persona y que vea los filtros que usamos. Escribir exige sesión.
 *
 * Este módulo es deliberadamente SIN `server-only` para poder testearlo con
 * vitest. Nunca se importa desde un Client Component: `REVIEWS_REPLY_TOKEN`
 * no lleva `NEXT_PUBLIC_`, así que si un cliente lo recibiera estaría vacío y
 * `readAuthConfig` devuelve `null` → fail-closed.
 */

// ---------------------------------------------------------------------------
// Hash de contraseñas (scrypt)
// ---------------------------------------------------------------------------
// Parámetros por defecto de scrypt (N=2^14, r=8, p=1, keylen=64). El hash se
// guarda en el formato `scrypt$<salt_hex>$<hash_hex>` para que sea
// autodescriptivo: la verificación no necesita saber nada más.
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_LEN = 16;
const SCRYPT_FORMAT = 'scrypt';
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const MAX_PASSWORD_LEN = 256;

/** Hashea una contraseña para guardarla en `auth_users.password_hash`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(SCRYPT_SALT_LEN);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTS);
  return `${SCRYPT_FORMAT}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * ¿Coincide la contraseña recibida con el hash guardado?
 *
 * Comparación a tiempo constante: se deriva el hash de lo recibido con el
 * mismo salt y se compara con `timingSafeEqual` contra el hash guardado (misma
 * longitud siempre, requisito de `timingSafeEqual`). Cualquier hash que no
 * tenga el formato esperado devuelve `false`, nunca lanza.
 */
export function verifyPassword(password: string, stored: string): boolean {
  if (password.length === 0 || password.length > MAX_PASSWORD_LEN) return false;

  const [format, saltHex, hashHex] = stored.split('$');
  if (format !== SCRYPT_FORMAT || !saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  // Salt o hash vacíos (p. ej. "scrypt$$") no son hashes válidos.
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = scryptSync(password, salt, expected.length, SCRYPT_OPTS);
  return timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------------------
// Configuración de sesión
// ---------------------------------------------------------------------------

export type AuthConfig = {
  replyToken: string;
};

/**
 * Lee la configuración del entorno. Devuelve `null` si falta
 * `REVIEWS_REPLY_TOKEN`: sin token de sesión, todas las escrituras quedan
 * cerradas (fail-closed). Valores en blanco se tratan como ausentes.
 */
export function readAuthConfig(
  env: Record<string, string | undefined> = process.env,
): AuthConfig | null {
  const replyToken = env.REVIEWS_REPLY_TOKEN?.trim();

  if (!replyToken) return null;

  return { replyToken };
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