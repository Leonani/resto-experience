import { logAuditEvent } from '@/lib/audit';
import {
  checkAiBudget,
  countRealAiAttempts,
  readAiBudget,
  type AiAttemptClient,
} from '@/lib/draft/budget';
import {
  DraftProviderError,
  readLlmConfig,
  selectProvider,
  TemplateDraftProvider,
  type DraftInput,
  type DraftOutput,
} from '@/lib/draft/provider';
import { createClientAdmin } from '@/lib/supabase/client';
import {
  buildErrorResponse,
  buildSuccessResponse,
  type ApiResponse,
  type DraftResult,
} from '@/lib/types/api';

/**
 * POST /api/generate-draft
 *
 * Genera un borrador de respuesta. NUNCA lo persiste: el borrador vive en el
 * estado del cliente y solo llega a `reviews.reply_text` cuando el usuario
 * confirma el guardado (RN-06).
 *
 * Sin `LLM_API_KEY` cae al template local con `fromFallback: true`, sin fingir
 * que la IA funcionó. Con IA configurada y fallo del proveedor, vuelve el
 * template con `aiError` para que la UI avise "Fallo borrador IA" en lugar de
 * callarse el problema.
 */
export async function POST(request: Request): Promise<Response> {
  let body: Partial<DraftInput> = {};

  try {
    body = (await request.json()) as Partial<DraftInput>;
  } catch {
    body = {};
  }

  const reviewId = body.reviewId;

  if (!reviewId) {
    return jsonResponse(
      buildErrorResponse<DraftResult>('Falta el campo reviewId en el body.'),
      400,
    );
  }

  const admin = createClientAdmin();

  // El texto de la reseña y el contexto salen de la base, no del body. El
  // cliente no puede pedir un borrador sobre un id arbitrario sin que quede
  // registro de qué reseña se estaba respondiendo.
  const { data: review, error: reviewError } = await admin
    .from('reviews')
    .select('id, rating, text, locations(name, restaurants(name))')
    .eq('id', reviewId)
    .maybeSingle();

  if (reviewError) {
    await logAuditEvent({
      action: 'GENERATE_AI_DRAFT',
      entity_name: 'reviews',
      entity_id: reviewId,
      method: 'POST',
      request_payload: { reviewId },
      response_status: 'fail',
      response_data: null,
      error_message: reviewError.message,
    });

    return jsonResponse(
      buildErrorResponse<DraftResult>('No se pudo leer la reseña.'),
      500,
    );
  }

  if (!review) {
    await logAuditEvent({
      action: 'GENERATE_AI_DRAFT',
      entity_name: 'reviews',
      entity_id: reviewId,
      method: 'POST',
      request_payload: { reviewId },
      response_status: 'fail',
      response_data: null,
      error_message: `La reseña ${reviewId} no existe.`,
    });

    return jsonResponse(
      buildErrorResponse<DraftResult>(`La reseña ${reviewId} no existe.`),
      404,
    );
  }

  const location = Array.isArray(review.locations) ? review.locations[0] : review.locations;
  const restaurant = location
    ? Array.isArray(location.restaurants)
      ? location.restaurants[0]
      : location.restaurants
    : null;

  const input: DraftInput = {
    reviewId,
    restaurantName: restaurant?.name ?? 'el restaurante',
    locationName: location?.name ?? 'la sede',
    rating: review.rating,
    text: review.text ?? '',
  };

  // `readLlmConfig` decide entre IA real y template según el entorno. Si la IA
  // está configurada pero falla, se cae al template SIN ocultar el problema:
  // `aiError` viaja hasta la UI para que avise.
  const llmConfig = readLlmConfig();
  let provider = selectProvider(llmConfig);
  let aiError: string | null = null;
  let budgetReason: string | null = null;

  // Protección de costos: solo corre cuando hay proveedor real (una llamada al
  // LLM cuesta plata; el template local es gratis). Sin margen en el
  // presupuesto, o sin poder verificarlo, se usa el template y `budgetReason`
  // explica por qué la IA no se usó.
  if (llmConfig) {
    const budget = readAiBudget();
    // El cast recorta los genéricos de postgrest a propósito: el shape mínimo
    // que `countRealAiAttempts` necesita no justifica que el compilador resuelva
    // el árbol completo de tipos del SupabaseClient (TS2589). El query se
    // valida en vivo contra audit_logs en la prueba de humo.
    const attemptsClient = admin as unknown as AiAttemptClient;
    const verdict = await checkAiBudget((fromIso) => countRealAiAttempts(attemptsClient, fromIso), budget);

    if (!verdict.allowed) {
      budgetReason = verdict.reason;
      provider = new TemplateDraftProvider();
    }
  }

  let result: DraftOutput;

  try {
    result = await provider.generate(input);
  } catch (err) {
    aiError =
      err instanceof DraftProviderError
        ? err.message
        : 'Ocurrió un error inesperado al generar el borrador.';
    result = await new TemplateDraftProvider().generate(input);
  }

  if (!result.text.trim()) {
    await logAuditEvent({
      action: 'GENERATE_AI_DRAFT',
      entity_name: 'reviews',
      entity_id: reviewId,
      method: 'POST',
      request_payload: { reviewId },
      response_status: 'fail',
      response_data: null,
      error_message: 'El proveedor devolvió un borrador vacío.',
    });

    return jsonResponse(
      buildErrorResponse<DraftResult>('No se pudo generar un borrador.'),
      502,
    );
  }

  const payload: DraftResult = {
    reviewId,
    text: result.text,
    provider: result.provider,
    fromFallback: result.fromFallback,
    aiError,
    budgetReason,
  };

  await logAuditEvent({
    action: 'GENERATE_AI_DRAFT',
    entity_name: 'reviews',
    entity_id: reviewId,
    method: 'POST',
    request_payload: { reviewId, rating: input.rating },
    response_status: aiError ? 'fail' : 'ok',
    response_data: {
      provider: payload.provider,
      fromFallback: payload.fromFallback,
      aiError,
      budgetReason,
    },
    error_message: aiError,
  });

  return jsonResponse(
    buildSuccessResponse<DraftResult>(
      payload,
      'Borrador generado. Todavía no está guardado: revisalo y confirmá para publicarlo.',
    ),
  );
}

function jsonResponse<T>(body: ApiResponse<T>, status = 200): Response {
  return Response.json(body, { status });
}
