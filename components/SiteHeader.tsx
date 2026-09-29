import { Star } from "lucide-react";

/**
 * Header de la bandeja: solo el título. La sesión (login/pastilla) vive en el
 * footer de la sidebar (`SessionMenu`), no acá.
 */
export function SiteHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-zinc-900 text-white shadow-sm">
          <Star className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Reseñas y Métricas
          </h1>
          <p className="text-sm text-slate-500">
            Promedios, respuestas y borradores por sede
          </p>
        </div>
      </div>
    </header>
  );
}