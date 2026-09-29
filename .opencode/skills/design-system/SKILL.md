---
name: design-system
description: Sistema de diseño y reglas de UI/UX para la bandeja de reseñas de la agencia gastronómica. Úsala al crear o modificar el shell (Sidebar izquierda, banner oscuro, KPICards, layout de dos columnas gráficos+feed sobre fondo crema), SiteHeader (título "Reseñas y Métricas", la sesión vive en la sidebar), SummaryHeader (bento grid de métricas con mini-dona por sede), EvolutionChart (evolución temporal de reseñas por día), FilterBar (filtros sincronizados con la URL), ReviewCard (borrador IA, edición inline, colores semánticos por estrellas), AuthGate (spinner de verificación, modo lectura), estados de carga, o cualquier componente de la bandeja. Contiene la paleta por estrellas (incluida la de buckets de gráficos), el indicador de borrador IA, la regla de "Sin datos" para sedes sin reseñas y la del modo lectura sin sesión.
---

# Design System — Bandeja de Reseñas

## 0. Shell y layout (dashboard de referencia)

La pantalla tiene el shell de un dashboard de agencia, sobre **fondo crema**
(`bg-[#f8f6f3]`). El `main` en `app/page.tsx` es un flex: **sidebar fija a la
izquierda** + columna de contenido a todo el ancho (sin `mx-auto` ni `max-w`). En móvil la sidebar
se oculta (`hidden lg:flex`) y todo queda en una columna.

Orden de la columna de contenido (Server Component `page.tsx`):

1. **`SiteHeader`**: ícono `Star` en caja negra `rounded-2xl`, título
   **"Reseñas y Métricas"** + subtítulo. Es solo título: la sesión (login /
   pastilla) ya NO vive acá, está en el footer de la sidebar (ver §7.2/7.3)
2. **Contenedor "Métricas"**: misma piel oscura que el banner de abajo
   (`bg-[#0f172a] text-white rounded-2xl px-5 py-4 shadow-sm`), ícono `Target`
   en caja `bg-white/10 text-sky-300`, rótulo **"Métricas"** (`text-sm
   font-semibold tracking-wide`) y a la derecha el total real
   (`{totalReviews} reseñas en total`) + los
   **`KPICards`**: grid `sm:grid-cols-2 xl:grid-cols-4`. Toda métrica sale de
   `calculateOverallSummary` (pura, testeada). **Nunca** fabricar comparativos
   ("+12% vs previo") ni inventar el promedio: sin reseñas calificadas → "Sin
   datos" (`data-testid="avg-sin-datos"`)
3. **Gráficos a ancho completo** (`flex flex-col gap-6`), SIEMPRE **arriba de los
   filtros y abajo de las métricas**: primero el `EvolutionChart` (§4.0,
   evolución temporal) ocupando todo el ancho del contenido, y debajo el bento
   del `SummaryHeader` (§4.1) también a ancho completo, con sus 3 tarjetas de
   dona en fila (`sm:grid-cols-2 lg:grid-cols-3`)
4. **Banner oscuro** `bg-[#0f172a]` texto blanco `rounded-2xl`: la
   **"Reseñas · Hoy & Este Mes"** con el badge `{todayCount} hoy`
   (`data-testid="resenas-hoy"`), pegado **justo arriba de los filtros** (es
   contexto del bloque de reseñas, no del encabezado). Es un conteo REAL de
   `published_at` del día (UTC, `calculateOverallSummary`): si el dataset es
   viejo da 0, y 0 es honesto
5. **FilterBar** completo, en su card blanca `rounded-2xl` (envuelto en
   `<Suspense>`, ver §5). En el lado derecho de la MISMA card vive
   la cabecera del feed: título **"Feed de reseñas"** + contador de visibles
   (`data-testid="feed-count"`, llega por prop `visibleCount`) + sub
   "Pendientes primero, por estrellas y fecha" (honestidad sobre el orden real).
   El botón "Limpiar filtros" está SIEMPRE visible arriba de esa cabecera y se
   deshabilita (`disabled`) cuando no hay filtros activos (`data-testid="limpiar-filtros"`)
6. **Reseñas debajo de los filtros**, a todo el ancho del contenido (ya no hay
   columna lateral ni scroll propio): `ReviewCard` apilados en
   `flex flex-col gap-3`, o el `EmptyState` si no hay visibles. La cabecera del
   feed sigue viviendo en la card de filtros.

Tipografía: **Helvetica** (`--font-sans: Helvetica, Arial, sans-serif` en
`app/globals.css`; no se usa `next/font` porque Helvetica es fuente del sistema).

Referencia estética común: tarjetas **blancas** `rounded-2xl border-slate-200
shadow-sm` (incluida la primitiva `ui/card`), `rounded-xl` para elementos
interiores (pills, bloques de respuesta).

