# Plan de Ejecución — Bandeja de Reseñas

Estado: `pendiente` | `en curso` | `lista` | `bloqueada`

Leyenda: `- [ ]` pendiente · `- [x]` lista · `- [~]` en curso · `- [!]` bloqueada

---

## Fase 0 — Bootstrap

- [x] **0.1** Crear la app Next.js (App Router, TS, Tailwind, sin `src/`) → v16.3.6, Turbopack
- [x] **0.2** `shadcn init` → genera `components.json` (preset `nova`, base `radix`)
- [x] **0.3** `shadcn add` → 12 componentes en `components/ui/`
- [x] **0.4** `vitest`, `tsx`, `@supabase/supabase-js` (se subió `@types/node` a ^24, peer de vitest 5)
- [x] **0.5** Copiar `reviews.json` → `data/reviews.json`
- [x] **0.6** Crear `.opencode/skills/design-system/SKILL.md` (con frontmatter)
- [x] **0.7** Crear `.opencode/skills/tech-stack/SKILL.md` (con frontmatter)
- [x] **0.8** Escribir `supabase/schema.sql` (3 correcciones: pgcrypto, method libre, service role)
- [x] **0.9** Aplicar `schema.sql` vía MCP contra `yambwmddmtpssvhwbrlx` → `initial_schema_reviews_inbox` aplicada y verificada
- [x] **0.10** Crear `.env.local` + `.env.example` (URL y anon key cargadas; falta la service role key)

**Gate 0** — `pnpm dev` levanta, `npx shadcn add` funciona, 4 tablas existen
- [x] **G0** Gate 0 aprobado — 4 tablas, 2 FKs, 7 índices, 3 políticas SELECT, 0 de escritura, FK/CASCADE/CHECK verificados con rollback

---

## Agente 1 — Analista Funcional & PO → `docs/functional-spec.md`

- [x] **A1.1** Perfil del usuario + rutina diaria matutina del gerente
- [x] **A1.2** RN-01 Deduplicación `rv-205` por `updated_at`
- [x] **A1.3** RN-02 Omitir `loc-99` sin crear sedes
- [x] **A1.4** RN-03 `rating: null` cuenta en total, no en promedio
- [x] **A1.5** RN-04 `text: ""` habilita respuesta
- [x] **A1.6** RN-05 Belgrano muestra "Sin datos", nunca "0.0"
- [x] **A1.7** HU-01 Importación idempotente (Gherkin)
- [x] **A1.8** HU-02 Filtros en URL
- [x] **A1.9** HU-03 Borrador adaptativo por puntaje
- [x] **A1.10** HU-04 Persistencia de respuestas
- [x] **A1.11** HU-05 Bento cards (3.63 / 3.67 / Sin datos)
- [x] **A1.12** HU-06 Trazabilidad y auditoría
- [x] **A1.13** Tabla de datos de referencia con valores esperados
- [x] **A1.14** Fuera de alcance + preguntas abiertas

**Gate 1** — revisión del usuario
- [ ] **G1** Gate 1 aprobado

---

## Agente 2 — Arquitecto → `docs/architecture.md`

- [x] **A2.1** Confirmar modelo relacional y restricciones SQL
- [x] **A2.2** Estructura modular de carpetas + regla de dependencia
- [x] **A2.3** Estrategia de manejo de errores (contrato único, sin fallback, `safeJson`)
- [x] **A2.4** Middleware de auditoría (incluye los rechazos, no solo los éxitos)
- [x] **A2.5** Vista general, capa de borrador IA y cálculo de métricas
- [x] **A2.6** Tabla de decisiones registradas y riesgos técnicos asumidos

**Gate 2** — coherente con Agente 1
- [x] **G2** Gate 2 aprobado

---

## Agente 3 — Backend, DB & Auditoría

- [x] **A3.1** `lib/types/api.ts` — `ApiResponse<T>`, `buildSuccessResponse`, `buildErrorResponse`
- [x] **A3.2** `lib/supabase/client.ts` (admin, `server-only`, sin fallback) + `lib/supabase/server.ts` (anon, lectura)
- [x] **A3.3** `lib/audit.ts` — `logAuditEvent` (service role sin fallback, captura `{ error }`, `safeJson`)
- [x] **A3.4** `lib/import/reviews.ts` — dedup → validación FK → upsert
- [x] **A3.5** `app/api/import/route.ts` — seed catálogo + import + auditoría
- [x] **A3.6** `app/api/generate-draft/route.ts` — `DraftProvider` (plantillas) + auditoría
- [x] **A3.7** `app/api/save-reply/route.ts` — persistir + auditar
- [x] **A3.8** `lib/draft/provider.ts` — interfaz + fallback determinista
- [x] **A3.9** `lib/types/review.ts` — tipos de dominio + shape del fixture
- [x] **A3.10** `tsc --noEmit` y `eslint lib app` sin errores

**Gate 3** — `POST /api/import` → `{success:"ok"}` y 3.63 / 3.67 / null
- [x] **G3** Gate 3 aprobado — verificado contra la BD real con service role key: import idempotente (15 insertadas / 0 en re-ejecución), métricas 3.63 / 3.67 / null, RLS (anon bloqueado) y auditoría ok

