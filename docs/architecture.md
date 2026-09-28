# Arquitectura — Bandeja de Reseñas

> **Rol:** Arquitecto de Software
> **Documento:** `docs/architecture.md`
> **Estado:** v1.0 — coherente con `docs/functional-spec.md`

---

## 1. Vista general

```
┌───────────────────────────────────────────────────────────────────────┐
│  NAVEGADOR                                                           │
│                                                                       │
│  app/page.tsx (Server Component)                                     │
│    ├─ lee ?sede &estado &estrellas   (searchParams = Promise)         │
│    ├─ lee catalogo + métricas        (Supabase, anon key)             │
│    └─ pasa datos a <AuthGate>        (Client Component)              │
│                                                                       │
│  <AuthGate>        spinner "Verificando usuario…" + sesión en contexto│
│  <FilterBar> ──useRouter──> push() ──> la URL es el estado            │
│  <SummaryHeader>      métricas ya calculadas en el servidor           │
│  <ReviewCard>         uncontrolled + fetch a /api/*                   │
└───────────────────────────────────────────────────────────────────────┘
            │ POST (solo mutaciones)
            │ Authorization: Bearer <token> (si hay sesión)
            ▼
┌───────────────────────────────────────────────────────────────────────┐
│  SERVIDOR (Node runtime)                                             │
│                                                                       │
│  app/api/auth/login/route.ts      valida credenciales → token         │
│  app/api/auth/verify/route.ts     valida la sesión (sin auditar)      │
│  app/api/import/route.ts          token x-import-token (destructivo)  │
│  app/api/generate-draft/route.ts  Bearer ← REVIEWS_REPLY_TOKEN        │
│  app/api/save-reply/route.ts      Bearer ← REVIEWS_REPLY_TOKEN        │
│    │                                                                  │
│    ├─ isReplyAuthorized() / readAuthConfig()  ← fail-closed           │
│    ├─ createClientAdmin()   ← SUPABASE_SERVICE_ROLE_KEY               │
│    ├─ logAuditEvent()       ← SIEMPRE, éxito y fallo                 │
│    └─ buildSuccess/ErrorResponse()  ← contrato único                  │
└───────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────────────────┐
│  SUPABASE (PostgreSQL + RLS)                                         │
│  restaurants ──< locations ──< reviews                               │
│  audit_logs (independiente)                                          │
└───────────────────────────────────────────────────────────────────────┘
```

### Decisión: la URL es el estado de los filtros

`app/page.tsx` es un Server Component que **lee** los filtros de `searchParams`. Los
filtros no viven en un `useState` del cliente: viven en la URL.

Consecuencias:

- El F5 no pierde la vista.
- El link se puede compartir con un colega.
- El botón "atrás" del navegador deshace un filtro.
- El servidor puede leer los filtros sin hidratar primero.

El `FilterBar` es un Client Component porque necesita `useRouter()` para escribir en la
URL. Es el único que escribe; `page.tsx` solo lee.

---

## 2. Modelo relacional

```sql
restaurants (id TEXT PK, name TEXT)
     │
     │ 1:N
     ▼
locations  (id TEXT PK, restaurant_id TEXT FK, name TEXT)
     │
     │ 1:N
     ▼
reviews   (id TEXT PK, location_id TEXT FK, author, rating, text,
           published_at, updated_at, reply_text, replied_at)

audit_logs (id UUID PK, action, entity_name, entity_id, method,
           request_payload JSONB, response_status, response_data JSONB,
           error_message, created_at)
```

`audit_logs` **no** tiene FK ni dependencia de las otras tablas: es la bitácora del
sistema y tiene que poder registrar el fallo de una operación que ni siquiera llegó a
tocarlas. Si tuviera FK a `reviews`, no podría auditar un `rv-999` inexistente.

### Restricciones que hacen trabajo de negocio

| Restricción | Qué previene |
|---|---|
| `reviews.location_id REFERENCES locations(id)` | Una reseña en una sede fantasma. **Es la que hace posible RN-02**: si el importador no valida, la BD rechaza el insert |
| `rating INTEGER CHECK (rating >= 1 AND rating <= 5)` | Calificaciones imposibles que romperían el promedio |
| `ON DELETE CASCADE` en `locations` y `reviews` | Reseñas huérfanas de sedes eliminadas |
| `restaurants` sin timestamps | Es un catálogo de referencia, no un recurso editable |

### Decisión: `rating` es `INTEGER` nullable, no `NOT NULL DEFAULT 0`

