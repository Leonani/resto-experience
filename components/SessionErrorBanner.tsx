"use client";

import { TriangleAlert } from "lucide-react";

import { useAuth } from "@/components/AuthGate";

/**
 * Aviso de que la verificación de sesión falló.
 *
 * No bloquea nada: el listado y los filtros son públicos (RN-08), así que el
 * dashboard se sigue mostrando en modo lectura. Lo que cambia es que el
 * usuario deja de ver una pantalla indistinguible de "no tenés sesión".
 *
 * Se usa `role="alert"` (igual que el bloque de error de datos de `page.tsx`)
 * y NO un toast: un aviso efímero se le pasa por arriba a quien llegó tarde,
 * que es justo el caso que querés cubrir.
 */
export function SessionErrorBanner() {
  const { status, verificacionError } = useAuth();

  if (status !== "error" || !verificacionError) return null;

  return (
    <div
      className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
      role="alert"
      data-testid="session-error"
    >
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-rose-600" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-medium">No se pudo verificar la sesión</p>
          <p className="mt-1">{verificacionError}</p>
          <p className="mt-2 text-rose-600">
            Podés seguir usando el listado y los filtros, pero responder y generar
            borradores no va a funcionar hasta que el servidor responda bien.
          </p>
        </div>
      </div>
    </div>
  );
}
