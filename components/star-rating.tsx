import { Star } from "lucide-react";

import type { Review } from "@/lib/types/review";

/**
 * Paleta semántica por calificación (design-system §2).
 *
 * La categoría `null` no es opcional: sin ella esas reseñas no tienen dónde
 * ubicarse, y cualquiera que las clasifique por defecto las mete en "mal
 * servicio" cuando el cliente simplemente no interfirió con la calificación.
 */
export type StarTone = "alta" | "media" | "baja" | "sin";

const TONE_CLASSES: Record<StarTone, { text: string; bg: string; border: string }> = {
  alta: {
    text: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  media: {
    text: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  baja: {
    text: "text-rose-600",
    bg: "bg-rose-50",
    border: "border-rose-200",
  },
  sin: {
    text: "text-slate-500",
    bg: "bg-slate-50",
    border: "border-slate-200",
  },
};

export function toneForRating(rating: number | null): StarTone {
  if (rating === null) return "sin";
  if (rating >= 4) return "alta";
  if (rating === 3) return "media";
  return "baja";
}

export function toneClasses(tone: StarTone) {
  return TONE_CLASSES[tone];
}

/** Estrellas llenas + vacías. `null` renderiza un guion, no cinco estrellas grises. */
export function Stars({ rating }: { rating: number | null }) {
  if (rating === null) {
    return (
      <span className="text-xs text-slate-400">Sin calificar</span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`${rating} de 5 estrellas`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`size-3.5 ${i < rating ? "fill-current" : "text-slate-200"}`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

/**
 * Fecha relativa corta. Acepta que el servidor y el cliente difieran un segundo
 * sin producir un error de hidratación: el texto se calcula en el render del
 * servidor y React no lo vuelve a calcular en el cliente.
 */
export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 60) return `hace ${Math.max(1, minutes)} min`;
  if (hours < 24) return `hace ${hours} h`;
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;

  return date.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/** Tipo extendido para las props de los componentes de UI. */
export type ReviewWithLocation = Review & {
  locationName: string;
  restaurantName: string;
};