---

## Agente 4 — Frontend & UI/UX

- [x] **A4.1** `app/layout.tsx` (metadata, `lang="es"`) + `globals.css`
- [x] **A4.2** `components/SummaryHeader.tsx` — Bento grid por sede
- [x] **A4.3** `components/FilterBar.tsx` — cliente, `useSearchParams`, en `<Suspense>`
- [x] **A4.4** `components/ReviewCard.tsx` — badge IA, edición inline, fechas relativas
- [x] **A4.5** Colores semánticos por estrellas (emerald / amber / rose / slate) en `components/star-rating.tsx`
- [x] **A4.6** Skeletons de carga (`app/loading.tsx`) + `EmptyState` con dos variantes
- [x] **A4.7** `app/page.tsx` — Server Component, filtro por URL, jerarquía pendientes-primero
- [x] **A4.8** `lib/metrics.ts` — función pura (seadelanta de A5.1 porque el header la necesita)
- [x] **A4.9** `tsc --noEmit`, `eslint` y `next build` sin errores

**Gate 4** — build limpio, UI según design-system
- [x] **G4** Gate 4 aprobado

---

## Agente 5 — QA & Testing

- [x] **A5.1** `lib/metrics.ts` — `calculateLocationSummary(locationId, reviews)` pura (adelantado en A4.8)
- [x] **A5.1b** `lib/import/dedupe.ts` — `dedupeReviews` puro, extraído para que el test no tenga que stubbear `server-only`
- [x] **A5.2** `vitest.config.mts` (ESM, con `path.alias` para `@`)
- [x] **A5.3** Test: sede sin reseñas → `null` y 0%
- [x] **A5.4** Test: `rating: null` no entra al promedio
- [x] **A5.5** Test: Palermo = 3.63 sobre 8 calificadas
- [x] **A5.6** Test: Centro = 3.67 sobre 6 reseñas
- [x] **A5.7** `scripts/verify-metrics.ts` — gate contra la tabla de referencia
- [x] **A5.8** Tests extra: `rating: null` no arrastra a 0, `text: ""` cuenta, aislamiento entre sedes, `reply_text` vacío = pendiente, empate de `updated_at`, 3 versiones del mismo id

**Gate 5** — `pnpm test` verde
- [x] **G5** Gate 5 aprobado — 14/14 tests, `verify:metrics` OK

---

## Agente 6 — Code Review & README

- [x] **A6.1** Auditar filtrado de API Keys en el cliente → **canary en build: la service role key no aparece en `.next/static`**
- [x] **A6.2** Confirmar que toda mutación va a `audit_logs` → 3/3 rutas, 0 Client Components con Supabase
- [x] **A6.3** `README.md` — inicio rápido en 3 comandos
- [x] **A6.4** `README.md` — sección "Tratamiento de Datos Sucios" (`rv-205`, `loc-99`, `rv-108`, `loc-2`)
- [x] **A6.5** `README.md` — comando de tests + nota de RLS
- [x] **A6.6** **RLS endurecido**: eliminadas las políticas `reviews FOR UPDATE USING (true)` y `audit_logs FOR INSERT`. La anon key ahora solo lee
- [x] **A6.7** **`POST /api/import` protegido** con `IMPORT_TOKEN`, comparación en tiempo constante, fail-closed (503 sin token, 401 con token incorrecto)
- [x] **A6.8** Sección de Seguridad con antes/después y limitaciones conocidas

**Gate 6** — sin keys en cliente, toda mutación auditada
- [x] **G6** Gate 6 aprobado

---

## Agente 7 — DevOps & Vercel

- [x] **A7.1** `.gitignore` estricto (`.env*` salvo `.env.example`, verificado con `git check-ignore`)
- [x] **A7.2** `.env.example` con `IMPORT_TOKEN` y comando para generarlo
- [x] **A7.3** `docs/deploy.md` — GitHub + Vercel + checklist post-deploy
- [x] **A7.4** Verificación de secretos en archivos trackeados → 0 credenciales

**Gate 7** — `git status` sin secretos
- [x] **G7** Gate 7 aprobado

---

## Tabla de referencia (verificar en Gate 3 y Gate 5)

| Sede | Restaurante | Total | Calificadas | Promedio | Respondidas |
|---|---|---|---|---|---|
| Palermo `loc-1` | La Parrilla del Sur | 9 | 8 | 3.63 | 2/9 (22.2%) |
| Centro `loc-3` | Sakura Sushi | 6 | 6 | 3.67 | 1/6 (16.7%) |
| Belgrano `loc-2` | La Parrilla del Sur | 0 | 0 | null | 0% |
| `rv-301` → `loc-99` | — | — | — | descartada | auditada |

## Pendientes decisiones del usuario

- [ ] **P1** Reiniciar opencode (carga MCP supabase + SKILL.md)
- [x] **P2** Definir proveedor LLM para HU-03 → OpenRouter (API compatible OpenAI, `LLM_BASE_URL` opcional)
- [x] **P3** API key del LLM → en `.env.local`; modelo `google/gemini-3.6-flash`; generación en vivo OK (`fromFallback=false`, `aiError=null`, auditoría con el slug del modelo)
