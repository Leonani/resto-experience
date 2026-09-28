import { isReplyAuthorized, readAuthConfig } from '@/lib/auth';
import {
  buildErrorResponse,
  buildSuccessResponse,
  type ApiResponse,
  type VerifyResult,
} from '@/lib/types/api';

/**
 * POST /api/auth/verify
 *
 * Valida el token que el cliente guardó en la sesión. Sin auditoría a
 * propósito: es una verificación de estado, no una mutación, y auditar cada
 * `verify` ensuciaría el log sin agregar traza útil.
 */
export async function POST(request: Request): Promise<Response> {
  const config = readAuthConfig();

  if (!config || !isReplyAuthorized(request, config)) {
    return jsonResponse(
      buildErrorResponse<VerifyResult>('Sesión no válida.'),
      401,
    );
  }

  return jsonResponse(
    buildSuccessResponse<VerifyResult>(
      { user: config.loginUser },
      'Sesión válida.',
    ),
  );
}

function jsonResponse<T>(body: ApiResponse<T>, status = 200): Response {
  return Response.json(body, { status });
}