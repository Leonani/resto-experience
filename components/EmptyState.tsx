"use client";

import { Inbox, SearchX } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

/**
 * Estado sin resultados. Nunca una pantalla vacía sin explicación: el usuario
 * tiene que saber si no hay datos o si los está filtrando fuera.
 */
export function EmptyState({
  hayFiltros,
  descripcion,
}: {
  hayFiltros: boolean;
  descripcion?: string;
}) {
  const router = useRouter();

  if (hayFiltros) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"
        data-testid="sin-resultados"
      >
        <SearchX className="size-8 text-slate-400" aria-hidden="true" />
        <div>
          <p className="font-medium text-slate-900">Sin resultados para estos filtros</p>
          <p className="mt-1 text-sm text-slate-500">
            Hay reseñas cargadas, pero ninguna coincide con la combinación seleccionada.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.replace("/", { scroll: false })}>
          Limpiar filtros
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"
      data-testid="sin-datos-iniciales"
    >
      <Inbox className="size-8 text-slate-400" aria-hidden="true" />
      <div>
        <p className="font-medium text-slate-900">Todavía no hay reseñas</p>
        <p className="mt-1 text-sm text-slate-500">
          {descripcion ??
            "Ejecutá la importación desde POST /api/import para cargar el dataset."}
        </p>
      </div>
    </div>
  );
}