---
name: tech-stack
description: Stack tecnologico y reglas de arquitectura del proyecto. Usala al escribir cualquier backend, route handler, Server Action, acceso a Supabase, funcion de auditoria o test. Define Next.js 16 App Router, el contrato de respuesta obligatorio {success, data, message}, la regla de que las API Keys y la service role key viven solo en el servidor, y la obligatoriedad de auditar toda mutacion en la tabla audit_logs.
---

# Tech Stack & Reglas de Arquitectura

## 1. Stack

| Capa | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack por defecto) |
| Lenguaje | TypeScript, `strict: true` |
| Estilos | Tailwind CSS v4 + shadcn/ui (preset `nova`, base `radix`) |
| Datos | Supabase (`@supabase/supabase-js` v2) |
| Tests | Vitest |
| Iconos | Lucide (incluidos por shadcn) |

## 2. Reglas obligatorias

### 2.1 Contrato de API

Toda Route Handler y toda Server Action devuelve el mismo shape, sin excepciones:

```ts
{ success: 'ok' | 'fail', data: T | null, message: string }
```

Los helpers viven en `lib/types/api.ts`: `buildSuccessResponse` y
`buildErrorResponse`. Nunca devolver otro shape, ni un error de Supabase crudo, ni
un throw sin manejar.

El status HTTP acompana al contrato: `200` con `success: 'ok'`, `4xx`/`5xx` con
`success: 'fail'`. El cuerpo cumple el contrato aunque el status sea un error.

### 2.2 Seguridad de credenciales

- `SUPABASE_SERVICE_ROLE_KEY` se lee **exclusivamente** en el servidor.
- La API Key del LLM se lee **exclusivamente** en el servidor, dentro del route handler.
- Al cliente solo sale lo que lleva prefijo `NEXT_PUBLIC_`.
- Prohibido el fallback de la service role a la anon key. Una escritura que degrada
  permisos en silencio rompe la trazabilidad sin avisar: si falta la key, fallar.
- Usar la API `taint` de Next.js si un valor de servidor se acerca a un Client Component.

### 2.3 Trazabilidad

Toda operacion que cree, modifique o falle escribe en `audit_logs` usando
`logAuditEvent` de `lib/audit.ts`.

Acciones: `IMPORT_REVIEWS`, `IMPORT_REPLY`, `SKIP_REVIEW`, `GENERATE_AI_DRAFT`,
`SAVE_REPLY`.

- `method`: `'POST'` para Route Handlers, `'SERVER_ACTION'` para Server Actions
- `response_status`: `'ok'` | `'fail'`
- Los rechazos por clave foranea se registran con `status: 'fail'` y `error_message`
  explicando el motivo. Un registro descartado sin log es indistinguible de uno que
  nunca llego.

### 2.4 Contrato de Supabase

`@supabase/supabase-js` **no lanza excepciones**: devuelve `{ data, error }`.
Todo acceso debe desestructurar y verificar `error`. Un `await` sin chequeo de
`error` es un bug, no un atajo.

## 3. Reglas de datos sucios

Aplicar siempre, sin excepcion:

| Caso | Regla |
|---|---|
| `id` duplicado | Gana el `updated_at` mas reciente |
| `location_id` inexistente | Descartar y auditar. **Nunca crear la sede** |
| `rating: null` | Cuenta en el total, se excluye del promedio |
| `text: ''` | Es valido. Habilita respuesta con agradecimiento estandar |
| Sede sin reseñas | El promedio es `null` y la UI muestra `Sin datos` |

## 4. Next.js 16 — lo que cambió y no aplica

Estas APIs cambiaron. Verificar en `node_modules/next/dist/docs/` antes de usarlas.

| API | Nota |
|---|---|
| `params` en `page.tsx` / `route.ts` | Es una **Promise**, se accede con `await` |
| `searchParams` en `page.tsx` | Es una **Promise**, se accede con `await` |
| `cookies()` / `headers()` | Son **async** |
| `middleware.ts` | Renombrado a `proxy.ts`, export `proxy` |
| `revalidateTag` | Exige un 2do argumento (perfil de `cacheLife`) |
| `next lint` | Eliminado. Usar `eslint` directo |
| Tipos de ruta | `PageProps<'/ruta'>` y `RouteContext<'/ruta'>` generados por `next typegen` |

`PageProps` y `LayoutProps` viven en `.next/types/`, que es generado. En un
checkout limpio, `tsc` falla con `Cannot find name 'PageProps'` si no se corre
`next typegen` (o `next build`, o `next dev`) antes. El script `pnpm typecheck`
ya lo hace.

## 5. Gestor de paquetes: pnpm

El proyecto usa **pnpm**, fijado en el campo `packageManager` de `package.json`.
`corepack` lo descarga solo aunque no esté instalado globalmente.

| Contexto | Comando |
|---|---|
| Instalar | `pnpm install` |
| CI / Vercel | `pnpm install --frozen-lockfile` |
| Ejecutar un script | `pnpm <script>` |
| Herramienta efímera | `pnpm dlx shadcn@latest add <componente>` |
| Agregar dependencia | `pnpm add <pkg>` / `pnpm add -D <pkg>` |

En Windows, `pnpm.ps1` y `pnpm` están bloqueados por la Execution Policy de
PowerShell. Usar **`pnpm.cmd`**.

Los postinstall scripts permitidos viven en `package.json`
(`pnpm.onlyBuiltDependencies`), **no** en `.npmrc`. pnpm 10 no los corre por
defecto: sin aprobar `esbuild` el build falla con un error confuso que no
menciona pnpm.
