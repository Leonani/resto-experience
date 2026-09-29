"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ESTADOS,
  ESTRELLAS,
  ESTRELLAS_LABEL,
  type EstadoFilter,
  type EstrellasFilter,
  type Location,
  type Restaurant,
} from "@/lib/types/review";

const TODAS = "__todas__";

const ESTADO_LABEL: Record<EstadoFilter, string> = {
  pendientes: "Pendientes",
  respondidas: "Respondidas",
  todas: "Todas",
};

/**
 * Filtros sincronizados con la URL.
 *
 * La URL es la fuente de verdad: este componente no guarda estado de filtros.
 * `router.replace` y no `push` — cambiar un filtro tres veces no debe llenar
 * el historial de tres entradas que el usuario tiene que atravesar con "atrás".
 *
 * El filtrado real ocurre en el servidor, en `page.tsx`, leyendo `searchParams`.
 */
export function FilterBar({
  locations,
  restaurants,
  visibleCount,
}: {
  locations: Location[];
  restaurants: Restaurant[];
  visibleCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const restaurante = searchParams.get("restaurante") ?? TODAS;
  const sede = searchParams.get("sede") ?? TODAS;
  const estado = (searchParams.get("estado") ?? "pendientes") as EstadoFilter;
  const estrellas = (searchParams.get("estrellas") ?? "todas") as EstrellasFilter;

  // Las sedes del select dependen del restaurante elegido: con "Todos los
  // restaurantes" se ven todas; con un restaurante, solo las suyas.
  const sedesDelRestaurante =
    restaurante === TODAS
      ? locations
      : locations.filter((location) => location.restaurant_id === restaurante);

  // Cada filtro tiene UN valor que es el default y no necesita ir en la URL.
  // Cuidado con "todas": es el default SOLO para estrellas. Para estado el
  // default es "pendientes", así que "estado=todas" DEBE persistir: si se
  // borrara el param, el lector de la URL lo interpretaría como "pendientes".
  function esValorDefault(key: string, value: string): boolean {
    return (
      (key === "restaurante" && value === TODAS) ||
      (key === "sede" && value === TODAS) ||
      (key === "estrellas" && value === "todas") ||
      (key === "estado" && value === "pendientes")
    );
  }

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (esValorDefault(key, value)) {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    startTransition(() => {
      router.replace(params.size > 0 ? `/?${params}` : "/", { scroll: false });
    });
  }

  // Cambiar de restaurante puede dejar la sede apuntando a una sede que ya no
  // está en el select. En ese caso se limpia: el filtro no puede quedar en una
  // sede invisible que combine a 0 resultados en silencio.
  function updateRestaurante(value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value === TODAS) {
      params.delete("restaurante");
    } else {
      params.set("restaurante", value);
    }

    const sedesDelNuevo =
      value === TODAS
        ? locations
        : locations.filter((location) => location.restaurant_id === value);
    const sedeActual = params.get("sede");
    if (sedeActual && !sedesDelNuevo.some((l) => l.id === sedeActual)) {
      params.delete("sede");
    }

    startTransition(() => {
      router.replace(params.size > 0 ? `/?${params}` : "/", { scroll: false });
    });
  }

  function clearAll() {
    startTransition(() => {
      router.replace("/", { scroll: false });
    });
  }

  const hayFiltros =
    searchParams.get("sede") !== null ||
    searchParams.get("restaurante") !== null ||
    searchParams.get("estado") !== null ||
    searchParams.get("estrellas") !== null ||
    // El período de las métricas también es un filtro: si no contara, el botón
    // "Limpiar filtros" quedaría deshabilitado con un rango activo en pantalla.
    searchParams.get("desde") !== null ||
    searchParams.get("hasta") !== null;

  return (
    <div
      className={`flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${isPending ? "opacity-60 transition-opacity" : ""}`}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filtro-restaurante">Restaurante</Label>
        <Select value={restaurante} onValueChange={updateRestaurante}>
          <SelectTrigger id="filtro-restaurante" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todos los restaurantes</SelectItem>
            {restaurants.map((restaurant) => (
              <SelectItem key={restaurant.id} value={restaurant.id}>
                {restaurant.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filtro-sede">Sede</Label>
        <Select value={sede} onValueChange={(v) => update("sede", v)}>
          <SelectTrigger id="filtro-sede" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas las sedes</SelectItem>
            {sedesDelRestaurante.map((location) => (
              <SelectItem key={location.id} value={location.id}>
                {location.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filtro-estado">Estado</Label>
        <Select value={estado} onValueChange={(v) => update("estado", v)}>
          <SelectTrigger id="filtro-estado" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ESTADOS.map((value) => (
              <SelectItem key={value} value={value}>
                {ESTADO_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filtro-estrellas">Calificación</Label>
        <Select value={estrellas} onValueChange={(v) => update("estrellas", v)}>
          <SelectTrigger id="filtro-estrellas" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ESTRELLAS.map((value) => (
              <SelectItem key={value} value={value}>
                {ESTRELLAS_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Cabecera del feed: convive con los filtros en la misma card.
          El orden mostrado es el real (compareReviewsByPriority), nunca el de
          llegada: el subtítulo lo declara en vez de fingir un feed cronológico. */}
      <div className="ml-auto flex flex-col items-end gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          disabled={!hayFiltros}
          className="h-auto px-1 py-0.5 text-xs text-slate-500"
          data-testid="limpiar-filtros"
        >
          Limpiar filtros
        </Button>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Feed de reseñas</h2>
          <span
            className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 tabular-nums"
            data-testid="feed-count"
          >
            {visibleCount}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          Pendientes primero, por estrellas y fecha
        </p>
      </div>
    </div>
  );
}
