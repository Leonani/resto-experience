import { logAuditEvent } from '@/lib/audit';
import { readAuthConfig, verifyPassword } from '@/lib/auth';
import { createClientAdmin } from '@/lib/supabase/client';
import {
  buildErrorResponse,
  buildSuccessResponse,
  type ApiResponse,
  type LoginResult,
} from '@/lib/types/api';

/**
 * POST /api/auth/login
 *
 * Valida usuario/contraseña contra la tabla `auth_users` (el hash scrypt vive
 * en la base, no en el entorno) y devuelve, como respuesta, el token
 * `REVIEWS_REPLY_TOKEN` que las escrituras exigen.
 *
 * La contraseña nunca viaja a la auditoría: `request_payload` lleva solo el
 * username. El fallo de login se audita (RN-07: se registra también el
 * rechazo); sin log, un intento fallido es indistinguible de que nadie tocó la
 * app.
 *
 * Fail-closed en dos puntos: sin `REVIEWS_REPLY_TOKEN` el servidor responde
 * 503 (no puede entregar una sesión que sirva), y sin fila en `auth_users` las
 * credenciales son incorrectas (401). Nunca se deja pasar un login por un
 * accidente de entorno o de datos.
 */
export async function POST(request: Request): Promise<Response> {
  let username: string | undefined;
  let password: string | undefined;

  try {
    const body = (await request.json()) as { username?: unknown; password?: unknown };
    username = typeof body.username === 'string' ? body.username : undefined;
    password = typeof body.password === 'string' ? body.password : undefined;
  } catch {
    // Se responde 401 más abajo: faltan credenciales.
  }

  const config = readAuthConfig();

  if (!config) {
    await logAuditEvent({
      action: 'AUTH_LOGIN',
      entity_name: 'auth',
      entity_id: null,
      method: 'POST',
      request_payload: { username: username ?? null },
      response_status: 'fail',
      response_data: null,
      error_message: 'Autenticación de escritura no configurada en el servidor.',
    });

    return jsonResponse(
      buildErrorResponse<LoginResult>(
        'Autenticación de escritura no configurada en el servidor.',
      ),
      503,
    );
  }

  const admin = createClientAdmin();

  // `eq('username', '')` no matchea; si el body no trajo username, no hay fila
  // y las credenciales son incorrectas (401), no un error de config.
  const { data, error } = await admin
    .from('auth_users')
    .select('username, password_hash')
    .eq('username', username ?? '');

  if (error) {
    await logAuditEvent({
      action: 'AUTH_LOGIN',
      entity_name: 'auth',
      entity_id: null,
      method: 'POST',
      request_payload: { username: username ?? null },
      response_status: 'fail',
      response_data: null,
      error_message: error.message,
    });

    return jsonResponse(
      buildErrorResponse<LoginResult>('No se pudo verificar el usuario.'),
      500,
    );
  }

  const user = data?.[0];
  const ok =
    !!user &&
    typeof password === 'string' &&
    verifyPassword(password, user.password_hash);

  await logAuditEvent({
    action: 'AUTH_LOGIN',
    entity_name: 'auth',
    entity_id: null,
    method: 'POST',
    request_payload: { username: username ?? null },
    response_status: ok ? 'ok' : 'fail',
    response_data: ok ? { user: user.username } : null,
    error_message: ok ? null : 'Credenciales incorrectas.',
  });

  if (!ok) {
    return jsonResponse(
      buildErrorResponse<LoginResult>('Usuario o contraseña incorrectos.'),
      401,
    );
  }

  return jsonResponse(
    buildSuccessResponse<LoginResult>(
      { token: config.replyToken, user: user.username },
      'Sesión iniciada.',
    ),
  );
}

function jsonResponse<T>(body: ApiResponse<T>, status = 200): Response {
  return Response.json(body, { status });
}