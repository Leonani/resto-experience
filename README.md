# Bandeja de Reseñas

Gestión diaria de reseñas de un grupo gastronómico (2 restaurantes, 3 sedes).
Muestra métricas por sede, permite filtrar y responder, y audita todo lo que
ocurre.

El foco del proyecto no es la UI: es **no mentir con los números**. Un dataset
real viene con duplicados, sedes inexistentes y reseñas sin calificación, y cada
uno de esos casos rompe un panel de métricas de la forma más silenciosa posible.

---

## Inicio rápido

```bash
pnpm install
cp .env.example .env.local     # completar las 3 claves de Supabase + IMPORT_TOKEN
pnpm dev
```

Y en otra terminal, con el servidor levantado:

```bash
curl -X POST http://localhost:3000/api/import \
  -H "x-import-token: <tu IMPORT_TOKEN>"
```

El endpoint **no recibe un body**: lee `data/reviews.json` del disco, con el path
fijo en `app/api/import/route.ts` (constante `filePath`). Para importar otro dataset, reemplazá ese
archivo y volvé a correr el mismo `curl`. Es idempotente, así que se puede correr
las veces que haga falta.

### Requisitos

- Node 22 o superior
- Un proyecto de Supabase con `supabase/schema.sql` aplicado

### Variables de entorno

| Variable | Para qué | ¿Llega al cliente? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto | Sí (por diseño) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Lectura. Solo `SELECT` | Sí (por diseño) |
| `SUPABASE_SERVICE_ROLE_KEY` | Escrituras. Bypasea RLS | **Nunca** |
| `IMPORT_TOKEN` | Habilita `POST /api/import` | **Nunca** |
| `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` | Proveedor de borradores | **Nunca** |
| `SESSION_TTL_HOURS` | Duración de la sesión (opcional, default 8 h) | **Nunca** |
| `APP_ORIGIN` | Origin permitido por el chequeo de CSRF (opcional) | **Nunca** |

El **usuario, la contraseña y la sesión tampoco viven en el entorno**: viven en
`auth_users` (contraseña con hash **scrypt**) y `auth_sessions` (solo el
SHA-256 del token). El token viaja en una cookie `HttpOnly` que el navegador
adjunta solo, así que no hay ningún secreto de sesión que configurar. La tabla
`auth_sessions`, sin políticas de RLS, como `auth_users`: solo la service role
puede tocarla. Generar un `IMPORT_TOKEN`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Probar la sesión de escritura (demo)

El listado y los filtros son **públicos** por diseño: cualquiera con la URL puede
verlos. Escribir (generar borradores y contestar) exige la sesión del usuario de
la bandeja, que vive en la tabla `auth_users` de Supabase:

| Campo | Valor demo |
|---|---|
| usuario (`username`) | `gerente` |
| contraseña | `Password123` |

En la app: botón **"Iniciar sesión"** (en el footer de la sidebar) → usuario
`gerente`, contraseña `Password123`. Sin sesión, la bandeja se ve igual pero en
modo lectura (las tarjetas no muestran botones de escritura).

### "Anónimo" y "no pude verificar" no son lo mismo

`AuthGate` distingue dos situaciones que antes se veían idénticas:

| Situación | Cuándo | Qué ve el usuario |
|---|---|---|
| `anonimo` | `/api/auth/verify` devuelve **401** | Modo lectura normal, sin avisos |
| `error` | Cualquier otra respuesta: 403, 5xx, body no-JSON, red caída | Modo lectura **+ banner rojo "No se pudo verificar la sesión"** |

Solo un 401 significa "no hay sesión" (`lib/verify-outcome.ts`, testeado en
`tests/verify-outcome.test.ts`). Antes, un 500 —por ejemplo, si falta
`SUPABASE_SERVICE_ROLE_KEY` en el servidor y `createClientAdmin()` lanza— caía
en el mismo `anonimo`: la app se veía perfectamente sana mientras el servidor
estaba mal configurado. El listado público sigue funcionando en ambos casos, y
el botón de login se sigue mostrando en ambos.

**Advertencia:** `Password123` es una contraseña de demo para que cualquiera
pruebe, no para producción. Antes de desplegar hay que cambiarla (re-hashearla
con `hashPassword()` de `lib/auth.ts` y actualizar `auth_users`) y borrar las
sesiones de demo con `delete from auth_sessions`. No hay token que rotar: cada
login emite el suyo y caduca a las 8 h por defecto (`SESSION_TTL_HOURS`).

