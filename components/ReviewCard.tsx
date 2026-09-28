"use client";

import { Check, Loader2, Sparkles, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  formatRelativeDate,
  Stars,
  toneClasses,
  toneForRating,
  type ReviewWithLocation,
} from "@/components/star-rating";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { isResponded } from "@/lib/types/review";
import type { ApiResponse, DraftResult, SaveReplyResult } from "@/lib/types/api";

/**
 * Tarjeta de una reseña.
 *
 * Estados: pendiente, respondida, o con borrador sin guardar (RN-06).
 * El borrador vive en el estado de este componente y NUNCA se persiste solo:
 * solo llega a `reply_text` cuando el usuario confirma.
 */
export function ReviewCard({ review }: { review: ReviewWithLocation }) {
  const router = useRouter();

  const respondida = isResponded(review);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(review.reply_text ?? "");
  const [borrador, setBorrador] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const tone = toneForRating(review.rating);
  const classes = toneClasses(tone);

  async function generarBorrador() {
    setGenerando(true);
    setError(null);
    setAiError(null);
    setFallback(false);

    try {
      const res = await fetch("/api/generate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: review.id }),
      });

      const body = (await res.json()) as ApiResponse<DraftResult>;

      if (body.success === "ok" && body.data) {
        setFallback(body.data.fromFallback);
        setAiError(body.data.aiError);
        setBorrador(body.data.text);
        setTexto(body.data.text);
        setEditando(true);
      } else {
        setError(body.message);
      }
    } catch {
      setError("No se pudo generar el borrador. Revisá la conexión.");
    } finally {
      setGenerando(false);
    }
  }

  async function guardar() {
    if (texto.trim().length === 0) {
      setError("La respuesta no puede estar vacía.");
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      const res = await fetch("/api/save-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: review.id, replyText: texto }),
      });

      const body = (await res.json()) as ApiResponse<SaveReplyResult>;

      if (body.success === "ok") {
        setBorrador(null);
        setGuardado(true);
        setTimeout(() => setGuardado(false), 2500);
        // Revalidar para que el % del bento y los contadores se actualicen.
        router.refresh();
      } else {
        setError(body.message);
      }
    } catch {
      setError("No se pudo guardar la respuesta. Revisá la conexión.");
    } finally {
      setGuardando(false);
    }
  }

  function descartarBorrador() {
    setBorrador(null);
    setTexto(review.reply_text ?? "");
    setEditando(false);
    setAiError(null);
    setFallback(false);
  }

  return (
    <Card
      className={`gap-0 border-slate-200 py-5 shadow-sm ${respondida && !editando ? "opacity-75" : ""}`}
      data-testid={`review-${review.id}`}
    >
      <CardContent className="flex flex-col gap-4">
        {/* Encabezado: autor, sede, fecha, estrellas */}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900">{review.author}</span>
              {respondida ? (
                <Badge
                  variant="secondary"
                  className="bg-emerald-50 text-emerald-700 border-emerald-200"
                >
                  <Check className="size-3" aria-hidden="true" />
                  Respondida
                </Badge>
              ) : (
                <Badge variant="outline" className="text-slate-500">
                  Pendiente
                </Badge>
              )}
            </div>
            <span className="text-xs text-slate-500">
              {review.restaurantName} · {review.locationName} ·{" "}
              {formatRelativeDate(review.published_at)}
            </span>
          </div>

          <div
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 ${classes.bg} ${classes.border}`}
          >
            <Stars rating={review.rating} />
          </div>
        </header>

        {/* Texto de la reseña. RN-04: vacío es un caso válido, no un bug. */}
        <div
          className={`rounded-lg border-l-2 pl-3 ${classes.border} ${classes.bg}`}
        >
          {review.text.trim().length > 0 ? (
            <p className="text-sm leading-relaxed text-slate-700">{review.text}</p>
          ) : (
            <p className="text-sm text-slate-500 italic">
              {/* RN-04: sin comentario es un caso válido, no un bug de carga. */}
              Sin comentario: el cliente no interfirió con la calificación
            </p>
          )}
        </div>

        {/* Respuesta o borrador */}
        {respondida && !editando && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
            <p className="mb-1 text-xs font-medium tracking-wide text-emerald-700 uppercase">
              Nuestra respuesta
            </p>
            <p className="text-sm leading-relaxed text-slate-700">
              {review.reply_text}
            </p>
            {review.replied_at && (
              <p className="mt-1.5 text-xs text-slate-400">
                Respondida {formatRelativeDate(review.replied_at)}
              </p>
            )}
          </div>
        )}

        {borrador !== null && (
          <div
            className="rounded-lg border-2 border-dashed border-indigo-600 bg-indigo-50/50 p-3"
            data-testid="borrador-ia"
          >
            <p className="mb-1 text-xs font-medium text-indigo-700">
              {aiError
                ? "Borrador local (la IA falló; revisalo antes de publicar)"
                : fallback
                  ? "Borrador local (sin IA configurada)"
                  : "Borrador generado por IA"}
            </p>
            <p className="text-sm leading-relaxed text-slate-700">{borrador}</p>
          </div>
        )}

        {aiError && (
          <p
            className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700"
            role="alert"
            data-testid="ai-error"
          >
            Fallo borrador IA: {aiError}
          </p>
        )}

        {editando && (
          <Textarea
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setBorrador(null);
              setAiError(null);
              setFallback(false);
            }}
            placeholder="Escribí la respuesta pública para esta reseña…"
            className="min-h-28"
            aria-label={`Respuesta a la reseña de ${review.author}`}
          />
        )}

        {error && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
            {error}
          </p>
        )}

        {guardado && (
          <p className="text-sm text-emerald-600" role="status">
            Respuesta guardada.
          </p>
        )}

        {/* Acciones */}
        <footer className="flex flex-wrap items-center gap-2">
          {!editando ? (
            <>
              {!respondida && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={generarBorrador}
                  disabled={generando}
                >
                  {generando ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="size-4" aria-hidden="true" />
                  )}
                  {generando ? "Generando…" : "Generar borrador"}
                </Button>
              )}

              <Button
                size="sm"
                variant={respondida ? "ghost" : "default"}
                onClick={() => {
                  setTexto(review.reply_text ?? "");
                  setBorrador(null);
                  setAiError(null);
                  setFallback(false);
                  setEditando(true);
                }}
              >
                {respondida ? (
                  <Pencil className="size-4" aria-hidden="true" />
                ) : null}
                {respondida ? "Editar respuesta" : "Responder"}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" onClick={guardar} disabled={guardando}>
                {guardando ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                {guardando ? "Guardando…" : "Guardar"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={descartarBorrador}
                disabled={guardando}
              >
                <X className="size-4" aria-hidden="true" />
                Cancelar
              </Button>
            </>
          )}
        </footer>
      </CardContent>
    </Card>
  );
}
