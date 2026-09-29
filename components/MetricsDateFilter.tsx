"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Filtro de fechas de las MÉTRICAS (section "Métricas"), no del feed: escribe
 * `desde`/`hasta` en la URL y `page.tsx` los aplica a `calculateOverallSummary`.
 *
 * Default = historial completo (sin params en la URL). Los bordes son
 * INCLUSIVE y en UTC: "hasta 16/09" incluye todo el 16/09.
 */
export function MetricsDateFilter({ reviewCount }: { reviewCount: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const desde = searchParams.get("desde") ?? "";
  const hasta = searchParams.get("hasta") ?? "";
  const hayRango = desde !== "" || hasta !== "";

  function apply(next: { desde?: string; hasta?: string }) {
    const params = new URLSearchParams(searchParams.toString());

    for (const key of ["desde", "hasta"] as const) {
      const value = next[key];
      if (value === undefined) continue;
      if (value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    startTransition(() => {
      router.replace(params.size > 0 ? `/?${params}` : "/", { scroll: false });
    });
  }

  // No se dejan rangos invertidos: si `desde` pasa al `hasta` vigente, el
  // límite superior se libera en vez de producir un rango imposible.
  function setDesde(value: string) {
    if (value !== "" && hasta !== "" && value > hasta) {
      apply({ desde: value, hasta: "" });
      return;
    }
    apply({ desde: value });
  }

  function setHasta(value: string) {
    if (value !== "" && desde !== "" && value < desde) {
      apply({ desde: "", hasta: value });
      return;
    }
    apply({ hasta: value });
  }

  return (
    <div
      className={`grid grid-cols-1 items-end gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4 lg:flex lg:flex-wrap ${isPending ? "opacity-60 transition-opacity" : ""}`}
      data-testid="metricas-filtro-fechas"
    >
      <div className="flex flex-col gap-1.5 md:col-span-2">
        <Label htmlFor="metricas-desde">Desde</Label>
        <Input
          id="metricas-desde"
          type="date"
          value={desde}
          max={hasta !== "" ? hasta : undefined}
          onChange={(e) => setDesde(e.target.value)}
          className="w-full lg:w-40"
        />
      </div>

      <div className="flex flex-col gap-1.5 md:col-span-2">
        <Label htmlFor="metricas-hasta">Hasta</Label>
        <Input
          id="metricas-hasta"
          type="date"
          value={hasta}
          min={desde !== "" ? desde : undefined}
          onChange={(e) => setHasta(e.target.value)}
          className="w-full lg:w-40"
        />
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => apply({ desde: "", hasta: "" })}
        disabled={!hayRango}
        className="h-auto px-1 py-0.5 text-xs text-slate-500 md:col-span-2"
        data-testid="metricas-todo-el-historico"
      >
        <RotateCcw className="size-3" aria-hidden="true" />
        Todo el histórico
      </Button>

      <p className="text-xs text-slate-500 md:col-span-2 md:text-right lg:ml-auto">
        {hayRango
          ? `${reviewCount} reseñas en el período`
          : "Mostrando todo el histórico"}
      </p>
    </div>
  );
}