-- ============================================================================
-- Bandeja de Reseñas — Esquema de base de datos (Supabase / PostgreSQL)
-- ============================================================================
-- Aplicar desde el SQL Editor del dashboard de Supabase, o via el MCP de supabase.
--
-- CORRECCIONES aplicadas sobre el esquema original:
--
--  1. `CREATE EXTENSION "uuid-ossp"` -> `CREATE EXTENSION "pgcrypto"`.
--     `gen_random_uuid()` NO viene de uuid-ossp (esa funcion es
--     `uuid_generate_v4()`). pgcrypto es la que provee `gen_random_uuid()`.
--     En Supabase pgcrypto ya viene habilitada; el IF NOT EXISTS lo hace seguro.
--
--  2. `method` queda como TEXT libre, no como dominio cerrado. El comentario
--     documenta los valores en uso, pero el importador tambien puede emitir
--     otros (ej. 'SCRIPT') sin requerir un ALTER TABLE.
--
--  3. Las escrituras (seed + importacion + respuestas) se hacen con la
--     SERVICE ROLE key desde el servidor, que bypasea RLS. Por eso NO hace
--     falta agregar politicas INSERT/UPDATE para el servidor.
--
-- NOTA DE SEGURIDAD: la politica "Permitir actualizar respuestas" con
-- USING (true) permite modificar `reply_text` usando la ANON key, es decir
-- sin autenticacion. Al ser una app sin auth, cualquiera que conozca la URL
-- publica podria escribir respuestas. Ver seccion "Riesgos" del README.
-- ============================================================================

-- gen_random_uuid() requiere pgcrypto (no uuid-ossp)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Restaurantes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS restaurants (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- ----------------------------------------------------------------------------
-- 2. Sedes / Localizaciones
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL
);

-- ----------------------------------------------------------------------------
-- 3. Reseñas
-- ----------------------------------------------------------------------------
-- `rating` admite NULL a proposito: el cliente puede no dejar estrellas.
--   -> cuenta en el total de opiniones
--   -> se EXCLUYE del calculo del promedio
--
-- `text` admite '' a proposito: el cliente puede valorar sin comentar.
--   -> la respuesta sigue habilitado (agradecimiento estandar)
--
-- `reply_text` / `replied_at` guardan la respuesta persistida. Un borrador
-- generado por IA NUNCA se escribe aca hasta que el usuario lo confirma.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id          TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  author      TEXT NOT NULL,
  rating      INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  text        TEXT NOT NULL DEFAULT '',
  published_at TIMESTAMPTZ NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL,
  reply_text   TEXT        DEFAULT NULL,
  replied_at   TIMESTAMPTZ DEFAULT NULL
);

-- ----------------------------------------------------------------------------
-- 4. Auditoría
-- ----------------------------------------------------------------------------
-- Un registro por cada operacion de creacion, modificacion o error.
--
-- `method` — valores en uso: 'POST' | 'SERVER_ACTION' | 'SCRIPT'
-- `response_status` — 'ok' | 'fail'
-- `request_payload` / `response_data` — JSONB, NULL cuando no aplica
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action           TEXT NOT NULL,      -- 'IMPORT_REVIEWS' | 'GENERATE_AI_DRAFT' | 'SAVE_REPLY' | ...
  entity_name      TEXT,               -- 'reviews' | 'locations' | 'restaurants'
  entity_id        TEXT,               -- 'rv-101'
  method           TEXT NOT NULL,
  request_payload  JSONB,
  response_status  TEXT NOT NULL,      -- 'ok' | 'fail'
  response_data    JSONB,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. Usuario de escritura (sesión)
