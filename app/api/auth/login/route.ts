import { logAuditEvent } from '@/lib/audit';
import { buildSessionCookie, readSessionConfig, verifyPassword } from '@/lib/auth';
import { asSessionClient, createSession } from '@/lib/session';
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
 * en la base, no en el entorno) y abre una sesión: emite un token opaco, guarda
 * solo su SHA-256 en `auth_sessions` y lo devuelve en una cookie `HttpOnly`.
 *
 * El token nunca pasa por el cuerpo de la respuesta. Con `HttpOnly` +
 * `SameSite=Lax` el JavaScript de la página no puede leerlo, así que un XSS no
 * puede robar la sesión: ese era el agujero de la versión con `localStorage`.
 *
 * La contraseña nunca viaja a la auditoría: `request_payload` lleva solo el
 * username. El fallo de login se audita (RN-07: se registra también el
 * rechazo); sin log, un intento fallido es indistinguible de que nadie tocó la
 * app.
 *
 * Si la sesión no se puede crear, el login NO devuelve 200 con una promesa de
 * sesión: eso dejaría al usuario creyendo que quedó conectado cuando la
 * siguiente escritura va a fallar. Responde 500 y que vuelva a intentar.
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

  if (!ok) {
    await logAuditEvent({
      action: 'AUTH_LOGIN',
      entity_name: 'auth',
      entity_id: null,
      method: 'POST',
      request_payload: { username: username ?? null },
      response_status: 'fail',
      response_data: null,
      error_message: 'Credenciales incorrectas.',
    });

    return jsonResponse(
      buildErrorResponse<LoginResult>('Usuario o contraseña incorrectos.'),
      401,
    );
  }

  const { sessionTtlMs } = readSessionConfig();
  const created = await createSession(
    asSessionClient(admin),
    user.username,
    sessionTtlMs,
  );

  if (!created.success) {
    await logAuditEvent({
      action: 'AUTH_LOGIN',
      entity_name: 'auth',
      entity_id: user.username,
      method: 'POST',
      request_payload: { username: username ?? null },
      response_status: 'fail',
      response_data: null,
      error_message: `No se pudo crear la sesión: ${created.message}`,
    });

    return jsonResponse(
      buildErrorResponse<LoginResult>('No se pudo iniciar sesión.'),
      500,
    );
  }

  await logAuditEvent({
    action: 'AUTH_LOGIN',
    entity_name: 'auth',
    entity_id: user.username,
    method: 'POST',
    request_payload: { username: username ?? null },
    response_status: 'ok',
    response_data: { expires_at: created.session.expires_at },
    error_message: null,
  });

  const payload: LoginResult = {
    user: created.session.username,
    expiresAt: created.session.expires_at,
  };

  // `Secure` solo en producción: en http://localhost el navegador descarta la
  // cookie y no se podría ni probar el login en dev.
  const response = jsonResponse(
    buildSuccessResponse<LoginResult>(payload, 'Sesión iniciada.'),
  );

  response.headers.append(
    'set-cookie',
    buildSessionCookie(created.token, sessionTtlMs, process.env.NODE_ENV === 'production'),
  );

  return response;
}

function jsonResponse<T>(body: ApiResponse<T>, status = 200): Response {
  return Response.json(body, { status });
}