### 0.1 Sidebar (`components/Sidebar.tsx`)

Server Component sin estado. `w-64` pegada con `sticky top-0 h-screen`, `bg-white
border-r`. Contenido compartido en `SidebarNav` (Server), reutilizado por el
drawer móvil. Contenido:

- Identidad: logo de la app (`/logo-resto.png`, sin fondo) en caja
  `rounded-xl` + título en negrita "Resto Experience" (sin subtítulo)
- Navegación por secciones (`Marketing`, `Operations`, `Analytics`) con ítems
  `rounded-xl`: `Reviews` es el ítem **activo** (`bg-zinc-900 text-white`),
  `Reservations` lleva la píldora `bg-slate-100` del diseño de referencia,
  `Social Media` un badge `Live`. Los ítems no navegan todavía: es maqueta
- Footer: **sesión del usuario** (`components/SessionMenu.tsx`, Client): botón
  "Iniciar sesión" (`data-testid="login-trigger"`) que abre el Dialog con el
  `LoginForm`, o pastilla `data-testid="session-pill"` con avatar de inicial +
  nombre de usuario + botón Salir. La sesión vive acá, junto al perfil, NO en
  el header

La sidebar fija se oculta en tablet/móvil (`hidden lg:flex`): en esas pantallas
la navegación vive en el drawer **`MobileSidebar`** (Client) que se abre con el
botón hamburguesa (`data-testid="menu-hamburguesa"`) de la barra superior
`lg:hidden`. El drawer (`data-testid="menu-movil"`) es un overlay con fondo
`bg-slate-900/40`, panel `w-64 bg-white` con scroll interno y equivale, en
contenido, a `SidebarNav` (se recibe por `children` desde `page.tsx`; el login
del `SessionMenu` también funciona ahí).

## 1. Jerarquía

Mostrar en primer plano las **reseñas pendientes de respuesta**. Las ya respondidas
se muestran después, atenuadas. El orden por defecto es:

1. Sin respuesta, estrellas **ascendentes**:
   1. **1 estrella**
   2. **2 estrellas**
   3. **3 estrellas**
   4. **Sin calificación** (`rating: null`)
   5. **4 estrellas**
   6. **5 estrellas**
   Dentro de cada rango, ordenadas por `published_at` descendente
2. Respondidas, con el mismo orden por estrellas y `published_at` descendente

Lógica en `lib/review-order.ts` (`compareReviewsByPriority`), pura y testeable.
`rating: null` no es un reclamo ni un elogio (RN-03): no clasifica como mal
servicio, por eso queda entre 3 y 4.

## 2. Paleta semántica por calificación

| Estrellas | Texto | Fondo | Borde |
|---|---|---|---|
| 4–5 | `emerald-600` | `emerald-50` | `emerald-200` |
| 3 | `amber-600` | `amber-50` | `amber-200` |
| 1–2 | `rose-600` | `rose-50` | `rose-200` |
| Sin calificación (`rating: null`) | `slate-500` | `slate-50` | `slate-200` |

La categoría de `rating: null` es obligatoria: esas reseñas existen y se responden,
pero no se pueden clasificar como buen o mal servicio. Sin esta categoría no hay dónde
ubicarlas, y el que las clasifique por defecto las mete en "mal servicio" cuando en
realidad el cliente simplemente no interfirió con la calificación.

### 2.1 Paleta de buckets para gráficos

La composición por calificación (donas y bar chart apilado) usa un bucket por valor
individual, en el orden canónico `5, 4, 3, 2, 1, null`. Colores **fijos oklch** (no
`var(--color-*)`), definidos una sola vez en `components/ratings-chart.ts`
(`RATING_CHART_CONFIG` / `RATING_KEYS`):

| Bucket | Clave | Color |
|---|---|---|
| 5 estrellas | `r5` | `oklch(0.596 0.145 163.225)` (emerald-600) |
| 4 estrellas | `r4` | `oklch(0.765 0.177 163.223)` (emerald-400) |
| 3 estrellas | `r3` | `oklch(0.769 0.188 70.08)` (amber-500) |
| 2 estrellas | `r2` | `oklch(0.712 0.209 9.889)` (rose-400) |
| 1 estrella | `r1` | `oklch(0.586 0.253 17.585)` (rose-600) |
| Sin calificación (`null`) | `rnull` | `oklch(0.704 0.04 256.788)` (slate-400) |

La suma de los buckets de una sede coincide con `totalReviews` de su `LocationSummary`
(toda reseña cae en exactamente un bucket, RN-03). Dona y barra se alimentan de la MISMA
fuente (`calculateRatingsByLocation` en `lib/metrics.ts`): si un número cambia, cambia en
ambos lados. Si una sede no tiene reseñas, sus buckets quedan en 0 y se muestra "Sin datos",
nunca un 0.0 inventado.