Un `DEFAULT 0` parece cómodo pero **rompe RN-03**: `AVG(rating)` contaría los `0` como
estrellas reales y el promedio de Palermo bajaría de 3.63 a 3.22. El `NULL` es
semánticamente correcto: "el cliente no interfirió con la calificación". Postgres lo
excluye de `AVG` de forma nativa.

### Decisión: sin `updated_at` automático

`updated_at` viene del dato de origen (Google), no del reloj del servidor. Si Postgres lo
migrara con `DEFAULT NOW()`, la deduplicación de RN-01 compararía la hora del importador
contra la hora real del cliente y el resultado sería incorrecto. La columna es de solo
lectura para la app.

---

## 3. Estructura de carpetas

```
app/
  page.tsx                      Server Component. Lee searchParams.
  api/
    auth/
      login/route.ts            POST: valida credenciales → token
      verify/route.ts           POST: valida la sesión guardada
    import/route.ts             POST: seed catálogo + upsert reseñas
    generate-draft/route.ts     POST: borrador IA (Bearer)
    save-reply/route.ts         POST: persistir respuesta (Bearer)
components/
  AuthGate.tsx                  Client. Sesión + spinner + login y logout.
  FilterBar.tsx                 Client. Escribe en la URL.
  SummaryHeader.tsx             Server. Bento de métricas.
  ReviewCard.tsx                Client. Texto, borrador, guardar.
  EmptyState.tsx                Sin datos / sin resultados.
  ui/                           Componentes shadcn (no tocar)
lib/
  auth.ts                       Autenticación pura (testeable, sin server-only)
  types/
    api.ts                      ApiResponse<T> + builders
    review.ts                   tipos del dominio
  supabase/
    client.ts                   createClientAdmin() — SOLO servidor
  audit.ts                      logAuditEvent()
  import/reviews.ts             dedup → validar FK → upsert
  draft/provider.ts             DraftProvider + fallback local
  metrics.ts                    calculateLocationSummary() — pura
data/reviews.json               fixture de entrada
supabase/schema.sql             DDL
scripts/verify-metrics.ts       gate contra la tabla de referencia
```

### Regla de dependencia

```
app/api  →  lib  →  @supabase/supabase-js
   ↓
componentes NUNCA importan de lib/supabase
```

Los Client Components no instancian clientes de Supabase. Reciben datos por props desde
el Server Component. Motivo: la service role key se lee en el servidor, y un import
accidental desde un Client Component la expondría en el bundle. La regla de Next.js es
que un módulo con `SUPABASE_SERVICE_ROLE_KEY` no debe ser alcanzable desde el cliente.

---

## 4. Estrategia de manejo de errores

### Contrato único

Todo endpoint devuelve:

```ts
type ApiResponse<T> = {
  success: 'ok' | 'fail';
  data: T | null;
  message: string;
};
```

`success` es un **string**, no un booleano. Motivo: distingue tres estados con un solo
campo y deja el booleano libre. Un `success: boolean` obliga a deducir el resultado del
resto del objeto, que es exactamente lo que produce los estados ambiguos.

### `lib/audit.ts` — por qué el "fallback" a anon key es un error de diseño

El patrón habitual y **equivocado**:

```ts
// NUNCA HACER ESTO
const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
```

Parece defensivo. En realidad introduce un fallo silencioso: si falta la service role key
en el entorno de producción, la operación **no falla**. Se degrada a la anon key, que por
políticas RLS no puede escribir, la escritura se rechaza con un 403, y el código puede
convertirlo en un error genérico. El gerente ve "no pude guardar". El log dice 403. Nadie
sabe que el servidor está mal configurado. La app *parece* funcionar.

La versión correcta falla ruidosamente:

