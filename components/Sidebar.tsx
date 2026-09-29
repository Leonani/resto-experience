import { SidebarNav } from "@/components/sidebar-nav";

/**
 * Sidebar fija de escritorio. Server Component sin estado: envuelve al
 * contenido compartido (`SidebarNav`) en su caja sticky. En tablet/móvil se
 * oculta (`hidden lg:flex`) porque ahí la navegación vive en el drawer
 * `MobileSidebar`.
 */
export function Sidebar({ restaurantName }: { restaurantName?: string }) {
  return (
    <aside className="hidden shrink-0 lg:flex" aria-label="Navegación del panel">
      <div className="sticky top-0 flex h-screen w-64 flex-col border-r border-slate-200 bg-white px-4 py-6">
        <SidebarNav restaurantName={restaurantName} />
      </div>
    </aside>
  );
}