---

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Build de producción |
| `pnpm test` | Suite de Vitest (164 tests) |
| `pnpm verify:metrics` | Verifica las métricas contra la tabla de referencia |
| `pnpm typecheck` | Genera los tipos de ruta de Next y corre `tsc` |
| `pnpm lint` | ESLint |
| `pnpm check` | `typecheck` + `lint` + `test` + `verify:metrics`, en ese orden |
| `pnpm dlx shadcn@latest add <componente>` | Agrega un componente de shadcn |

El proyecto usa **pnpm** (fijado en el campo `packageManager` de `package.json`, así
que `corepack` lo descarga solo aunque no esté instalado). Para installar en CI o
en Vercel: `pnpm install --frozen-lockfile`.

`pnpm typecheck` existe porque Next 16 genera los tipos de ruta
(`PageProps<'/'>`, `LayoutProps<'/'>`, `RouteContext<'/api/import'>`) dentro de
`.next/types/`. Con `pnpm typecheck` se regeneran antes de correr `tsc`; sin ese
paso, el typecheck falla con `Cannot find name 'PageProps'` en un checkout limpio.

`verify:metrics` es el gate más útil del proyecto: corre sin base de datos,
replica el pipeline del importador sobre el fixture y falla si algún número se
desvía de lo esperado.

---

## Documentación

| Documento | Contenido |
|---|---|
| `docs/functional-spec.md` | Perfil del usuario, reglas de negocio, historias en Gherkin |
| `docs/architecture.md` | Modelo relacional, estructura, manejo de errores, decisiones |
| `docs/deploy.md` | Puesta en marcha: variables de entorno, esquema, despliegue |
| `.opencode/skills/design-system/` | Reglas de UI: paleta, borrador IA, "Sin datos" |
| `.opencode/skills/tech-stack/` | Reglas de arquitectura y trampas de Next.js 16 |
| `supabase/schema.sql` | DDL comentado |
| `PLAN_EJECUCION.md` | Plan de ejecución con el estado de cada etapa |

---

## Tratamiento de datos sucios

El fixture `data/reviews.json` tiene 5 casos que rompen un panel de métricas.
Cada uno tiene una regla de negocio asociada y un test.

### `rv-205` — la misma reseña dos veces (RN-01)

Aparece con `rating: 1` del `11/09` y con `rating: 3` del `13/09`. Gana la más
reciente: el delivery terminó resolviéndose.

Mostrar la versión vieja haría ver al gerente un problema ya resuelto. **Centro
tiene 6 reseñas, no 7.**

### `rv-301` → `loc-99` — la sede no existe (RN-02)

Se descarta y se audita. **La sede no se crea.**

Este es el límite más importante del proyecto. Un error de tipeo en el `id` no
puede fabricar una sede nueva: produciría una sede fantasma con métricas propias
que el gerente leería como real. Perder una reseña es un costo aceptable; un
dato inventado no. El catálogo tiene 3 sedes y nunca va a tener 4.

### `rv-108` — `rating: null` (RN-03)

Cuenta en el total de reseñas pero **no** entra al promedio.

Son dos preguntas distintas: "cuántas personas nos escribieron" y "qué tan bien
nos calificaron". Si se tratara como 0 estrellas, el promedio de Palermo bajaría
de **3.63 a 3.22** y la sede parecería peor de lo que es.

> Trampa de implementación: `COALESCE(rating, 0)` antes de agregar convierte
> "no opino" en "opino 0 estrellas". `AVG` ya ignora los `NULL`, pero
> `COUNT(rating)` también, y ese es el número que se usa para el total.

### `rv-105` — `text: ""` (RN-04)

Reseña válida: se importa, se muestra y se puede responder. El borrador agradece
la puntuación sin referenciar el contenido, porque no hay contenido.

### `loc-2` (Belgrano) — sede sin reseñas (RN-05)

El promedio muestra **`Sin datos`**. Nunca `0.0`.

`0.0` es una afirmación falsa: dice "recibimos reseñas y todas fueron de 0
estrellas", cuando la verdad es "no sabemos". Un gerente que ve `0.0` en Belgrano
toma una decisión comercial basada en nada.

### La importación acumula: no reemplaza

`POST /api/import` hace un *upsert* por `id`. Correrlo dos veces con el mismo
archivo deja la base igual, y correrlo con un archivo nuevo **agrega**, no
sustituye: las reseñas que estaban en la base y ya no están en el JSON **se
quedan**, con todo lo que tengan encima.

Eso es deliberado. Los datos de la app no deberían desaparecer porque alguien
cambió un archivo, y es lo que hace que reimportar sea seguro.

