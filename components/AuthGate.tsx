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
 *   - `verificando`: spinner "Verificando usuario…" mientras se valida el token
 *     contra `/api/auth/verify`.
 *   - `anonimo`: dashboard en modo lectura; `SessionMenu` muestra "Iniciar sesión".
 *   - `autenticado`: escrituras habilitadas; `SessionMenu` muestra la pastilla.
 *
 * El token vive en `localStorage` (`reviews_reply_token`). No está en una
 * cookie a propósito: `REVIEWS_REPLY_TOKEN` no lleva `NEXT_PUBLIC_`, así que el
 * servidor nunca expone el token de respuesta en el HTML.
 */

const TOKEN_KEY = "reviews_reply_token";

type AuthStatus = "verificando" | "anonimo" | "autenticado";

type AuthContextValue = {
  status: AuthStatus;
  user: string | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("verificando");
  const [user, setUser] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    // El setState va diferido un tick a propósito: primero se pinta el overlay
    // "Verificando usuario…" y después se resuelve la sesión, sin setState
    // síncrono dentro del efecto.
    const id = window.setTimeout(async () => {
      const saved = window.localStorage.getItem(TOKEN_KEY);

      if (!saved) {
        if (active) setStatus("anonimo");
        return;
      }

      try {
        const res = await fetch("/api/auth/verify", {
          headers: { Authorization: `Bearer ${saved}` },
        });
        const body = (await res.json()) as ApiResponse<VerifyResult>;

        if (!active) return;

        if (res.ok && body.success === "ok" && body.data) {
          setToken(saved);
          setUser(body.data.user);
          setStatus("autenticado");
        } else {
          // Token inválido o expirado: se descarta y se queda en modo lectura.
          window.localStorage.removeItem(TOKEN_KEY);
          setStatus("anonimo");
        }
      } catch {
        if (!active) return;
        window.localStorage.removeItem(TOKEN_KEY);
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const body = (await res.json()) as ApiResponse<LoginResult>;

    if (!res.ok || body.success !== "ok" || !body.data) {
      throw new Error(body.message || "No se pudo iniciar sesión.");
    }

    window.localStorage.setItem(TOKEN_KEY, body.data.token);
    setToken(body.data.token);
    setUser(body.data.user);
    setStatus("autenticado");
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setStatus("anonimo");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, token, login, logout }),
    [status, user, token, login, logout],
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