"use client";

import { LogOut, Sparkles } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/components/AuthGate";
import { LoginForm } from "@/components/LoginForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Sesión del usuario en el footer de la sidebar.
 *
 * - `anonimo`: botón "Iniciar sesión" (abre el Dialog con `LoginForm`).
 * - `autenticado`: avatar con la inicial + nombre de usuario + botón Salir.
 * - `verificando`: no renderiza nada; `AuthGate` ya pinta el overlay.
 *
 * Client Component porque consume `useAuth()`. El footer de la sidebar es el
 * único lugar donde se gestiona la sesión (el header solo tiene el título).
 */
export function SessionMenu({ restaurantName }: { restaurantName?: string }) {
  const { status, user, login, logout } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  if (status === "autenticado") {
    const inicial = user?.charAt(0).toUpperCase() ?? "U";

    return (
      <div
        className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3"
        data-testid="session-pill"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-zinc-800 text-xs font-semibold text-white">
          {inicial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{user}</p>
          <p className="truncate text-xs text-slate-500">
            {restaurantName ?? "Resto Experience"} · Owner
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={logout} aria-label="Salir">
          <LogOut className="size-4" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  if (status === "anonimo") {
    return (
      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start gap-2 shadow-sm"
            data-testid="login-trigger"
          >
            <Sparkles className="size-4" aria-hidden="true" />
            Iniciar sesión
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Iniciar sesión</DialogTitle>
            <DialogDescription>
              El listado y los filtros son públicos. La sesión habilita generar
              borradores y contestar reseñas.
            </DialogDescription>
          </DialogHeader>
          <LoginForm onLogin={login} onSuccess={() => setLoginOpen(false)} />
        </DialogContent>
      </Dialog>
    );
  }

  return null;
}