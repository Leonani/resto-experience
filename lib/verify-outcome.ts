/**
 * Clasificación de la respuesta de `POST /api/auth/verify`.
 *
 * Existe para separar dos cosas que antes eran indistinguibles en la UI:
 *
 *   - "no hay sesión" → modo lectura, que es el estado NORMAL de quien no se
 *     logueó. No es un error y no debe alarmar.
 *   - "no se pudo saber si hay sesión" → el servidor falló, la red cortó o la
 *     respuesta no era la esperada. Antes esto caía en el mismo `anonimo` y la
 *     app se veía perfectamente sana mientras, por ejemplo, le faltaba
 *     `SUPABASE_SERVICE_ROLE_KEY` en el servidor.
 *
 * Solo el 401 significa "no hay sesión". Cualquier otro código, un body que no
 * se puede parsear o un body con forma inesperada es un error de verificación:
 * fingir que es "anónimo" esconde una mala configuración detrás de una pantalla
 * que parece normal.
 *
 * Función pura y sin dependencias de servidor para que la pueda usar el
 * Client Component y testear sin red.
 */

export type VerifyOutcome =
  | { kind: 'autenticado'; user: string; expiresAt: string | null }
  | { kind: 'anonimo' }
  | { kind: 'error'; message: string };

/** Mensaje cuando el `fetch` ni siquiera pudo completarse (red caída, CORS). */
export const VERIFY_NETWORK_ERROR =
  'No se pudo conectar con el servidor para verificar la sesión.';

export function classifyVerifyResponse(input: {
  ok: boolean;
  status: number;
  /** `null` cuando la respuesta no era JSON válido. */
  body: unknown;
}): VerifyOutcome {
  // 401 es la ÚNICA respuesta que significa "no hay sesión". Es el estado
  // esperado de un visitante anónimo y no se reporta como error.
  if (input.status === 401) {
    return { kind: 'anonimo' };
  }

  if (input.ok) {
    const session = readVerifiedSession(input.body);

    if (session) {
      return {
        kind: 'autenticado',
        user: session.user,
        expiresAt: typeof session.expiresAt === 'string' ? session.expiresAt : null,
      };
    }

    return {
      kind: 'error',
      message: 'La respuesta del servidor no fue válida.',
    };
  }

  return { kind: 'error', message: describeFailure(input.status, input.body) };
}

function readVerifiedSession(body: unknown): { user: string; expiresAt: unknown } | null {
  if (!isRecord(body)) return null;
  if (body.success !== 'ok') return null;

  const data = body.data;
  if (!isRecord(data)) return null;
  if (typeof data.user !== 'string' || data.user.length === 0) return null;

  return { user: data.user, expiresAt: data.expiresAt };
}

/**
 * Un 5xx (o cualquier no-ok) sin cuerpo JSON es la firma de un error de
 * servidor que se lanzó antes de poder responder: por ejemplo, falta
 * `SUPABASE_SERVICE_ROLE_KEY` y `createClientAdmin()` tira. Next devuelve HTML
 * o texto plano, no el contrato `{success, data, message}`.
 */
function describeFailure(status: number, body: unknown): string {
  const contractMessage = readMessage(body);

  if (contractMessage) return contractMessage;
  if (body === null || body === undefined) {
    return `El servidor respondió ${status} sin un cuerpo válido.`;
  }

  return `El servidor respondió ${status}.`;
}

function readMessage(body: unknown): string | null {
  if (!isRecord(body)) return null;
  if (typeof body.message !== 'string') return null;

  const trimmed = body.message.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
