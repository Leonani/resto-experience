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
}: {
  locations: Location[];
  restaurants: Restaurant[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const restaurante = searchParams.get("restaurante") ?? TODAS;
  const sede = searchParams.get("sede") ?? TODAS;
  const estado = (searchParams.get("estado") ?? "pendientes") as EstadoFilter;
  const estrellas = (searchParams.get("estrellas") ?? "todas") as EstrellasFilter;

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value === TODAS || value === "todas" || value === "pendientes") {
      // `pendientes` es el default, no necesita ir en la URL.
      params.delete(key);
    } else {
      params.set(key, value);
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
    searchParams.get("estrellas") !== null;

  return (
    <div
      className={`flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${isPending ? "opacity-60 transition-opacity" : ""}`}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filtro-restaurante">Restaurante</Label>
        <Select value={restaurante} onValueChange={(v) => update("restaurante", v)}>
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
            {locations.map((location) => (
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

      {hayFiltros && (
        <Button variant="ghost" onClick={clearAll} className="ml-auto">
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}