```ts
export function createClientAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY ausente. Fallar es preferible a degradar a la anon key, ' +
      'que escribiría con permisos reducidos y ocultaría el problema de configuración.'
    );
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

`persistSession: false` y `autoRefreshToken: false` son obligatorios: el client de
servidor no es un navegador, no tiene dónde guardar sesión, y un refresh token en un
entorno serverless no sirve para nada.

### `@supabase/supabase-js` no lanza excepciones

Este es el error más caro del stack. La API devuelve `{ data, error }`. Un
`await supabase.from('x').insert(y)` que se ignora no lanza nada: falla en silencio con
`data: null`. Por eso **todo** acceso pasa por un destructuring explícito:

```ts
const { data, error } = await admin.from('reviews').upsert(rows);
if (error) { /* auditar y responder fail */ }
```

Regla de revisión: ningún `.insert()`, `.update()`, `.upsert()`, `.delete()` ni
`.select()` sin chequeo de `error` en las dos líneas siguientes.

### `safeJson` — por qué existe

`request_payload` y `response_data` son `JSONB`. Un `JSON.stringify` puede fallar si el
valor tiene referencias circulares, `BigInt`, o si un error de Supabase trae objetos con
métodos. Un `JSONB` insertado con `undefined` (no `null`) rompe la consulta entera.

`safeJson` envuelve el `JSON.stringify` y devuelve `null` ante cualquier excepción. Perder
el detalle de un log es aceptable; perder la mutación completa no.

### Columnas `JSONB`: el insert debe guardar objetos, no strings

Una columna `jsonb` recibe un objeto; si se le inserta un *string* JSON, PostgreSQL lo
guarda como **string jsonb** (doble encoding) y los predicados `response_data->>campo`
dejan de funcionar de forma silenciosa (`jsonb_typeof` devuelve `'string'`, las consultas
por campo devuelven `null`). Por eso `logAuditEvent` inserta `cleanForJsonb(...)`:
`safeJson` primero (limpia `undefined` y circulares) y luego `JSON.parse` para que la
columna tenga un objeto real. Este defecto existió y se corrigió; las filas históricas se
normalizaron en la base (jsonb string → objeto) el mismo día.

### Tipos de error devueltos al cliente

| Situación | HTTP | `success` | Mensaje |
|---|---|---|
| Éxito | 200 | `ok` | Descriptivo del resultado |
| Body inválido / faltante | 400 | `fail` | Qué campo falla |
| Sin sesión en una escritura | 401 | `fail` | "No autorizado: iniciá sesión para responder." |
| Auth no configurada en el servidor | 503 | `fail` | Que falta configuración (fail-closed) |
| Recurso inexistente | 404 | `fail` | Que no existe |
| Sin `LLM_API_KEY` | 200 | `ok` | `fromFallback: true`; usa el template local |
| Error del proveedor de IA | 200 | `ok` | `aiError` con el motivo + borrador local |
| Límite de generación IA alcanzado | 200 | `ok` | `budgetReason` + borrador local, sin llamar al proveedor |
| Borrador vacío (defensivo) | 502 | `fail` | No se pudo generar |
| Error de Supabase | 500 | `fail` | Genérico. El detalle va al log, no al cliente |

El último punto importa: los mensajes de `Supabase` pueden contener nombres de tablas,
columnas y fragmentos de query. Se registra completo en `error_message` y se devuelve al
cliente solo un mensaje genérico. Un error de base de datos no es un mensaje para el
gerente.

---

## 5. Auditoría

### Principio: auditar también los rechazos

La tentación es auditar lo que se successfully escribió. El error de diseño es ese: una
reseña descartada por `loc-99` deja exactamente el mismo estado observable que una reseña
que nunca llegó. El gerente ve que el total no cuadra y no tiene forma de saber si fue
un bug del importador o un dato que se perdió. La auditoría es lo que convierte "el
número es 15" en "el número es 15 y estas son las 3 razones por las que no son 16".

Por eso RN-07 especifica que se audita el fallo, no solo el éxito.

### Acciones auditadas

| `action` | Cuándo | `entity_name` | `entity_id` |
|---|---|---|---|
| `IMPORT_REVIEWS` | Fin de cada importación | `reviews` | `null` (batch) |
| `SKIP_REVIEW` | Cada registro descartado | `reviews` | `rv-301` |
| `GENERATE_AI_DRAFT` | Cada intento de borrador | `reviews` | `rv-101` |
| `SAVE_REPLY` | Cada intento de guardado | `reviews` | `rv-101` |
| `AUTH_LOGIN` | Cada intento de login (éxito y fallo) | `auth` | `null` |

`method` documenta el origen técnico, no la acción de negocio: `POST` para Route Handlers,
`SERVER_ACTION` para Server Actions, `SCRIPT` para el `verify-metrics.ts`. La auditoría
sirve para reconstruir *cómo* pasó algo, no solo *qué* pasó.

### `response_status` es `'ok' | 'fail'`, no booleano

Misma razón que `success` en la API. Además evita el `NULL` de una fila insertada sin el
campo: `NOT NULL` lo rechaza y el log se pierde, que es peor que no tener log.

---

## 5.1 Sesión de escritura (single user)

### Qué se protege y qué no

El listado y los filtros son **públicos por diseño**: están en la URL (sección 1), y se
pueden compartir para que un colega vea exactamente la misma vista. Escribir no es
compartible: exige sesión.

| Recurso | Público | Protegido |
|---|---|---|
| `GET /` (métricas, filtros, listado) | Sí | — |
| `POST /api/generate-draft` | — | `Authorization: Bearer <token>` |
| `POST /api/save-reply` | — | `Authorization: Bearer <token>` |
| `POST /api/import` | — | `x-import-token` (ya existía) |

### El token se compara en el servidor, no en el cliente

Las tres variables (`REVIEWS_LOGIN_USER`, `REVIEWS_LOGIN_PASS`, `REVIEWS_REPLY_TOKEN`) no
llevan `NEXT_PUBLIC_`. Por eso `lib/auth.ts` es deliberadamente **sin `server-only`**:
así se testea con vitest igual que `lib/draft/budget.ts`, y si un Client Component lo
importara por error, `readAuthConfig` leería variables vacías → `null` → fail-closed. La
sacrificio de la guarda de bundler se paga con la regla de dependencia de la sección 3.

Flujo:

1. Al abrir la app, `AuthGate` (Client Component) busca `reviews_reply_token` en
   `localStorage` y lo valida contra `POST /api/auth/verify`. Mientras tanto muestra el
   spinner "Verificando usuario…".
2. Sin token (o token inválido) → `anonimo`: el dashboard se muestra completo pero sin
   botones de escritura; `ReviewCard` avisa "Modo lectura". Un botón flotante abre el
   login.
3. `POST /api/auth/login` valida credenciales con `timingSafeEqual` (comparación a tiempo
   constante sobre hash SHA-256, para no revelar la referencia por longitud). Éxito →
   devuelve el token, que el cliente guarda y usa como Bearer.
4. `save-reply` y `generate-draft` hacen el guard **antes de parsear el body**:
   `readAuthConfig()` + `isReplyAuthorized()`. Rechazo → auditoría con `entity_id: null`
   y 401 con el contrato.

El login **se audita** (éxito y fallo, `AUTH_LOGIN`) porque un intento fallido sin log es
indistinguible de que nadie tocó la app — la misma razón de siempre. `verify` **no** se
audita: no es una mutación. Tampoco se audita ni se loguea la contraseña: `request_payload`
del login lleva solo el username.

### Fail-closed

Sin configuración en el servidor, un header ausente o un token inválido, la escritura se
rechaza. No existe un estado degradado en el que un olvido de entorno deje pasar
silenciosamente una mutación: la app se vuelve de solo lectura y el login responde 503.

### `localStorage`, no cookie

`REVIEWS_*` no tienen `NEXT_PUBLIC_`, así que el servidor nunca emite el token en el HTML;
guardarlo en una cookie conllevaría el riesgo de exponerlo. `localStorage` + Bearer por
request es el camino más simple con el token siempre fuera del render.

---

## 6. Capa de borrador IA

`lib/draft/provider.ts` expone una interfaz, no un proveedor:

```ts
export interface DraftProvider {
  generate(input: DraftInput): Promise<DraftResult>;
}
```

`DraftInput` lleva solo lo necesario: `restaurantName`, `locationName`, `rating`, `text`.
**No** lleva el objeto completo de la reseña ni nada que pueda contener datos de otras
sedes.

La selección es por entorno, en el servidor, a través de `readLlmConfig` y
`selectProvider`:

- `LLM_API_KEY` presente → `OpenAiCompatibleDraftProvider` (OpenRouter por defecto;
  `LLM_BASE_URL` permite apuntar a cualquier proveedor compatible con
  `/chat/completions`)
- ausente → **fallback local determinístico**

El proveedor real lanza `DraftProviderError` ante red caída, timeout de 15s, HTTP
de error o respuesta vacía. El route no lo devuelve como `fail`: cae al template,
responde `ok` con `fromFallback: true` y `aiError` con el motivo, para que la UI
avise "Fallo borrador IA" pero el usuario pueda seguir trabajando con el borrador
local. Exigir la key al cliente, o fingir éxito cuando el proveedor falló, son los
dos extremos que este diseño evita.

El fallback genera un borrador coherente con el tono según el rating (positivo /
neutro / negativo) y, si `text` está vacío, agradece sin referenciar contenido (RN-04).
No es un placeholder de "próximamente": es texto real y guardable. La app es completamente
operativa sin proveedor de IA; la IA es una mejora, no un requisito.

### Protección de costos (presupuesto de generaciones IA)

La llamada real al proveedor es el único punto donde la app gasta plata, y hacia la red
quedó abierta a cualquiera. `lib/draft/budget.ts` la acota con un presupuesto por ventana,
antes de invocar al proveedor:

- Se cuentan los **intentos reales** de IA en `audit_logs` (los últimos 60 min y las últimas
  24 h). "Intento real" = `response_data->>fromFallback = 'false'` (éxito) o
  `response_data->>aiError` presente (LLM configurado que falló). El template sin key no
  cuenta: no costó nada.
- Límites por entorno, con defaults: `LLM_BUDGET_PER_HOUR` (20) y `LLM_BUDGET_PER_DAY`
  (50). El piso del demo es 16 generaciones diarias (un borrador por cada reseña de la
  bandeja); 50 lo cubre con holgura sin el default exagerado de 100.
- Sin margen → se usa el template local y el cliente recibe `budgetReason`, que la UI muestra
  como nota ámbar (distinta de la alerta roja de `aiError`).
- **Fallo cerrado**: si no se puede leer el contador, no se llama al proveedor. No se puede
  auditar el costo de una llamada que no se verifica; el template sale igual.
- El intento bloqueado también se audita (`budgetReason` en `response_data`), pero como queda
  con `fromFallback: true` y sin `aiError`, no se autocontabiliza como intento real.

El contador vive en `audit_logs` a propósito: no agrega tabla ni infraestructura nueva, y el
dato de cuánto se gastó es reconciliable con la trazabilidad existente.

El borrador **nunca** se persiste. Vive en el estado del `ReviewCard` y se marca de forma
inequívoca (RN-06). Solo llega a `reviews.reply_text` cuando el usuario confirma.

---

## 7. Cálculo de métricas

`lib/metrics.ts` exporta `calculateLocationSummary`, una función ** pura** que no toca
Supabase. Recibe un array de reseñas y devuelve el resumen.

Pura por una razón concreta: es la única forma de testear los casos sucios. Un cálculo
mezclado con un fetch necesita una base de datos para verificar que Palermo da 3.63. Como
función pura, el test es un `expect` sin mocks.

El promedio se calcula con un filtro explícito, no confiando en la semántica de `NULL`:

```ts
const rated = reviews.filter(r => r.rating !== null);
const average = rated.length === 0
  ? null
  : round2(rated.reduce((s, r) => s + r.rating, 0) / rated.length);