## 3. Indicador visual de borrador IA

Todo borrador generado que **no ha sido guardado** lleva:

- Contenedor con borde **punteado** y color `indigo-600`
- Indicador honesto según el origen del texto:
  - IA real: `Borrador generado por IA`
  - Sin `LLM_API_KEY` (template local): `Borrador local (sin IA configurada)`
  - IA configurada que falló: `Borrador local (la IA falló; revisalo antes de publicar)`,
    más una alerta `Fallo borrador IA` (rol `alert`, rosa)
  - IA cortada por presupuesto: `Borrador local (límite de generación IA alcanzado)`,
    con nota ámbar (`role="status"`, `amber`) con el `budgetReason`. Es un límite,
    no un error: ámbar, nunca rojo
- Distinción estricta entre borrador y respuesta persistida. Un borrador sin guardar
  **nunca** se escribe en `reply_text` hasta que el usuario confirma.

Regla: nunca afirmar que el texto vino de la IA si salió del fallback local. Fingir éxito
cuando el proveedor falló es un bug de honestidad, no de estilo. El cuarto estado
(presupuesto) también sale del template local: su etiqueta dice "Borrador local", no "Por IA".

## 4. Bar chart apilado (global) y tarjetas Bento

### 4.0 Gráfico de evolución — "Evolución de las reseñas"

Client Component (`components/EvolutionChart.tsx`, recharts vía
`ChartContainer`, `ComposedChart`). Muestra la serie temporal de reseñas, NO la
composición por calificación (esa ya vive en las mini-donas del bento). Va en
la columna izquierda, arriba del bento:

- **Área** con `total`: reseñas publicadas por **día**, con los días sin reseñas en 0
  (los huecos se ven, no se esconden)
- **Línea** con `promedio`: promedio de estrellas por día (eje derecho fijo 0-5,
  `domain={[0, 5]}`), con `connectNulls={false}`: si un día no tuvo calificadas, la
  línea corta en vez de inventar (RN-05)
- Datos desde `calculateSeriesOverTime(reviews)` en `lib/metrics.ts` (serie
  por día UTC, rango INCLUSIVE [min, max], `label "DD/MM"`), llegados por props
- Eje X rotado 30° con `interval="preserveStartEnd"` para no amontonar etiquetas
- Subtítulo "Reseñas por día · cantidad y promedio de estrellas"
- Legend abajo (`ChartLegendContent`) con los labels de `SERIE_TEMPORAL_CONFIG`:
  `total` esmeralda 600, `promedio` zinc 900

### 4.1 Tarjetas Bento de resumen por sede

Una tarjeta por sede, con tres datos:

- **Mini-dona de composición** arriba del promedio
- **Total de reseñas**
- **Promedio** con ícono de estrella
- **% Respondido** con barra de progreso (`components/ui/progress.tsx`)

`SummaryHeader.tsx` es ahora **Client Component** (por la dona, recharts) pero recibe
todo calculado como props: no hay `useEffect` ni fetch en el cliente.

### 4.2 Mini-dona por sede

`components/RatingDonut.tsx` (recharts `PieChart`, `ChartContainer` de `h-28 w-28`):

- Segmentos = buckets con `count > 0` de esa sede (los de 0 no entran al `Pie`)
- Cada sector muestra en su interior la CANTIDAD de reseñas con esa calificación:
  `Pie label={renderPieLabel}` calcula el centro del sector (`midAngle` + radios,
  `RADIAN`) y pinta el conteo en `fill="#fff"` (recharts hereda el fill del sector
  si no se lo fuerza, así que el texto se fuerza explícitamente)
- `innerRadius=34`, `outerRadius=52`, `paddingAngle=2`, `stroke="none"`
- Centro VACÍO a propósito: el total de reseñas y el promedio ya viven en la
  tarjeta; el centro no repite ningún dato
- Tooltip al pasar el cursor con el label del bucket y su conteo

### Regla crítica: "Sin datos"

Si la sede no tiene reseñas **o** no tiene ninguna con `rating` distinto de `null`,
el promedio renderiza `Sin datos`. **Nunca `0.0`, nunca `0`, nunca `—`.**

`0.0` es un dato falso: afirma que hubo reseñas y todas fueron de 0 estrellas, cuando
en realidad no hay información. Belgrano (`loc-2`) es el caso de prueba permanente.

## 5. Sincronización con la URL

Los filtros (Restaurante, Sede, Calificación, Estado) se reflejan en los parámetros
de búsqueda mediante `useSearchParams`.

