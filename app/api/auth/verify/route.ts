import { buildSessionCookie, readSessionConfig, readSessionCookie } from '@/lib/auth';
import { asSessionClient, getSession } from '@/lib/session';
import { createClientAdmin } from '@/lib/supabase/client';
import {
  buildErrorResponse,
  buildSuccessResponse,
  type ApiResponse,
  type VerifyResult,
} from '@/lib/types/api';

/**
 * POST /api/auth/verify
 *
 * Responde "¿hay sesión?" al abrir la app. El token sale de la cookie
 * `HttpOnly` (el cliente no lo tiene, y no podría mandarlo si lo tuviera) y se
 * resuelve contra `auth_sessions`.
 *
 * El usuario viene de la fila de la sesión, no de un `select` sobre `auth_users`:
 * leer "el primer usuario de la tabla" era el bug de la versión anterior — con
 * más de un usuario, cualquier sesión válida se habría presentado como el
 * primero.
 *
 * Sin auditoría a propósito: es una verificación de estado, no una mutación, y
 * auditar cada `verify` ensuciaría el log sin agregar traza útil.
 */
export async function POST(request: Request): Promise<Response> {
  const token = readSessionCookie(request);
  const { sessionTtlMs } = readSessionConfig();
  const session = await getSession(
    asSessionClient(createClientAdmin()),
    token,
  );

  if (!session || !token) {
    return jsonResponse(
      buildErrorResponse<VerifyResult>('Sesión no válida o vencida.'),
      401,
    );
  }

  const response = jsonResponse(
    buildSuccessResponse<VerifyResult>(
      { user: session.username, expiresAt: session.expires_at },
      'Sesión válida.',
    ),
  );

  // Se renueva la cookie para que su ventana no termine antes que la fila: si
  // el navegador guardara el token más tiempo que `auth_sessions`, el 401
  // llegaría en el peor momento. La expiración real sigue siendo la de la base.
  response.headers.append(
    'set-cookie',
    buildSessionCookie(token, sessionTtlMs, process.env.NODE_ENV === 'production'),
  );

  return response;
}

function jsonResponse<T>(body: ApiResponse<T>, status = 200): Response {
  return Response.json(body, { status });
}
