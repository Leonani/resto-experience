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
 * La sesión ya NO es un secreto compartido: el login emite un token opaco
 * aleatorio y la fila de `auth_sessions` guarda solo su SHA-256. Eso agrega
 * tres cosas que un token de entorno no tenía: expiración real, revocación
 * (logout) y trazabilidad por usuario. Ver `lib/session.ts` para el acceso a
 * la tabla; este módulo solo resuelve criptografía y formato.
 *
 * El token viaja en una cookie `HttpOnly` (`reviews_session`), nunca en
 * `localStorage` ni en un header: así el JavaScript de la página —y un XSS—
 * no lo pueden leer. Como la cookie la adjunta el navegador sola, las
 * escrituras tienen que defenderse de CSRF, y para eso está `isSameOrigin`.
 *
 * Los filtros y el listado son públicos por diseño: se puede pasar la URL a
 * otra persona y que vea los filtros que usamos. Escribir exige sesión.
 *
 * Este módulo es deliberadamente SIN `server-only` para poder testearlo con
 * vitest. Nunca se importa desde un Client Component: no lee secretos del
 * entorno y sus funciones de cookie son puras, pero dejar que un Client
 * Component las use expondría el token en el bundle.
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
// Token de sesión
// ---------------------------------------------------------------------------
// 32 bytes aleatorios en base64url: 43 caracteres, 256 bits de entropía. El
// formato se valida antes de tocar la base para que un `Cookie: basura` no
// termine en una consulta al servidor.
const SESSION_TOKEN_BYTES = 32;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Nombre de la cookie de sesión. Sin prefijo `__Host-` a propósito: ver `buildSessionCookie`. */
export const SESSION_COOKIE_NAME = 'reviews_session';

/** 8 h por defecto: una jornada. No se renueva sola, hay que loguearse de nuevo. */
const DEFAULT_SESSION_TTL_HOURS = 8;

/** Tope duro: ni un valor mal puesto en `.env` debe dejar una sesión eternal. */
const MAX_SESSION_TTL_HOURS = 24 * 30;

/**
 * Criptografía y formato de la sesión (puro, sin base de datos).
 *
 * El módulo se separa del acceso a `auth_sessions` a propósito: esto se testea
 * sin Supabase y `lib/session.ts` es el que habla con la tabla.
 */

/** Genera el token que viaja al cliente. Se guarda el SHA-256, nunca este valor. */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

/**
 * SHA-256 del token. Es un hash, no una contraseña: el token tiene 256 bits de
 * entropía, así que no se puede fuerza bruta y SHA-256 es lo correcto aquí
 * (scrypt se reserva para contraseñas, que sí son de baja entropía).
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** ¿El valor tiene el formato de un token emitido por `generateSessionToken`? */
export function isValidSessionToken(token: string | null | undefined): boolean {
  return typeof token === 'string' && SESSION_TOKEN_PATTERN.test(token);
}

// ---------------------------------------------------------------------------
// Configuración de sesión
// ---------------------------------------------------------------------------

export type SessionConfig = {
  /** Duración de la sesión, en ms. */
  sessionTtlMs: number;
  /** Origin permitido por CSRF, o `null` si no se fijó (se usa el de la request). */
  appOrigin: string | null;
};

/**
 * Lee la configuración del entorno.
 *
 * `SESSION_TTL_HOURS` es opcional: sin él vale la jornada por defecto. Un valor
 * inválido, cero o negativo también cae al default — un `.env` mal escrito no
 * puede dejar al usuario sin sesión ni abrirle una eternal.
 */
export function readSessionConfig(
  env: Record<string, string | undefined> = process.env,
): SessionConfig {
  const parsed = Number(env.SESSION_TTL_HOURS);
  const hours =
    Number.isFinite(parsed) && parsed > 0
      ? Math.min(parsed, MAX_SESSION_TTL_HOURS)
      : DEFAULT_SESSION_TTL_HOURS;

  return {
    sessionTtlMs: hours * 60 * 60 * 1000,
    appOrigin: env.APP_ORIGIN?.trim() || null,
  };
}

// ---------------------------------------------------------------------------
// CSRF: la cookie la manda el navegador sola, así que hay que comprobar el origen
// ---------------------------------------------------------------------------

/**
 * ¿La request viene del mismo sitio que la app?
 *
 * Una cookie `SameSite=Lax` ya bloquea el POST cross-site, pero es defense in
 * depth: el check de origen sigue vivo porque depende de menos del navegador.
 *
 * Orden de decisión:
 *  1. `Sec-Fetch-Site` si viene: el navegador no miente sobre esto y alcanza
 *     para rechazar `cross-site` sin parsear URLs. Solo se acepta `same-origin`
 *     — `same-site` NO, porque en Vercel los previews comparten sitio
 *     (`*.vercel.app`) y eso habilitaría a un preview ajeno a mandarnos un
 *     POST con la cookie.
 *  2. `Origin` (lo manda todo POST cross-site moderno).
 *  3. `Referer` como respaldo para navegadores viejos.
 *  4. Si no hay ninguno, se permite: eso es un cliente no-navegador (curl,
 *     tests) y no puede ser un ataque CSRF, que necesita un navegador.
 *
 * Con `appOrigin` explícito gana ese valor; si no, se compara contra el origin
 * de la propia request, que en Vercel ya es el público.
 */
export function isSameOrigin(request: Request, appOrigin: string | null): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') {
    return false;
  }

  const expected = appOrigin ?? new URL(request.url).origin;

  const origin = request.headers.get('origin');
  if (origin) return origin === expected;

  const referer = request.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin === expected;
    } catch {
      // Un Referer malformado no se puede comparar: se rechaza en vez de
      // dejarlo pasar por ser "no cross-site".
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Cookie de sesión
// ---------------------------------------------------------------------------

/**
 * Arma el `Set-Cookie` de la sesión.
 *
 * `HttpOnly` es el motivo principal del cambio: sin él, cualquier XSS puede
 * leer el token. `SameSite=Lax` + el check de origen cubren CSRF. `Secure`
 * solo en producción, porque en `http://localhost` el navegador descarta la
 * cookie y no se podría ni loguearse en dev.
 */
export function buildSessionCookie(
  token: string,
  sessionTtlMs: number,
  secure: boolean,
): string {
  const maxAge = Math.max(0, Math.floor(sessionTtlMs / 1000));
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];

  if (secure) parts.push('Secure');

  return parts.join('; ');
}

/** `Set-Cookie` para cerrar sesión: mismo nombre y atributos, `Max-Age=0`. */
export function clearSessionCookie(): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ].join('; ');
}

/**
 * Lee el token de la cookie de la request.
 *
 * Se parsea el header `Cookie` a mano en vez de usar `cookies()` de
 * `next/headers` para que la función sea pura y testeable, y porque las
 * Route Handlers ya reciben la `Request` completa.
 */
export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;

    if (part.slice(0, separator).trim() === SESSION_COOKIE_NAME) {
      const value = part.slice(separator + 1).trim();
      return value.length > 0 ? value : null;
    }
  }

  return null;
}