**El riesgo concreto:** para poder preservar las respuestas ya escritas, el
importador primero lee cuáles hay guardadas. Si esa lectura devuelve algo que no
sea un error explícito — por ejemplo una respuesta vacía en lugar de las filas —
el importador la interpreta como "la base no tiene respuestas" y **sobrescribe el
`reply_text` de cada reseña con el valor del JSON**. No hay error, no hay aviso en
la respuesta, y el trabajo del gerente desaparece en silencio.

Por eso, si vas a reemplazar `data/reviews.json` a mano:

1. Hacé backup de las respuestas primero (`select id, reply_text from reviews`).
2. Verificá que el archivo no traiga un `reply` para reseñas que ya están
   respondidas. La primera importación sí siembra las respuestas del archivo; las
   siguientes las respetan solo si la lectura previa funcionó.

Reimportar es acumulativo, así que volver a correr el `curl` con el archivo
original **no** deshace el daño: ya se sobrescribió.

### Tabla de referencia

| Sede | Total | Calificadas | Promedio | Respondidas |
|---|---|---|---|---|
| Palermo `loc-1` | 9 | 8 | **3.63** | 2/9 (22.2%) |
| Centro `loc-3` | 6 | 6 | **3.67** | 1/6 (16.7%) |
| Belgrano `loc-2` | 0 | 0 | **Sin datos** | 0% |

---

## Seguridad

### La anon key puede leer y nada más

La anon key viaja hardcodeada en el bundle del navegador. Es pública por
definición: cualquiera que abra las DevTools la puede leer. Si una política de
Supabase le permite escribir, cualquier persona puede escribir.

La postura del proyecto es explícita:

| Política | Efecto |
|---|---|
| 3 × `SELECT ... USING (true)` | La anon key lee el catálogo y las reseñas |
| **Ninguna política de escritura** | La anon key no puede escribir nada |

Las escrituras de la aplicación pasan por los Route Handlers con la
`SUPABASE_SERVICE_ROLE_KEY`, que bypasea RLS por diseño. No hace falta ninguna
política de escritura: agregar una sería abrir un agujero que la app no necesita
para funcionar.

### Lo que se corrigió

El diseño original traía dos políticas que eran agujeros abiertos:

```sql
-- ELIMINADO
CREATE POLICY "Permitir actualizar respuestas" ON reviews
  FOR UPDATE USING (true) WITH CHECK (true);

-- ELIMINADO
CREATE POLICY "Servidor escribe audit_logs" ON audit_logs
  FOR INSERT WITH CHECK (true);
```

Con la primera, este snippet ejecutado desde la consola del navegador escribía
una respuesta **oficial del restaurante**:

```js
// Pegar en la consola del navegador, con la anon key a la vista
supabase.from('reviews').update({ reply_text: '...' }).eq('id', 'rv-101')
```

Con la segunda se podían fabricar entradas de auditoría falsas, que es peor: si
el registro de auditoría se puede falsear, no es un auditor.

Verificado: con el schema aplicado, un `UPDATE` con la anon key falla con
`42501 permission denied`, y el servicio sigue funcionando porque la service
role bypasea RLS.

### Sin fallback de la service role a la anon key

`lib/supabase/client.ts` **falla** si falta `SUPABASE_SERVICE_ROLE_KEY`:

```
SUPABASE_SERVICE_ROLE_KEY ausente. Se rechaza usar la anon key como fallback
porque escribiría con permisos reducidos y volvería la configuración
incorrecta indetectable.
```

El fallback parece defensivo y en realidad es un agujero: si la key falta en
producción, la escritura no falla, se degrada a la anon key, RLS la rechaza con
un 403, y el código lo convierte en un error genérico. El gerente ve "no pude
guardar", el log dice 403, y nadie sabe que el servidor está mal configurado. La
app *parece* funcionar.

Mismo criterio en `POST /api/import`: sin `IMPORT_TOKEN` devuelve `503` y no
carga nada.

### El guard `server-only`

`lib/supabase/client.ts` importa `server-only`. Si alguien lo importa desde un
Client Component, **el build falla** en vez de filtrar la key al bundle. Es la
red de seguridad que hace innecesario confiar en la disciplina.

Verificado con un canary en el build: la service role key no aparece en ningún
archivo de `.next/static`.

### Qué audita el sistema

Todo, **incluidos los rechazos**:

| Acción | Cuándo |
|---|---|
| `IMPORT_REVIEWS` | Fin de cada importación |
| `SKIP_REVIEW` | Cada registro descartado, con su motivo |
| `GENERATE_AI_DRAFT` | Cada intento de borrador |
| `SAVE_REPLY` | Cada intento de guardado |
| `AUTH_LOGIN` | Cada intento de login, con éxito o sin él |
| `AUTH_LOGOUT` | Cada cierre de sesión |

