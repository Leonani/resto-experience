/**
 * Tipos del dominio. Reflejan 1:1 las tablas de supabase/schema.sql.
 */

/** Fila de `restaurants`. */
export type Restaurant = {
  id: string;
  name: string;
};

/** Fila de `locations`. */
export type Location = {
  id: string;
  restaurant_id: string;
  name: string;
};

/** Fila de `reviews`. `rating` es nullable a propósito (RN-03). */
export type Review = {
  id: string;
  location_id: string;
  author: string;
  rating: number | null;
  text: string;
  published_at: string;
  updated_at: string;
  reply_text: string | null;
  replied_at: string | null;
};

/** Acciones registradas en `audit_logs`. */
export type AuditAction =
  | 'IMPORT_REVIEWS'
  | 'IMPORT_REPLY'
  | 'SKIP_REVIEW'
  | 'GENERATE_AI_DRAFT'
  | 'SAVE_REPLY'
  | 'AUTH_LOGIN';

/** Origen técnico de la operación. */
export type AuditMethod = 'POST' | 'SERVER_ACTION' | 'SCRIPT';

export type AuditStatus = 'ok' | 'fail';

/** Fila de `audit_logs`, tal como se inserta. */
export type AuditLogEntry = {
  action: AuditAction;
  entity_name: string | null;
  entity_id: string | null;
  method: AuditMethod;
  request_payload: unknown;
  response_status: AuditStatus;
  response_data: unknown;
  error_message: string | null;
};

/* -------------------------------------------------------------------------
 * Shape del fixture data/reviews.json
 *
 * Deliberadamente distinto de `Review`: el archivo externo trae la respuesta
 * anidada en un objeto `reply`, mientras que la tabla la aplana en dos
 * columnas. Confundir los dos shapes es el error más probable de A3.4.
 * ---------------------------------------------------------------------- */

export type SourceReply = {
  text: string;
  replied_at: string;
};

export type SourceReview = {
  id: string;
  location_id: string;
  author: string;
  rating: number | null;
  text: string;
  published_at: string;
  updated_at: string;
  reply?: SourceReply;
};

export type SourceLocation = {
  id: string;
  restaurant_id: string;
  name: string;
};

export type SourceRestaurant = {
  id: string;
  name: string;
};

export type ReviewsFile = {
  restaurants: SourceRestaurant[];
  locations: SourceLocation[];
  reviews: SourceReview[];
};

/* -------------------------------------------------------------------------
 * Filtros — viven en la URL, no en el estado del cliente.
 * ---------------------------------------------------------------------- */

export type EstadoFilter = 'pendientes' | 'respondidas' | 'todas';

export type EstrellasFilter = 'todas' | 'alta' | 'media' | 'baja' | 'sin';

export type Filtros = {
  sede: string | null;
  estado: EstadoFilter;
  estrellas: EstrellasFilter;
};

export const ESTADOS: EstadoFilter[] = ['pendientes', 'respondidas', 'todas'];
export const ESTRELLAS: EstrellasFilter[] = ['todas', 'alta', 'media', 'baja', 'sin'];

/** Etiquetas para la UI. */
export const ESTRELLAS_LABEL: Record<EstrellasFilter, string> = {
  todas: 'Todas',
  alta: '4–5 estrellas',
  media: '3 estrellas',
  baja: '1–2 estrellas',
  sin: 'Sin calificar',
};

/**
 * Cortes de estrellas por etiqueta. `media` incluye el 3, `alta` el 4 y el 5.
 * `sin` no es un rango: se resuelve aparte porque `rating` es `null` y no 0.
 */
export const ESTRELLAS_RANGO: Record<Exclude<EstrellasFilter, 'sin'>, number[]> = {
  todas: [],
  alta: [4, 5],
  media: [3],
  baja: [1, 2],
};

/**
 * ¿Está la reseña respondida?
 *
 * Un `reply_text` vacío o en blanco cuenta como PENDIENTE. Acordado con el
 * usuario: sin texto no hay respuesta, y guardarla vacía está bloqueado por
 * el endpoint. Tratar `''` como respondida mostraría la reseña en el filtro
 * "respondidas" sin nada que leer.
 */
export function isResponded(review: { reply_text: string | null }): boolean {
  return typeof review.reply_text === 'string' && review.reply_text.trim().length > 0;
}
