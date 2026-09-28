/**
 * Contrato único de respuesta de la API.
 *
 * Toda Route Handler devuelve esta forma, sin excepciones. Ver la sección 4 de
 * docs/architecture.md para el razonamiento de por qué `success` es un string y
 * no un booleano.
 */

export type ApiSuccess = 'ok' | 'fail';

export type ApiResponse<T> = {
  success: ApiSuccess;
  data: T | null;
  message: string;
};

/** Payload de un import exitoso. */
export type ImportResult = {
  received: number;
  inserted: number;
  updated: number;
  skipped: number;
  duplicates: number;
  locationsSeeded: number;
  restaurantsSeeded: number;
  skippedDetails: SkippedReview[];
};

/** Un registro descartado, con el motivo. Se devuelve para que el import sea auditable. */
export type SkippedReview = {
  reviewId: string;
  reason: 'LOCATION_NOT_FOUND' | 'DUPLICATE' | 'INVALID_PAYLOAD';
  detail: string;
};

/** Payload de un borrador generado. Nunca se persiste: vive en el cliente. */
export type DraftResult = {
  reviewId: string;
  text: string;
  provider: string;
  fromFallback: boolean;
  /**
   * Mensaje del fallo de IA, si lo hubo. `null` cuando no hubo problema (incluye
   * el caso "sin key" que cae al template sin error). La interfaz lo muestra
   * como alerta, pero igual recibe `text` utilizable para seguir trabajando.
   */
  aiError: string | null;
};

/** Payload de una respuesta guardada. */
export type SaveReplyResult = {
  reviewId: string;
  replyText: string;
  repliedAt: string;
};

export function buildSuccessResponse<T>(data: T, message: string): ApiResponse<T> {
  return { success: 'ok', data, message };
}

export function buildErrorResponse<T = never>(
  message: string,
  data: T | null = null,
): ApiResponse<T> {
  return { success: 'fail', data, message };
}
