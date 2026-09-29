import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bandeja de Reseñas",
  description:
    "Gestión diaria de reseñas por sede: promedios reales, respuestas y borradores.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#f8f6f3]">{children}</body>
    </html>
  );
}
