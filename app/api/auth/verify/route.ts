import { isReplyAuthorized, readAuthConfig } from '@/lib/auth';
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
 * Valida el token que el cliente guardó en la sesión y devuelve el nombre del
 * usuario autenticado (que vive en `auth_users`, no en el entorno). Sin
 * auditoría a propósito: es una verificación de estado, no una mutación, y
 * auditar cada `verify` ensuciaría el log sin agregar traza útil.
 */
export async function POST(request: Request): Promise<Response> {
  const config = readAuthConfig();

  if (!config || !isReplyAuthorized(request, config)) {
    return jsonResponse(
      buildErrorResponse<VerifyResult>('Sesión no válida.'),
      401,
    );
  }

  const admin = createClientAdmin();
  const { data, error } = await admin.from('auth_users').select('username').limit(1);

  if (error || !data?.[0]?.username) {
    return jsonResponse(
      buildErrorResponse<VerifyResult>('Sesión no válida.'),
      401,
    );
  }

  return jsonResponse(
    buildSuccessResponse<VerifyResult>(
      { user: data[0].username },
      'Sesión válida.',
    ),
  );
}

function jsonResponse<T>(body: ApiResponse<T>, status = 200): Response {
  return Response.json(body, { status });
}