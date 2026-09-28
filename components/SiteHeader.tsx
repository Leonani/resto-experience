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
 * Header de la bandeja: título + subtítulo a la izquierda, sesión a la
 * derecha. El login vive acá (junto al título), no en botones flotantes.
 *
 * Client Component porque consume `useAuth()`, pero los números llegan ya
 * calculados del Server Component (`page.tsx`).
 */
export function SiteHeader({
  reviewCount,
  locationCount,
  loadError,
}: {
  reviewCount: number;
  locationCount: number;
  loadError: boolean;
}) {
  const { status, user, login, logout } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Bandeja de reseñas
        </h1>
        <p className="text-sm text-slate-500">
          {loadError
            ? "Sin conexión con la base de datos"
            : `${reviewCount} reseñas en ${locationCount} sedes`}
        </p>
      </div>

      {status === "autenticado" ? (
        <div
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-sm"
          data-testid="session-pill"
        >
          <span className="text-sm text-slate-600">Sesión: {user}</span>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="size-4" aria-hidden="true" />
            Salir
          </Button>
        </div>
      ) : status === "anonimo" ? (
        <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              data-testid="login-trigger"
              className="shadow-sm"
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
      ) : null}
    </header>
  );
}