```

El filtro explícito documenta la regla (RN-03) y sobrevive a que alguien cambie el tipo de
la columna. Además `average === null` y no `0` cuando `rated.length === 0`, que es
exactamente el caso de Belgrano en RN-05.

`replyPercentage` usa **total** de reseñas, no solo las calificadas, porque "de las 9
reseñas que recibimos, respondimos 2" es la pregunta que hace el gerente.

---

## 8. Decisiones registradas y por qué

| Decisión | Alternativa descartada | Motivo |
|---|---|---|
| Filtros en `searchParams` | `useState` en el cliente | Recarga, compartir y "atrás" funcionan gratis |
| `service_role` sin fallback | Degradar a anon key | El fallback oculta una mala configuración detrás de un error genérico |
| `success: 'ok' \| 'fail'` | `success: boolean` | Un string codifica tres estados y no ocupa el booleano |
| Auditar los rechazos | Auditar solo los éxitos | Sin log, un descarte es indistinguible de un dato perdido |
| `rating` nullable | `NOT NULL DEFAULT 0` | `DEFAULT 0` contamina el promedio (RN-03) |
| `DraftProvider` + fallback | Integración directa con un LLM | La app funciona sin proveedor; la IA es opcional |
| `calculateLocationSummary` pura | Cálculo dentro del Server Component | Los casos sucios son testeables sin base de datos |
| Verificación por FK en BD | Solo validación en TypeScript | La BD es el último línea de defensa; TS no la reemplaza |
| Sesión de escritura single user en `.env` | Auth multi-usuario / Supabase Auth | Un gerente, una sesión; proteger las mutaciones no requiere infraestructura de identidades |
| Listado público + escritura con Bearer | Todo el dashboard autenticado | Los filtros en la URL son compartibles (sección 1); escribir no tiene por qué serlo |

---

## 9. Riesgos técnicos asumidos

| Riesgo | Impacto | Mitigación en v1 |
|---|---|---|
| Política `reviews FOR UPDATE USING (true)` | La anon key puede escribir respuestas | Documentado en el README. Aceptable para demo, **bloqueante para producción** |
| Múltiples usuarios comparten un único token | Una sesión es un solo par usuario/token | Aceptado: un gerente, una sesión. RRHH sería otro proyecto |
| Importación en memoria | Un JSON muy grande se carga entero en el serverless | El dataset es de ~10 KB. A escala se procesaría por lotes |
| Sin rate limit en los endpoints | Endpoints POST públicos | Fuera de alcance declarado |
| Un único `await` por lote | Los upsert son secuenciales | Aceptable a este volumen; documentar si crece |
