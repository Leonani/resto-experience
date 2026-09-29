"use client";

import { Loader2 } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { ApiResponse, LoginResult, VerifyResult } from "@/lib/types/api";

/**
 * Sesión de escritura (provider + verificación).
 *
 * El listado y los filtros son públicos por diseño (se puede pasar la URL a
 * otra persona). Solo contestar exige sesión, así que durante la verificación
 * se cubre la interfaz con el spinner "Verificando usuario…" y, terminada, se
 * muestra el dashboard igual en ambos casos.
 *
 * Cuándo se muestra la UI de login (botón/panel/pastilla) lo decide
 * `SessionMenu`, que vive en el footer de la sidebar DENTRO de este provider
 * y consume `useAuth()`. Acá no hay botones flotantes: el login está en la
 * sidebar, junto al perfil del usuario.
 *
 * Estados:
 *   - `verificando`: spinner "Verificando usuario…" mientras `/api/auth/verify`
 *     consulta la cookie de sesión.
 *   - `anonimo`: dashboard en modo lectura; `SessionMenu` muestra "Iniciar sesión".
 *   - `autenticado`: escrituras habilitadas; `SessionMenu` muestra la pastilla.
 *
 * NO hay token en el cliente. La sesión vive en una cookie `HttpOnly`: el
 * navegador la manda sola con cada request y el JavaScript —ni siquiera un
 * XSS— puede leerla. Por eso acá no hay `localStorage` ni headers `Authorization`
 * que mantener, y los `fetch` usan `credentials: 'same-origin'` para no perder
 * la cookie.
 */

type AuthStatus = "verificando" | "anonimo" | "autenticado";

type AuthContextValue = {
  status: AuthStatus;
  user: string | null;
  /** ISO de expiración de la sesión, para poder mostrarla si hace falta. */
  expiresAt: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("verificando");
  const [user, setUser] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    // El setState va diferido un tick a propósito: primero se pinta el overlay
    // "Verificando usuario…" y después se resuelve la sesión, sin setState
    // síncrono dentro del efecto.
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          credentials: "same-origin",
        });
        const body = (await res.json()) as ApiResponse<VerifyResult>;

        if (!active) return;

        if (res.ok && body.success === "ok" && body.data) {
          setUser(body.data.user);
          setExpiresAt(body.data.expiresAt);
          setStatus("autenticado");
        } else {
          // Sin cookie, vencida o revocada: modo lectura.
          setStatus("anonimo");
        }
      } catch {
        if (!active) return;
        setStatus("anonimo");
      }
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(id);
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const body = (await res.json()) as ApiResponse<LoginResult>;

    if (!res.ok || body.success !== "ok" || !body.data) {
      throw new Error(body.message || "No se pudo iniciar sesión.");
    }

    setUser(body.data.user);
    setExpiresAt(body.data.expiresAt);
    setStatus("autenticado");
  }, []);

  // El logout va al servidor: revocar la sesión es la única forma de que el
  // token deje de servir. Borrarla solo del navegador dejaría la sesión viva.
  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // Si el logout de red falla, la cookie local se limpia igual: peor que un
      // token vivo es una interfaz que sigue mostrando sesión cerrada.
    }

    setUser(null);
    setExpiresAt(null);
    setStatus("anonimo");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, expiresAt, login, logout }),
    [status, user, expiresAt, login, logout],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}

      {status === "verificando" && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-white/80 backdrop-blur-sm"
          role="status"
          aria-label="Verificando usuario"
        >
          <Loader2 className="size-6 animate-spin text-slate-500" aria-hidden="true" />
          <p className="text-sm text-slate-600">Verificando usuario…</p>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthGate>.");
  return ctx;
}