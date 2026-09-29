import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente con SERVICE ROLE. Bypasea RLS: puede escribir en todas las tablas.
 *
 * SOLO para Route Handlers y scripts de servidor. Nunca lo importes desde un
 * Client Component: la key se empaquetaría en el bundle y sería pública.
 *
 * `server-only` hace que el build de Next falle si este módulo termina en el
 * grafo de un Client Component. Es la red de seguridad, no el candado.
 *
 * Sin fallback a la anon key, a propósito. Ver docs/architecture.md sección 4.
 */
export function createClientAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL ausente.');
  }

  if (!key) {
    // Fallar es preferible a degradar a la anon key: escribiría con permisos
    // reducidos y ocultaría el problema de configuración detrás de un error
    // genérico de RLS que nadie sabe interpretar.
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY ausente. Se rechaza usar la anon key como fallback ' +
        'porque escribiría con permisos reducidos y volvería la configuración ' +
        'incorrecta indetectable.',
    );
  }

  return createClient(url, key, {
    auth: {
      // El server no es un navegador: no tiene dónde guardar sesión.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
