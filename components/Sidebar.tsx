import type { ComponentType, ReactNode } from "react";
import Image from "next/image";
import {
  CalendarClock,
  FileText,
  Megaphone,
  Radio,
  Star,
  Target,
  UtensilsCrossed,
} from "lucide-react";

import { SessionMenu } from "@/components/SessionMenu";

/**
 * Sidebar de navegación del panel. Es una pieza visual del shell: los ítems no
 * son navegables todavía, pero Reviews (la pantalla actual) se marca activo y
 * Reservations lleva la píldora oscura del diseño de referencia para mantener
 * la maqueta reconocible.
 *
 * Server Component: no tiene estado ni interacción.
 */
export function Sidebar({ restaurantName }: { restaurantName?: string }) {
  return (
    <aside className="hidden shrink-0 lg:flex" aria-label="Navegación del panel">
      <div className="sticky top-0 flex h-screen w-64 flex-col border-r border-slate-200 bg-white px-4 py-6">
        {/* Identidad */}
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl">
            <Image
              src="/logo-resto.png"
              alt="Logo Resto Experience"
              width={40}
              height={40}
            />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">A Experience</p>
            <p className="text-xs text-slate-500">Resto Experience</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-6">
          <NavSection title="Marketing">
            <NavItem icon={Radio} label="Social Media" badge="Live" />
            <NavItem icon={Star} label="Reviews" active />
            <NavItem icon={Megaphone} label="Influencers" />
          </NavSection>

          <NavSection title="Operations">
            <NavItem icon={CalendarClock} label="Reservations" highlighted />
            <NavItem icon={UtensilsCrossed} label="Menu" />
          </NavSection>

          <NavSection title="Analytics">
            <NavItem icon={Target} label="Goals" />
            <NavItem icon={FileText} label="Reports" />
          </NavSection>
        </nav>

        {/* Sesión del usuario: login o usuario logueado */}
        <footer className="mt-4 border-t border-slate-100 pt-4">
          <SessionMenu restaurantName={restaurantName} />
        </footer>
      </div>
    </aside>
  );
}

function NavSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

function NavItem({
  icon: Icon,
  label,
  active = false,
  highlighted = false,
  badge,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  highlighted?: boolean;
  badge?: string;
}) {
  const className = active
    ? "bg-zinc-900 text-white shadow-sm"
    : highlighted
      ? "bg-slate-100 text-slate-900"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900";

  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${className}`}
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      {label}
      {badge && (
        <span className="ml-auto rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
          {badge}
        </span>
      )}
    </button>
  );
}