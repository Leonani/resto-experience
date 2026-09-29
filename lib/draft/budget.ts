import 'server-only';

/**
 * Protección de costos de los borradores IA.
 *
 * La única parte que cuesta plata es la llamada real al proveedor. Cuando no hay
 * `LLM_API_KEY` la ruta usa el template local sin coste, así que este chequeo
 * solo corre si hay proveedor real configurado.
 *
 * La fuente de verdad es `audit_logs`: cada intento real de IA ya queda
 * registrado con `GENERATE_AI_DRAFT`. Lo que falta es un presupuesto: cuántos
 * intentos reales se permiten por ventana (1 hora y 24 horas) antes de dejar de
 * gastar plata. Contar los intentos desde el propio log evita agregar una tabla
 * o infraestructura nueva y mantiene el dato reconciliable con la trazabilidad.
 *
 * Fallo cerrado a propósito: si no se puede leer el contador no se sabe cuánto
 * se gastó, y pedir una llamada de la que no se puede auditar el costo es
 * exactamente el riesgo que esta capa existe para evitar. Se cae al template.
 */

export const DEFAULT_BUDGET_PER_HOUR = 20;
// El díal tiene piso de 16: un demo cubre generar un borrador para cada reseña
// de la bandeja. 50 es holgado y evita el default exagerado de un centenar de
// llamadas que jamás se alcanzan en un demo.
export const DEFAULT_BUDGET_PER_DAY = 50;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type AiBudget = {
  maxPerHour: number;
  maxPerDay: number;
};

export type BudgetVerdict = {
  allowed: boolean;
  reason: string | null;
};

/**
 * Lee los límites del entorno. Se pasa `env` por parámetro para no mutar
 * `process.env` en los tests. Valores inválidos caen a los defaults: un límite
 * de `0` o `NaN` no puede significar "ilimitado".
 */
export function readAiBudget(
  env: Record<string, string | undefined> = process.env,
): Required<AiBudget> {
  const perHour = Number(env.LLM_BUDGET_PER_HOUR);
  const perDay = Number(env.LLM_BUDGET_PER_DAY);

  return {
    maxPerHour: Number.isInteger(perHour) && perHour > 0 ? perHour : DEFAULT_BUDGET_PER_HOUR,
    maxPerDay: Number.isInteger(perDay) && perDay > 0 ? perDay : DEFAULT_BUDGET_PER_DAY,
  };
}

/** La respuesta mínima que produce un count de supabase-js. */
export type AiAttemptCount = {
  count: number | null;
  error: { message: string } | null;
};

/**
 * Shape mínimo del builder encadenado de supabase-js para una query de count.
 * Definido a mano (y no con los tipos genéricos de postgrest) porque tipar el
 * cliente completo produce "Type instantiation is excessively deep".
 */
type CountQuery = {
  select: (columns: string, options: { count: 'exact'; head: true }) => CountChain;
};

type CountChain = {
  eq: (column: string, value: unknown) => CountChain;
  not: (column: string, operator: string, value: unknown) => CountChain;
  gte: (column: string, value: string) => PromiseLike<AiAttemptCount>;
};

export type AiAttemptClient = {
  from: (table: string) => CountQuery;
};

/**
 * Cuenta los intentos reales de IA posteriores a `fromIso`.
 *
 * Un "intento real" es una llamada que alcanzó al proveedor, haya o no
 * respondido bien. En `audit_logs` se distingue de un template sin key así:
 * - éxito real: `response_data->>fromFallback` = `'false'`
 * - LLM configurado que falló: `response_data->>aiError` no es `null`
 * - template puro (sin key): `fromFallback` = `'true'` y sin `aiError` → NO cuenta
 */
export async function countRealAiAttempts(
  client: AiAttemptClient,
  fromIso: string,
): Promise<AiAttemptCount> {
  const { count: okCount, error: okError } = await client
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('action', 'GENERATE_AI_DRAFT')
    .eq('response_data->>fromFallback', 'false')
    .gte('created_at', fromIso);

  if (okError) return { count: null, error: okError };

  const { count: failedCount, error: failedError } = await client
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('action', 'GENERATE_AI_DRAFT')
    .not('response_data->>aiError', 'is', null)
    .gte('created_at', fromIso);

  if (failedError) return { count: null, error: failedError };

  return { count: (okCount ?? 0) + (failedCount ?? 0), error: null };
}

/**
 * Decide si se puede llamar al proveedor real según el presupuesto.
 *
 * Devuelve `allowed: true` si hay margen; si no, `allowed: false` con el motivo
 * para que la ruta use el template y la UI le explique al usuario por qué su
 * borrador salió del template con IA configurada.
 */
export async function checkAiBudget(
  countRecentAttempts: (fromIso: string) => Promise<AiAttemptCount>,
  budget: Required<AiBudget>,
  now: Date = new Date(),
): Promise<BudgetVerdict> {
  const hourAgo = new Date(now.getTime() - HOUR_MS).toISOString();
  const dayAgo = new Date(now.getTime() - DAY_MS).toISOString();

  const hour = await countRecentAttempts(hourAgo);
  if (hour.error) {
    return {
      allowed: false,
      reason: 'No se pudo verificar el límite de generación IA. Se usó el borrador local.',
    };
  }
  if ((hour.count ?? 0) >= budget.maxPerHour) {
    return {
      allowed: false,
      reason: `Se alcanzó el límite de generaciones IA (${budget.maxPerHour} por hora). Se usó el borrador local.`,
    };
  }

  const day = await countRecentAttempts(dayAgo);
  if (day.error) {
    return {
      allowed: false,
      reason: 'No se pudo verificar el límite de generación IA. Se usó el borrador local.',
    };
  }
  if ((day.count ?? 0) >= budget.maxPerDay) {
    return {
      allowed: false,
      reason: `Se alcanzó el límite de generaciones IA (${budget.maxPerDay} por día). Se usó el borrador local.`,
    };
  }

  return { allowed: true, reason: null };
}