"use client";

import { Loader2, LogOut, Sparkles } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ApiResponse, LoginResult, VerifyResult } from "@/lib/types/api";

/**
 * Sesión de escritura (auth UI).
 *
 * El listado y los filtros son públicos por diseño (se puede pasar la URL a
 * otra persona). Solo contestar exige sesión, así que la pantalla de
 * verificación cubre la interfaz mientras se valida el token guardado y,
 * terminada la verificación, se muestra el dashboard igual en ambos casos.
 *
 * Estados:
 *   - `verificando`: spinner "Verificando usuario…" mientras se valida el token
 *     contra `/api/auth/verify`.
 *   - `anonimo`: dashboard en modo lectura + botón flotante "Iniciar sesión".
 *   - `autenticado`: escrituras habilitadas + pastilla con el usuario y "Salir".
 *
 * El token vive en `localStorage` (`reviews_reply_token`). No está en una
 * cookie a propósito: `REVIEWS_*` no llevan `NEXT_PUBLIC_`, así que el servidor
 * nunca expone el token de respuesta en el HTML.
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
  const [loginOpen, setLoginOpen] = useState(false);

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

      {status === "anonimo" && (
        <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
          <DialogTrigger asChild>
            <Button
              className="fixed right-4 bottom-4 z-40 shadow-lg"
              variant="outline"
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
            <LoginForm
              onSuccess={() => setLoginOpen(false)}
              login={login}
            />
          </DialogContent>
        </Dialog>
      )}

      {status === "autenticado" && (
        <div
          className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-lg"
          data-testid="session-pill"
        >
          <span className="text-sm text-slate-600">Sesión: {user}</span>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="size-4" aria-hidden="true" />
            Salir
          </Button>
        </div>
      )}
    </AuthContext.Provider>
  );
}

function LoginForm({
  login,
  onSuccess,
}: {
  login: (username: string, password: string) => Promise<void>;
  onSuccess: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      await login(username, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-username">Usuario</Label>
        <Input
          id="login-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-password">Contraseña</Label>
        <Input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>

      {error && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={enviando} data-testid="login-submit">
        {enviando ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : null}
        {enviando ? "Iniciando…" : "Iniciar sesión"}
      </Button>
    </form>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthGate>.");
  return ctx;
}