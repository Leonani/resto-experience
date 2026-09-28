import { timingSafeEqual, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { logAuditEvent } from '@/lib/audit';
import { importReviewsFile } from '@/lib/import/reviews';
import {
  buildErrorResponse,
  buildSuccessResponse,
  type ApiResponse,
  type ImportResult,
} from '@/lib/types/api';
import type { ReviewsFile } from '@/lib/types/review';

/**
 * POST /api/import
 *
 * Siembra el catálogo (restaurantes y sedes) e importa las reseñas desde
 * `data/reviews.json`. Idempotente: se puede correr las veces que haga falta.
 *
 * Se lee el archivo del disco en vez de aceptar un body porque el dataset es
 * una fixture versionada en el repo. Aceptar un body arbitrario haría de este
 * endpoint una vía para escribir filas arbitrarias con la service role.
 *
 * Protegido con `IMPORT_TOKEN`. Es un endpoint destructivo público: sin
 * autenticación, cualquiera que conozca la URL podría reescribir el catálogo.
 * El token viaja en el header `x-import-token` y se compara en tiempo constante
 * para no filtrar el valor por diferencia de tiempo de respuesta.
 */
export async function POST(request: Request): Promise<Response> {
  const unauthorized = checkImportToken(request);
  if (unauthorized) return unauthorized;

  try {
    const filePath = path.join(process.cwd(), 'data', 'reviews.json');
    const raw = await readFile(filePath, 'utf-8');
    const file = JSON.parse(raw) as ReviewsFile;

    const { outcome, restaurantsSeeded, locationsSeeded, error } =
      await importReviewsFile(file);

    if (error) {
      // Se audita el fallo. Sin esto, un error de importación sería
      // indistinguible de un archivo vacío.
      await logAuditEvent({
        action: 'IMPORT_REVIEWS',
        entity_name: 'reviews',
        entity_id: null,
        method: 'POST',
        request_payload: { file: 'data/reviews.json', received: file.reviews.length },
        response_status: 'fail',
        response_data: null,
        error_message: error,
      });

      return jsonResponse(
        buildErrorResponse<ImportResult>(`Falló la importación: ${error}`),
        500,
      );
    }

    // RN-07: cada descarte se audita por separado, con su motivo.
    for (const skip of outcome.skippedDetails) {
      await logAuditEvent({
        action: 'SKIP_REVIEW',
        entity_name: 'reviews',
        entity_id: skip.reviewId,
        method: 'POST',
        request_payload: { file: 'data/reviews.json' },
        response_status: 'fail',
        response_data: skip,
        error_message: skip.detail,
      });
    }

    const data: ImportResult = {
      ...outcome,
      restaurantsSeeded,
      locationsSeeded,
    };

    await logAuditEvent({
      action: 'IMPORT_REVIEWS',
      entity_name: 'reviews',
      entity_id: null,
      method: 'POST',
      request_payload: {
        file: 'data/reviews.json',
        received: outcome.received,
        restaurants: restaurantsSeeded,
        locations: locationsSeeded,
      },
      response_status: 'ok',
      response_data: data,
      error_message: null,
    });

    return jsonResponse(
      buildSuccessResponse<ImportResult>(
        data,
        `Importación completa: ${outcome.inserted} nuevas, ${outcome.updated} actualizadas, ` +
          `${outcome.skipped} omitidas, ${outcome.duplicates} duplicadas.`,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';

    await logAuditEvent({
      action: 'IMPORT_REVIEWS',
      entity_name: 'reviews',
      entity_id: null,
      method: 'POST',
      request_payload: null,
      response_status: 'fail',
      response_data: null,
      error_message: message,
    });

    return jsonResponse(
      buildErrorResponse<ImportResult>(`Error inesperado: ${message}`),
      500,
    );
  }
}

function jsonResponse<T>(body: ApiResponse<T>, status = 200): Response {
  return Response.json(body, { status });
}

/**
 * Falla cerrado. Si `IMPORT_TOKEN` no está configurado, el endpoint no corre.
 *
 * La alternativa —"si no hay token, abrir igual"— sería exactamente el patrón
 * de fallback a la anon key que se critica en `lib/supabase/client.ts`: la
 * app parecería funcionar en producción con la protección apagada, y nadie se
 * enteraría hasta que alguien explotara el endpoint.
 */
function checkImportToken(request: Request): Response | null {
  const expected = process.env.IMPORT_TOKEN;

  if (!expected) {
    return jsonResponse(
      buildErrorResponse<ImportResult>(
        'IMPORT_TOKEN no está configurado. Definalo en .env.local para habilitar la importación. ' +
          'El endpoint queda cerrado a propósito: sin token, cualquiera que conozca la URL ' +
          'podría reescribir el catálogo.',
      ),
      503,
    );
  }

  const provided = request.headers.get('x-import-token') ?? '';

  if (!tokenMatches(provided, expected)) {
    return jsonResponse(
      buildErrorResponse<ImportResult>('Token de importación inválido.'),
      401,
    );
  }

  return null;
}

/**
 * Comparación en tiempo constante. Un `===` sobre strings devuelve false
 * apenas encuentra la primera diferencia, y esa diferencia se puede medir
 * desde fuera para reconstruir el token byte a byte.
 *
 * Se hashean ambos lados para que tengan largo fijo: `timingSafeEqual` exige
 * buffers del mismo tamaño y sin el hash, comparar dos tokens de largo
 * distinto filtraría la longitud.
 */
function tokenMatches(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
