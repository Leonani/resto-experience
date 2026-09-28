import 'server-only';

import { createClientAdmin } from '@/lib/supabase/client';
import type { AuditLogEntry } from '@/lib/types/review';

/**
 * Auditoría. Toda operación que cree, modifique o rechace datos escribe aquí.
 *
 * Principio (RN-07): se audita también el fallo. Una reseña descartada por
 * sede inexistente deja el mismo estado observable que una que nunca llegó.
 * Sin log, un descarte es indistinguible de un dato perdido.
 */

/**
 * `JSON.stringify` puede fallar por referencias circulares, BigInt o funciones.
 * Un `JSONB` con `undefined` (en vez de `null`) rompe la consulta entera.
 * Perder el detalle de un log es aceptable; perder la mutación, no.
 */
export function safeJson(value: unknown): string | null {
  if (value === undefined) return null;

  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return null;
    return serialized;
  } catch {
    return null;
  }
}

/**
 * Convierte un valor para insertar en una columna `jsonb`: pasa por
 * `safeJson` para limpiar `undefined` y valores circulares, y luego vuelve a
 * parsear a un objeto real.
 *
 * Por qué el parse: si se inserta el *string* JSON en una columna `jsonb`,
 * PostgreSQL lo guarda como un string jsonb (doble encoding) y ningún `->>` se
 * vuelve a poder usar sobre él — `jsonb_typeof` devuelve `'string'` y las
 * consultas por campo devuelven `null`. Las filas históricas escritas por el
 * vetusto `safeJson` directo conservan ese defecto; se normalizaron en la base
 * con un `UPDATE` (jsonb string → objeto) cuando se corrigió esto.
 */
export function cleanForJsonb(value: unknown): unknown {
  const serialized = safeJson(value);
  if (serialized === null) return null;

  try {
    return JSON.parse(serialized);
  } catch {
    return null;
  }
}

type LogAuditEventInput = Omit<
  AuditLogEntry,
  'method' | 'request_payload' | 'response_data'
> & {
  method: AuditLogEntry['method'];
  request_payload?: unknown;
  response_data?: unknown;
};

/**
 * Escribe un registro en `audit_logs`.
 *
 * NUNCA lanza. Si la auditoría falla, la operación de negocio ya se ejecutó y
 * propagar el error dejaría al cliente creyendo que no se guardó algo que sí
 * se guardó. Se registra el problema en el log del servidor y se sigue.
 *
 * Consecuencia asumida: se puede perder una entrada de auditoría. La
 * alternativa (hacer fallar la mutación si falla el log) sacrifica la
 * disponibilidad del dato real por la integridad del registro, y en esta
 * herramienta el gerente depende del dato.
 */
export async function logAuditEvent(entry: LogAuditEventInput): Promise<void> {
  try {
    const supabase = createClientAdmin();
    const { error } = await supabase.from('audit_logs').insert({
      action: entry.action,
      entity_name: entry.entity_name,
      entity_id: entry.entity_id,
      method: entry.method,
      request_payload: cleanForJsonb(entry.request_payload),
      response_status: entry.response_status,
      response_data: cleanForJsonb(entry.response_data),
      error_message: entry.error_message,
    });

    // La API de supabase-js no lanza excepciones: devuelve { error }.
    // Por eso este chequeo explícito. Sin él, el fallo sería silencioso.
    if (error) {
      console.error('[audit] no se pudo registrar el evento:', {
        action: entry.action,
        entity_id: entry.entity_id,
        response_status: entry.response_status,
        error: error.message,
      });
    }
  } catch (error) {
    console.error(
      '[audit] excepción al registrar el evento:',
      error instanceof Error ? error.message : error,
    );
  }
}
