import { createClient } from '@supabase/supabase-js';

/**
 * Cliente de SOLO LECTURA con la anon key.
 *
 * La anon key es pública por diseño (por eso lleva prefijo NEXT_PUBLIC_).
 * Se usa en el Server Component para leer el catálogo y las métricas, y en el
 * cliente si alguna vez hace falta. RLS permite leer; las escrituras van por
 * Route Handler con la service role.
 *
 * No lleva `server-only` a propósito: este módulo sí puede usarse en el cliente.
 */
export function createClientPublic() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL ausente.');
  }

  if (!key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY ausente.');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