-- ----------------------------------------------------------------------------
-- El usuario/password del login viven en una tabla, NO en el entorno. El hash
-- es scrypt (N=16384, r=8, p=1, keylen=64) en formato `scrypt$<salt_hex>$<hash_hex>`.
-- Se genera con `hashPassword()` de lib/auth.ts.
--
-- El token `REVIEWS_REPLY_TOKEN` sigue en el entorno: es el secreto de sesión
-- que el login devuelve y que las escrituras exigen como Bearer.
--
-- RLS SIN políticas a propósito: la tabla guarda hashes de contraseña. Ni la
-- anon key ni `authenticated` pueden leerla; solo la service role (bypasea
-- RLS) la consulta desde POST /api/auth/login y /api/auth/verify.
CREATE TABLE IF NOT EXISTS auth_users (
  username      TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed demo (contraseña 'Password123', SOLO demo — rotar en producción):
-- insert into auth_users (username, password_hash)
-- values ('gerente', 'scrypt$f89e...') on conflict (username) do update set password_hash = excluded.password_hash;
-- Mas en el SQL Editor del dashboard de Supabase.

-- ----------------------------------------------------------------------------
-- Indices
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reviews_location    ON reviews(location_id);
-- La bandeja ordena por fecha descendente en cada filtro de sede
CREATE INDEX IF NOT EXISTS idx_reviews_published   ON reviews(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_replied     ON reviews(replied_at);
CREATE INDEX IF NOT EXISTS idx_locations_restaurant ON locations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action   ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status   ON audit_logs(response_status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created  ON audit_logs(created_at DESC);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
-- Postura: la anon key puede LEER y nada más.
--
-- La anon key viaja hardcodeada en el bundle del navegador (por eso lleva
-- prefijo NEXT_PUBLIC_). Es pública por definición: cualquiera que abra las
-- DevTools la puede leer. Si una política le permite escribir, cualquier
-- persona puede escribir. No es una amenaza hipotética, es la definición de la
-- clave.
--
-- Las escrituras de la aplicación (seed, importación, respuestas) las hacen los
-- Route Handlers con la SERVICE ROLE key, que bypasea RLS por diseño. Por eso
-- no hace falta NINGUNA política de escritura: agregar una sería abrir un
-- agujero que la app no necesita para funcionar.
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_users ENABLE ROW LEVEL SECURITY;

-- Única superficie pública: lectura.
CREATE POLICY "Lectura pública de restaurantes" ON restaurants FOR SELECT USING (true);
CREATE POLICY "Lectura pública de sedes"       ON locations  FOR SELECT USING (true);
CREATE POLICY "Lectura pública de reseñas"     ON reviews    FOR SELECT USING (true);

-- Sin política INSERT / UPDATE / DELETE con USING (true).
--
-- El diseño original traía estas dos, y eran un agujero:
--
--   "Permitir actualizar respuestas"  ON reviews FOR UPDATE USING (true)
--   "Servidor escribe audit_logs"     ON audit_logs FOR INSERT WITH CHECK (true)
--
-- Con la primera, este snippet ejecutado desde la consola del navegador
-- escribía una respuesta oficial del restaurante:
--
--   supabase.from('reviews').update({ reply_text: '...' }).eq('id', 'rv-101')
--
-- Y con la segunda se podían fabricar entradas de auditoría falsas, que es
-- peor: el registro de auditoría es la evidencia de integridad del sistema.
-- Un auditor que puede ser falseado no es un auditor.
--
-- Verificado: con solo estas tres políticas, un UPDATE con la anon key falla
-- con 42501 / permission denied, y el servicio sigue funcionando porque la
-- service role bypasea RLS.
--
-- `audit_logs` no tiene política SELECT a propósito: el historial se consulta
-- desde el dashboard de Supabase, que usa la service role.

-- ----------------------------------------------------------------------------
-- Verificación posterior a aplicar este archivo
-- ----------------------------------------------------------------------------
-- Con la ANON key, todas deben fallar con 42501:
--
--   update reviews set reply_text = 'x' where id = 'rv-101'
--   insert into audit_logs (action, method, response_status) values ('X','POST','ok')
--   delete from reviews
--
-- Con la SERVICE ROLE key, todas deben funcionar.

