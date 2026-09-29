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
  /**
   * Motivo por el que se usó el borrador local a pesar de haber IA configurada:
   * se alcanzó el límite de generaciones IA (protección de costos). `null`
   * cuando la IA se pudo razonar normalmente. La interfaz lo muestra como nota
   * ámbar, distinta de la alerta roja de `aiError`.
   */
  budgetReason: string | null;
};

/** Payload de una respuesta guardada. */
export type SaveReplyResult = {
  reviewId: string;
  replyText: string;
  repliedAt: string;
};

/**
 * Payload de un login exitoso. La sesión ya no viaja en la respuesta: el token
 * va en una cookie `HttpOnly` que el navegador adjunta solo, así que el
 * JavaScript de la página nunca lo ve.
 */
export type LoginResult = {
  user: string;
  /** ISO de cuándo vence la sesión. El cliente la usa solo para informar. */
  expiresAt: string;
};

/** Payload de verificación de sesión. `user` sale de la fila de `auth_sessions`. */
export type VerifyResult = {
  user: string;
  expiresAt: string;
};

/** Payload de un logout. `revoked` dice si había una sesión viva que revocar. */
export type LogoutResult = {
  revoked: boolean;
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
