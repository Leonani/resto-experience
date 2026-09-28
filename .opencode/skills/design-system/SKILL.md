---
name: design-system
description: Sistema de diseño y reglas de UI/UX para la bandeja de reseñas de la agencia gastronómica. Úsala al crear o modificar SiteHeader (login junto al título), SummaryHeader (bento grid de métricas con mini-dona por sede), RatingsStackedChart (bar chart apilado de sedes), FilterBar (filtros sincronizados con la URL), ReviewCard (borrador IA, edición inline, colores semánticos por estrellas), AuthGate (spinner de verificación, modo lectura), estados de carga, o cualquier componente de la bandeja. Contiene la paleta por estrellas (incluida la de buckets de gráficos), el indicador de borrador IA, la regla de "Sin datos" para sedes sin reseñas y la del modo lectura sin sesión.
---

# Design System — Bandeja de Reseñas

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

### 4.0 Bar chart apilado — "Composición de las reseñas"

Client Component (`components/RatingsStackedChart.tsx`, recharts vía
`ChartContainer`), una barra por sede segmentada por calificación. Va ARRIBA del bento,
antes de los filtros:

- Una barra por sede con los buckets `r5…rnull` apilados (`stackId`) y la paleta 2.1
- Las barras ocupan todo el ancho de su slot (`barCategoryGap="0%"`, sin
  `maxBarSize`): con 3 sedes cada barra es ≈ 1/3 del área del gráfico (el 35% del
  contenedor que se pidió)
- Legend abajo (`ChartLegendContent`) con los labels de la misma config
- Eje Y con enteros (`allowDecimals={false}`), texto de la sede en X
- Subtítulo `"N reseñas en M sedes"`, con los mismos números que el header
- Los datos llegan calculados como props desde `page.tsx` (client sin fetch)

Regla de honestidad: si el dataset no tiene esas reseñas, la barra es cero; nunca se
adorna con datos falsos. Sin leyenda propia por tarjeta: el detalle está en el tooltip
de la dona y en este gráfico global.

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
- `innerRadius=34`, `outerRadius=52`, `paddingAngle=2`, `stroke="none"`
- En el centro, superpuesto con `absolute inset-0`: la **cantidad total** de
  reseñas de la sede (suma de todos los buckets, `tabular-nums`) + label "reseñas".
  Ni promedio ni 0.0 inventado: una sede sin reseñas muestra "0" con el anillo
  vacío, que es un dato real (RN-05 solo gobierna el promedio, que vive en la
  tarjeta como "Sin datos")
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
- El login vive en `SiteHeader.tsx` (derecha del header, junto al título): botón
  "Iniciar sesión" (variant `outline`, ícono `Sparkles`, `data-testid="login-trigger"`,
  sombra) que abre un `Dialog` con:
  - Título **"Iniciar sesión"**
  - Description **"El listado y los filtros son públicos. La sesión habilita generar
    borradores y contestar reseñas."**
  - Campos `Input` Usuario y Contraseña (`Label` + `autoComplete` respectivo)
  - Enviar deshabilitado mientras carga, con `Loader2` + "Iniciando…"
  - Error inline `bg-rose-50 text-rose-700` con `role="alert"`
  - El `LoginForm` es un componente aparte (`components/LoginForm.tsx`)

### 7.3 Sesión iniciada

- Pastilla en el header (`data-testid="session-pill"`, borde `border-slate-200`, fondo
  blanco, sombra): **"Sesión: {user}"** + botón ghost "Salir" (ícono `LogOut`).
- Los botones de escritura vuelven a aparecer en cada `ReviewCard`.

Reglas de honestidad heredadas del resto del sistema: un 401 de `save-reply` o
`generate-draft` cierra la sesión en la UI (el servidor niega igual, fail-closed) y el
mensaje del contrato se muestra sin inventar otra causa.
