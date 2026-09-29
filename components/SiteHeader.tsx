"use client";

import { LogOut, Sparkles } from "lucide-react";
import Image from "next/image";
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
 * Header de la bandeja: título a la izquierda, sesión a la derecha. El login
 * vive acá (junto al título), no en botones flotantes.
 *
 * Client Component porque consume `useAuth()`.
 */
export function SiteHeader() {
  const { status, user, login, logout } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-slate-100 shadow-sm">
          <Image
            src="/logo-resto.png"
            alt="Logo Resto Experience"
            width={44}
            height={44}
            className="rounded-2xl"
          />
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

      {status === "autenticado" ? (
        <div
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-sm"
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