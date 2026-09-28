---
name: design-system
description: Sistema de diseño y reglas de UI/UX para la bandeja de reseñas de la agencia gastronómica. Úsala al crear o modificar SummaryHeader (bento grid de métricas), FilterBar (filtros sincronizados con la URL), ReviewCard (borrador IA, edición inline, colores semánticos por estrellas), estados de carga, o cualquier componente de la bandeja. Contiene la paleta por estrellas, el indicador de borrador IA y la regla de "Sin datos" para sedes sin reseñas.
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

## 4. Tarjetas Bento de resumen por sede

Una tarjeta por sede, con tres datos:

- **Total de reseñas**
- **Promedio** con ícono de estrella
- **% Respondido** con barra de progreso (`components/ui/progress.tsx`)

### Regla crítica: "Sin datos"

Si la sede no tiene reseñas **o** no tiene ninguna con `rating` distinto de `null`,
el promedio renderiza `Sin datos`. **Nunca `0.0`, nunca `0`, nunca `—`.**

`0.0` es un dato falso: afirma que hubo reseñas y todas fueron de 0 estrellas, cuando
en realidad no hay información. Belgrano (`loc-2`) es el caso de prueba permanente.

## 5. Sincronización con la URL

Los filtros (Sede, Calificación, Estado) se reflejan en los parámetros de búsqueda
mediante `useSearchParams`.

- `FilterBar` es un Client Component (`"use client"`)
- Como `useSearchParams` fuerza render dinámico, el componente que lo usa debe
  estar envuelto en `<Suspense>` desde el Server Component que lo renderiza
- Actualizar un filtro hace `router.replace(...)`, nunca un push que ensucie el historial
- Los filtros son la fuente de verdad: la lista se filtra **en el servidor** leyendo
  `searchParams` en `page.tsx`, no en el cliente

### Parámetros

| Param | Valores | Default |
|---|---|---|
| `sede` | `loc-1` \| `loc-2` \| `loc-3` | todas |
| `estrellas` | `alta` (4–5) \| `media` (3) \| `baja` (1–2) \| `sin` (null) | todas |
| `estado` | `pendientes` \| `respondidas` | `pendientes` |

## 6. Estados de la UI

- **Carga**: `components/ui/skeleton.tsx` con la misma geometría que el contenido real
- **Sin resultados**: mensaje explícito con el filtro activo y un botón para limpiarlo.
  Nunca una pantalla vacía sin explicación.
- **Error**: mostrar `message` del contrato `{success, data, message}`. Nunca un toast
  genérico que oculte la causa.
