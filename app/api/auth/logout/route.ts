import { logAuditEvent } from '@/lib/audit';
import { clearSessionCookie, readSessionCookie } from '@/lib/auth';
import { asSessionClient, getSession, revokeSession } from '@/lib/session';
import { createClientAdmin } from '@/lib/supabase/client';
import {
  buildSuccessResponse,
  type ApiResponse,
  type LogoutResult,
} from '@/lib/types/api';

/**
 * POST /api/auth/logout
 *
 * Cierra la sesión de verdad: revoca la fila en `auth_sessions` y limpia la
 * cookie. Antes, "logout" era borrar la clave de `localStorage`, que solo
 * ocultaba la sesión: el token seguía siendo válido y se podía seguir
 * escribiendo con él desde cualquier pestaña.
 *
 * Idempotente a propósito: cerrar sesión sin tener sesión es un estado normal,
 * no un error. Un 401 en el logout dejaría la interfaz en un limbo si el usuario
 * hace doble clic o si la sesión ya expiró.
 *
 * Se audita como `AUTH_LOGOUT`. La sesión se resuelve antes de revocar para
 * poder dejar el username en la traza: `getSession` filtra las revocadas, así
 * que al revés no devolvería nada. Son dos consultas, pero solo en un logout
 * disparado por el usuario.
 */
export async function POST(request: Request): Promise<Response> {
  const token = readSessionCookie(request);
  let revoked = false;
  let user: string | null = null;

  if (token) {
    const admin = asSessionClient(createClientAdmin());

    const session = await getSession(admin, token);
    user = session?.username ?? null;
    revoked = await revokeSession(admin, token);
  }

  await logAuditEvent({
    action: 'AUTH_LOGOUT',
    entity_name: 'auth',
    entity_id: user,
    method: 'POST',
    request_payload: null,
    response_status: 'ok',
    response_data: { revoked },
    error_message: null,
  });

  const response = jsonResponse(
    buildSuccessResponse<LogoutResult>({ revoked }, 'Sesión cerrada.'),
  );

  response.headers.append('set-cookie', clearSessionCookie());

  return response;
}

function jsonResponse<T>(body: ApiResponse<T>, status = 200): Response {
  return Response.json(body, { status });
}
