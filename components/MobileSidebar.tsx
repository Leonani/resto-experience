"use client";

import Image from "next/image";
import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * Drawer móvil/tablet: barra superior con el botón de menú hamburguesa que
 * abre la sidebar que en escritorio es fija. El contenido (Server Component)
 * se recibe por `children` desde `page.tsx`.
 */
export function MobileSidebar({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Barra superior en tablet/móvil (el aside fijo está oculto ahí) */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <span className="flex items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg">
            <Image
              src="/logo-resto.png"
              alt="Logo Resto Experience"
              width={32}
              height={32}
            />
          </span>
          <span className="text-sm font-semibold text-slate-900">
            Resto Experience
          </span>
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          data-testid="menu-hamburguesa"
        >
          <Menu className="size-5" aria-hidden="true" />
        </Button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menú de navegación"
          data-testid="menu-movil"
        >
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-semibold text-slate-900">
                Menú
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
              >
                <X className="size-5" aria-hidden="true" />
              </Button>
            </div>
            <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
              {children}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}