import { logAuditEvent } from '@/lib/audit';
import { requireSession } from '@/lib/session-guard';
import { createClientAdmin } from '@/lib/supabase/client';
import {
  buildErrorResponse,
  buildSuccessResponse,
  type ApiResponse,
  type SaveReplyResult,
} from '@/lib/types/api';

/**
 * POST /api/save-reply
 *
 * Persiste la respuesta que el usuario confirmó. Este es el único camino por
 * el que `reviews.reply_text` se escribe desde la aplicación.
 *
 * Escritura protegida: exige la cookie de sesión `HttpOnly` y que la request
 * venga del mismo origen (CSRF — la cookie la manda el navegador sola, así que
 * el origen es la frontera). El guard va **antes de parsear el body**: una
 * request no autorizada no debería poder gastar ni un parseo.
 *
 * El rechazo se audita; sin log, un intento sin sesión es indistinguible de que
 * nadie tocó la app.
 */
export async function POST(request: Request): Promise<Response> {
  const guard = await requireSession(request);

  if (!guard.ok) {
    await logAuditEvent({
      action: 'SAVE_REPLY',
      entity_name: 'reviews',
      entity_id: null,
      method: 'POST',
      request_payload: null,
      response_status: 'fail',
      response_data: null,
      error_message: guard.message,
    });

    return jsonResponse(buildErrorResponse<SaveReplyResult>(guard.message), guard.status);
  }

  // `entity_id` de la auditoría sigue siendo la reseña, que es lo que se mutó.
  // El usuario va en el payload: antes era imposible saber quién respondió.
  const sessionUser = guard.session.username;

  let reviewId: string | undefined;
  let replyText: string | undefined;

  try {
    const body = (await request.json()) as { reviewId?: string; replyText?: string };
    reviewId = body.reviewId;
    replyText = body.replyText;
  } catch {
    return jsonResponse(
      buildErrorResponse<SaveReplyResult>('El body no es JSON válido.'),
      400,
    );
  }

  if (!reviewId) {
    return jsonResponse(
      buildErrorResponse<SaveReplyResult>('Falta el campo reviewId.'),
      400,
    );
  }

  // Una respuesta vacía no es una respuesta. Sin este chequeo, un doble clic
  // en Guardar con el campo en blanco escribiría `reply_text = ''`, que la
  // interfaz no puede distinguir de "guardado sin texto".
  if (typeof replyText !== 'string' || replyText.trim().length === 0) {
    await logAuditEvent({
      action: 'SAVE_REPLY',
      entity_name: 'reviews',
      entity_id: reviewId,
      method: 'POST',
      request_payload: { reviewId, user: sessionUser },
      response_status: 'fail',
      response_data: null,
      error_message: 'La respuesta no puede estar vacía.',
    });

    return jsonResponse(
      buildErrorResponse<SaveReplyResult>('La respuesta no puede estar vacía.'),
      400,
    );
  }

  const trimmed = replyText.trim();
  const repliedAt = new Date().toISOString();
  const admin = createClientAdmin();

  // Se verifica que la reseña exista antes de escribir. `update` no falla si
  // no matchea ninguna fila: devuelve `data: null` y `error: null`, que es
  // exactamente el tipo de fallo silencioso que hay que comprobar a mano.
  const { data: existing, error: lookupError } = await admin
    .from('reviews')
    .select('id')
    .eq('id', reviewId)
    .maybeSingle();

  if (lookupError) {
    await logAuditEvent({
      action: 'SAVE_REPLY',
      entity_name: 'reviews',
      entity_id: reviewId,
      method: 'POST',
      request_payload: { reviewId, user: sessionUser },
      response_status: 'fail',
      response_data: null,
      error_message: lookupError.message,
    });

    return jsonResponse(
      buildErrorResponse<SaveReplyResult>('No se pudo verificar la reseña.'),
      500,
    );
  }

  if (!existing) {
    await logAuditEvent({
      action: 'SAVE_REPLY',
      entity_name: 'reviews',
      entity_id: reviewId,
      method: 'POST',
      request_payload: { reviewId, user: sessionUser },
      response_status: 'fail',
      response_data: null,
      error_message: `La reseña ${reviewId} no existe.`,
    });

    return jsonResponse(
      buildErrorResponse<SaveReplyResult>(`La reseña ${reviewId} no existe.`),
      404,
    );
  }

  const { data: updated, error: updateError } = await admin
    .from('reviews')
    .update({ reply_text: trimmed, replied_at: repliedAt })
    .eq('id', reviewId)
    .select('id, reply_text, replied_at')
    .maybeSingle();

  if (updateError) {
    await logAuditEvent({
      action: 'SAVE_REPLY',
      entity_name: 'reviews',
      entity_id: reviewId,
      method: 'POST',
      request_payload: { reviewId, replyText: trimmed, user: sessionUser },
      response_status: 'fail',
      response_data: null,
      error_message: updateError.message,
    });

    return jsonResponse(
      buildErrorResponse<SaveReplyResult>('No se pudo guardar la respuesta.'),
      500,
    );
  }

  if (!updated) {
    await logAuditEvent({
      action: 'SAVE_REPLY',
      entity_name: 'reviews',
      entity_id: reviewId,
      method: 'POST',
      request_payload: { reviewId, replyText: trimmed, user: sessionUser },
      response_status: 'fail',
      response_data: null,
      error_message: 'La actualización no devolvió filas.',
    });

    return jsonResponse(
      buildErrorResponse<SaveReplyResult>('No se pudo guardar la respuesta.'),
      500,
    );
  }

  const data: SaveReplyResult = {
    reviewId,
    replyText: trimmed,
    repliedAt,
  };

  await logAuditEvent({
    action: 'SAVE_REPLY',
    entity_name: 'reviews',
    entity_id: reviewId,
    method: 'POST',
    request_payload: { reviewId, replyText: trimmed, user: sessionUser },
    response_status: 'ok',
    response_data: data,
    error_message: null,
  });

  return jsonResponse(
    buildSuccessResponse<SaveReplyResult>(data, 'Respuesta guardada.'),
  );
}

function jsonResponse<T>(body: ApiResponse<T>, status = 200): Response {
  return Response.json(body, { status });
}
