import { logAuditEvent } from '@/lib/audit';
import { readAuthConfig, verifyCredentials } from '@/lib/auth';
import {
  buildErrorResponse,
  buildSuccessResponse,
  type ApiResponse,
  type LoginResult,
} from '@/lib/types/api';

/**
 * POST /api/auth/login
 *
 * Valida las credenciales del usuario único configurado en el entorno
 * (`REVIEWS_LOGIN_USER` / `REVIEWS_LOGIN_PASS`) y devuelve, como respuesta, el
 * token `REVIEWS_REPLY_TOKEN` que las escrituras exigen.
 *
 * La contraseña nunca viaja a la auditoría: `request_payload` lleva solo el
 * username. El fallo de login se audita (RN-07: se registra también el rechazo);
 * sin log, un intento fallido es indistinguible de que nadie tocó la app.
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

  const ok =
    typeof username === 'string' &&
    typeof password === 'string' &&
    verifyCredentials(username, password, config);

  await logAuditEvent({
    action: 'AUTH_LOGIN',
    entity_name: 'auth',
    entity_id: null,
    method: 'POST',
    request_payload: { username: username ?? null },
    response_status: ok ? 'ok' : 'fail',
    response_data: ok ? { user: config.loginUser } : null,
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
      { token: config.replyToken, user: config.loginUser },
      'Sesión iniciada.',
    ),
  );
}

function jsonResponse<T>(body: ApiResponse<T>, status = 200): Response {
  return Response.json(body, { status });
}