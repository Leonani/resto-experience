/**
 * Sesiones de escritura sobre la tabla `auth_sessions`.
 *
 * Qué aporta la tabla frente al token estático de antes: expiración real
 * (`expires_at`), revocación inmediata (`revoked_at` en el logout) y un usuario
 * asociado a cada sesión, que es lo que hace útil la auditoría.
 *
 * El token nunca se guarda: entra al cliente y de la base solo sale su SHA-256.
 * Consecuencia práctica: la sesión no se puede recuperar ni listar desde la
 * base, solo revocar. Para este panel (un gerente) es el trade-off correcto.
 *
 * El cliente de Supabase se INYECTA por parámetro en vez de llamar a
 * `createClientAdmin()` internamente. Motivo concreto: `lib/supabase/client.ts`
 * importa `server-only` y lee dos variables del entorno, así que sin inyección
 * esta capa no se podría testear sin red. Las Route Handlers pasan
 * `createClientAdmin()`.
 *
 * `data` se tipa como `unknown` a propósito: la respuesta de PostgREST no está
 * garantizada por el compilador, y `toSessionRow` valida la forma en runtime en
 * vez de confiar en el tipo genérico.
 */

import { generateSessionToken, hashSessionToken, isValidSessionToken } from '@/lib/auth';

type QueryError = { message: string } | null;
type SingleResult = { data: unknown; error: QueryError };

/**
 * Subconjunto de `SupabaseClient` que usa esta capa. Declarar solo lo que se
 * usa mantiene los fakes de los tests manejables.
 *
 * Los builders de supabase-js v2 son *thenable* con `catch`/`finally` propios,
 * no `Promise`: por eso el contrato dice `PromiseLike` y no `Promise`. Con
 * `Promise` el cliente real no era asignable y el error aparecía en cada ruta.
 */
export type SessionClient = {
  from: (table: 'auth_sessions') => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: unknown,
      ) => {
        maybeSingle: () => PromiseLike<SingleResult>;
      };
    };
    insert: (
      values: Record<string, unknown>,
    ) => {
      select: (columns: string) => {
        single: () => PromiseLike<SingleResult>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (
        column: string,
        value: unknown,
      ) => {
        is: (column: string, value: null) => PromiseLike<{ error: QueryError }>;
      };
    };
    delete: () => {
      lt: (column: string, value: string) => PromiseLike<{ error: QueryError }>;
    };
  };
};

/** Fila de `auth_sessions` tal como la ve la aplicación. */
export type SessionRow = {
  id: string;
  username: string;
  expires_at: string;
  revoked_at: string | null;
};

/**
 * Adaptador de `SupabaseClient` a `SessionClient`.
 *
 * Es el ÚNICO casteo del módulo, y no esconde una incompatibilidad que se
 * pudiera corregir: el chequeo estructural que haría TypeScript entre ambos
 * tipos agota su presupuesto de instanciación sobre la cadena genérica de
 * PostgREST y falla con TS2589 ("excessively deep"), tanto desde las rutas
 * como desde un archivo limpio.
 *
 * Qué sostiene la confianza en que las formas coinciden: este es el único punto
 * del proyecto que entra a `auth_sessions`, y los tests de este módulo ejercitan
 * cada operación contra un fake con la misma forma que declara `SessionClient`.
 * El costo asumido: si `SessionClient` dejara de reflejar el cliente real, el
 * primer síntoma sería un `error` de PostgREST en runtime, no un error de
 * compilación.
 */
export function asSessionClient(client: unknown): SessionClient {
  return client as SessionClient;
}

export type SessionResult =
  | { success: true; token: string; session: SessionRow }
  | { success: false; message: string };

const SESSION_COLUMNS = 'id, username, expires_at, revoked_at';

/**
 * Valida la forma de la fila. PostgREST devuelve `null` o un objeto, pero un
 * `revoked_at` inesperado o una fecha no parseable tienen que caer acá, no
 * propagarse como una sesión viva.
 */
function toSessionRow(value: unknown): SessionRow | null {
  if (!value || typeof value !== 'object') return null;

  const row = value as Record<string, unknown>;

  if (typeof row.id !== 'string' || row.id.length === 0) return null;
  if (typeof row.username !== 'string' || row.username.length === 0) return null;
  if (typeof row.expires_at !== 'string' || Number.isNaN(Date.parse(row.expires_at))) {
    return null;
  }
  if (row.revoked_at !== null && typeof row.revoked_at !== 'string') return null;

  return {
    id: row.id,
    username: row.username,
    expires_at: row.expires_at,
    revoked_at: typeof row.revoked_at === 'string' ? row.revoked_at : null,
  };
}

/** ¿La sesión sigue sirviendo? Revocada o vencida = muerta. */
export function isSessionActive(session: SessionRow, now: number = Date.now()): boolean {
  if (session.revoked_at) return false;
  return Date.parse(session.expires_at) > now;
}

/**
 * Emite una sesión nueva para `username`.
 *
 * Nunca se manda un token parcial: si el insert falla no hay sesión, y la ruta
 * responde error en vez de mandar un token que después no valida.
 */
export async function createSession(
  client: SessionClient,
  username: string,
  sessionTtlMs: number,
): Promise<SessionResult> {
  await purgeExpiredSessions(client);

  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();

  const { data, error } = await client
    .from('auth_sessions')
    .insert({
      token_hash: hashSessionToken(token),
      username,
      expires_at: expiresAt,
    })
    .select(SESSION_COLUMNS)
    .single();

  if (error) {
    return { success: false, message: error.message };
  }

  const session = toSessionRow(data);
  if (!session) {
    return { success: false, message: 'La sesión creada no tiene una forma válida.' };
  }

  return { success: true, token, session };
}

/**
 * Resuelve el token a su sesión viva, o `null`.
 *
 * El formato se valida antes de consultar: un `Cookie: basura` no genera
 * tráfico a Postgres.
 */
export async function getSession(
  client: SessionClient,
  token: string | null | undefined,
): Promise<SessionRow | null> {
  if (!isValidSessionToken(token)) return null;

  const { data, error } = await client
    .from('auth_sessions')
    .select(SESSION_COLUMNS)
    .eq('token_hash', hashSessionToken(token as string))
    .maybeSingle();

  if (error) return null;

  const session = toSessionRow(data);
  if (!session) return null;

  return isSessionActive(session) ? session : null;
}

/**
 * Revoca la sesión de un token. Idempotente: un token desconocido o ya revocado
 * no es un error, es el estado esperado de un logout repetido.
 */
export async function revokeSession(
  client: SessionClient,
  token: string | null | undefined,
): Promise<boolean> {
  if (!isValidSessionToken(token)) return false;

  const { error } = await client
    .from('auth_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', hashSessionToken(token as string))
    .is('revoked_at', null);

  return !error;
}

/**
 * Borra las sesiones vencidas. Oportunista, en cada login: no vale la pena un
 * cron para una tabla de una fila. Los errores se ignoran a propósito — si la
 * purga falla, el login tiene que funcionar igual.
 */
export async function purgeExpiredSessions(client: SessionClient): Promise<void> {
  try {
    await client
      .from('auth_sessions')
      .delete()
      .lt('expires_at', new Date().toISOString());
  } catch {
    // Sin efecto: la purga es higiene, no una precondición.
  }
}