Auditar solo los éxitos deja una falla grande: una reseña descartada deja el
mismo estado observable que una que nunca llegó. Sin log, un descarte es
indistinguible de un dato perdido, y esa es exactamente la duda que el gerente no
puede resolver solo.

### Limitaciones conocidas

| Limitación | Por qué | Arreglo |
|---|---|---|
| Una sola cuenta: cualquiera que tenga la contraseña escribe | Alcance v1: una demo para probar, no un sistema de usuarios | Supabase Auth con roles por usuario y policies |
| `GET /` muestra el listado a cualquiera con la URL | Es el alcance elegido: leer es público, escribir no | Policies por usuario en el catálogo |

Ninguna es un descuido: son el alcance acordado. La primera es la que hay que
cerrar antes de que esto toque producción.

---

## API

Los endpoints devuelven siempre el mismo contrato:

```ts
{ success: 'ok' | 'fail', data: T | null, message: string }
```

`success` es un string, no un booleano: distingue tres estados con un campo y
deja el booleano libre. Un `success: boolean` obliga a deducir el resultado del
resto del objeto, que es lo que produce los estados ambiguos.

| Endpoint | Body | Notas |
|---|---|---|
| `/api/import` | — (lee `data/reviews.json` del disco) | Requiere header `x-import-token`. Idempotente. |
| `/api/generate-draft` | `{ reviewId }` | **Nunca persiste.** El borrador vive en el cliente. |
| `/api/save-reply` | `{ reviewId, replyText }` | Rechaza texto vacío. Es el único camino que escribe `reply_text`. |
| `/api/auth/login` | `{ username, password }` | Emite la sesión en una cookie `HttpOnly`. Audita el intento (nunca la contraseña). |
| `/api/auth/verify` | — | Resuelve la cookie a `{ user, expiresAt }`. No audita: es una verificación de estado. |
| `/api/auth/logout` | — | Revoca la sesión y limpia la cookie. Idempotente. |

Las escrituras (`/api/generate-draft`, `/api/save-reply`) exigen la cookie de
sesión y que la request venga del mismo origen. Sin sesión responden `401`; con
un origen incorrecto, `403`.

| Situación | HTTP | `success` |
|---|---|---|
| Éxito | 200 | `ok` |
| Body inválido | 400 | `fail` |
| Credenciales o token inválidos | 401 | `fail` |
| Recurso inexistente | 404 | `fail` |
| Falta `IMPORT_TOKEN` (import cerrado por configuración) | 503 | `fail` |
| Error de Supabase | 500 | `fail` |

Los errores de Supabase van completos a `audit_logs` y al log del servidor. Al
cliente solo llega un mensaje genérico: un error de base de datos puede contener
nombres de tablas y fragmentos de query, y no es un mensaje para el gerente.

---

## Notas de implementación

### Next.js 16

Esta versión rompe APIs que en versiones anteriores funcionaban:

| API | Nota |
|---|---|
| `params` y `searchParams` | Son **Promises**: `await searchParams` |
| `cookies()` / `headers()` | Son **async** |
| `middleware.ts` | Renombrado a `proxy.ts` |
| `revalidateTag` | Exige un segundo argumento |
| `next lint` | Eliminado |

### Filtros en la URL

`app/page.tsx` es un Server Component que lee `searchParams` y **filtra en el
servidor**. `FilterBar` es el único Client Component que escribe en la URL, con
`router.replace` y no `push`: cambiar un filtro tres veces no debe llenar el
historial de tres entradas que el usuario tiene que atravesar con "atrás".

Consecuencia: F5 no pierde la vista, el link se puede compartir, y "atrás"
deshace un filtro. Todo eso gratis.

### Rounding

`averageRating` redondea a 2 decimales; `replyPercentage` a 1. No es arbitrario:
`2/9` da `22.22%` y se muestra `22.2%`. Si el modelo guardara dos decimales y la
UI mostrara uno, el dato interno y el visible no coincidirían, y ese desajuste es
justo lo que hace que un usuario deje de confiar en un panel.

### Deduplicación y respuestas guardadas

Una reimportación **no** pisa un `reply_text` que ya exista. La primera
importación sí siembra las respuestas del fixture; a partir de ahí la respuesta
la escribe una persona y una reimportación no debe destruirla.

---

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript estricto · Tailwind CSS v4 ·
shadcn/ui (Radix) · Supabase (PostgreSQL + RLS) · Vitest
