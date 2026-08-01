import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Desvío deliberado de /19-ux-ui.md sección 3 (que especifica Montserrat):
// Gaspar pidió cambiarla por sentirse "tight" para UI densa de web — Inter es
// el estándar de facto en SaaS moderno (Linear, Vercel, GitHub) y se lee mejor
// en pantallas a tamaños chicos. Actualizar el doc si se confirma en forma
// definitiva.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CRM ATP",
  description:
    "CRM inteligente de ATP — Agrupación estudiantil, Facultad de Ciencias Médicas (UNR)",
};

// OJO: definir `viewport` acá REEMPLAZA por completo los valores por defecto
// de Next.js (incluido width/initialScale) — hay que repetirlos a mano, si no
// el mobile pierde el escalado correcto y todo se ve "cortado"/de tamaño
// incorrecto. colorScheme refuerza el `color-scheme` de globals.css para que
// el navegador no aplique su propio oscurecimiento heurístico sobre
// elementos sueltos de la página.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
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
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
