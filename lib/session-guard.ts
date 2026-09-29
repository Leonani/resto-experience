import 'server-only';

import {
  isSameOrigin,
  readSessionConfig,
  readSessionCookie,
} from '@/lib/auth';
import { asSessionClient, getSession, type SessionRow } from '@/lib/session';
import { createClientAdmin } from '@/lib/supabase/client';

/**
 * Pegamento entre una `Request` y la sesión que transporta.
 *
 * Vive aparte de `lib/session.ts` a propósito: aquel módulo es puro y testeable
 * con un cliente falso, y este necesita `server-only` + la service role. Quien
 * quiera probar la lógica de sesión no tiene que pasar por acá.
 *
 * Orden de las comprobaciones, de la más barata a la más cara:
 *  1. cookie ausente → 401 sin tocar la base (un curl anónimo no genera tráfico).
 *  2. origen incorrecto → 403 (CSRF).
 *  3. lookup de la sesión → 401.
 *
 * El origen va después de la cookie a propósito: sin cookie no hay nada que
 * proteger, y responder 403 a un cliente sin sesión daría información
 * innecesaria sobre qué se está validando.
 */

export type SessionGuard =
  | { ok: true; session: SessionRow }
  | { ok: false; status: 401 | 403; message: string };

export async function requireSession(request: Request): Promise<SessionGuard> {
  const token = readSessionCookie(request);

  if (!token) {
    return {
      ok: false,
      status: 401,
      message: 'No autorizado: iniciá sesión para responder.',
    };
  }

  const { appOrigin } = readSessionConfig();

  if (!isSameOrigin(request, appOrigin)) {
    return {
      ok: false,
      status: 403,
      message: 'Origen de la solicitud no permitido.',
    };
  }

  const session = await getSession(asSessionClient(createClientAdmin()), token);

  if (!session) {
    return {
      ok: false,
      status: 401,
      message: 'Sesión no válida o vencida: iniciá sesión de nuevo.',
    };
  }

  return { ok: true, session };
}