- `FilterBar` es un Client Component (`"use client"`)
- Como `useSearchParams` fuerza render dinámico, el componente que lo usa debe
  estar envuelto en `<Suspense>` desde el Server Component que lo renderiza
- Actualizar un filtro hace `router.replace(...)`, nunca un push que ensucie el historial
- Cada filtro borra su parámetro SOLO cuando el valor es su default (`restaurante`→
  todos, `sede`→todas, `estrellas`→todas, `estado`→`pendientes`). Por eso
  **`estado=todas` SÍ persiste en la URL**: el default de estado es "pendientes",
  si se borrara el param el lector lo interpretaría como pendientes y "Todas"
  dejaría de funcionar
- Los filtros son la fuente de verdad: la lista se filtra **en el servidor** leyendo
  `searchParams` en `page.tsx`, no en el cliente
- Los filtros se combinan en AND: Restaurante deja las reseñas de todas sus sedes y
  se puede afinar con Sede dentro de ese restaurante
- El select de Sede muestra **solo las sedes del restaurante elegido**: con "Todos los
  restaurantes" se ven todas; con un restaurante, únicamente las suyas. Cambiar de
  restaurante limpia la sede si la elegida ya no pertenece al nuevo (nunca un filtro
  invisible que combine a 0 resultados en silencio)

### Parámetros

| Param | Valores | Default |
|---|---|---|
| `restaurante` | `rest-1` \| `rest-2` | todos |
| `sede` | `loc-1` \| `loc-2` \| `loc-3` | todas |
| `estrellas` | `alta` (4–5) \| `media` (3) \| `baja` (1–2) \| `sin` (null) | todas |
| `estado` | `pendientes` \| `respondidas` | `pendientes` |

## 6. Estados de la UI

- **Carga**: `components/ui/skeleton.tsx` con la misma geometría que el contenido real
- **Sin resultados**: mensaje explícito con el filtro activo y un botón para limpiarlo.
  Nunca una pantalla vacía sin explicación.
- **Error**: mostrar `message` del contrato `{success, data, message}`. Nunca un toast
  genérico que oculte la causa.

## 7. Sesión de escritura y modo lectura

La bandeja es pública por diseño (`RN-08`): ver métricas, filtros y listado no exige
sesión. Solo escribir lo exige. `AuthGate.tsx` (Client Component envuelve el `main` de
`page.tsx`) maneja tres estados:

### 7.1 Verificando usuario (spinner)

- Pantalla completa `fixed inset-0 z-50` con `bg-white/80 backdrop-blur-sm`
- Ícono `Loader2` girando (`text-slate-500`, `size-6`) + texto `text-slate-600`
  **"Verificando usuario…"**
- `role="status"`. Cubre la interfaz mientras se valida el token guardado contra
  `/api/auth/verify`. Nunca bloquea la lectura final: al terminar se muestra el dashboard
  en los dos casos.

### 7.2 Modo lectura (sin sesión)

- `SummaryHeader`, `FilterBar` y el listado se ven **iguales**: la lectura es pública.
- `ReviewCard` no muestra ninguno de los botones de escritura (Generar borrador,
  Responder, Editar, Guardar, Cancelar). En su lugar, el `footer` muestra un texto
  `text-xs text-slate-400`:
  **"Modo lectura. Iniciá sesión para generar borradores y contestar."**
- El login vive en `SessionMenu.tsx` (footer de la sidebar, donde va el
  usuario): botón "Iniciar sesión" (variant `outline`, ícono `Sparkles`,
  `data-testid="login-trigger"`, ancho completo) que abre un `Dialog` con:
  - Título **"Iniciar sesión"**
  - Description **"El listado y los filtros son públicos. La sesión habilita generar
    borradores y contestar reseñas."**
  - Campos `Input` Usuario y Contraseña (`Label` + `autoComplete` respectivo)
  - Enviar deshabilitado mientras carga, con `Loader2` + "Iniciando…"
  - Error inline `bg-rose-50 text-rose-700` con `role="alert"`
  - El `LoginForm` es un componente aparte (`components/LoginForm.tsx`)

### 7.3 Sesión iniciada

- Pastilla en el footer de la sidebar (`data-testid="session-pill"`, `rounded-xl`
  `bg-slate-50` borde `border-slate-100`): avatar circular con la inicial del
  usuario, **nombre del usuario** + restaurante/owner al lado, y botón ghost
  "Salir" (ícono `LogOut`).
- Los botones de escritura vuelven a aparecer en cada `ReviewCard`.

Reglas de honestidad heredadas del resto del sistema: un 401 de `save-reply` o
`generate-draft` cierra la sesión en la UI (el servidor niega igual, fail-closed) y el
mensaje del contrato se muestra sin inventar otra causa.
