import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "CRM ATP",
  description:
    "CRM inteligente de ATP — Agrupación estudiantil, Facultad de Ciencias Médicas (UNR)",
};

// Aplica el tema guardado por el usuario antes del primer render, para evitar
// parpadeo (FOUC) entre el tema por defecto del sistema y la preferencia guardada.
// Ver /19-ux-ui.md sección 10 — el modo oscuro es preferencia de usuario, no solo detección de SO.
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("tema");
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${montserrat.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
