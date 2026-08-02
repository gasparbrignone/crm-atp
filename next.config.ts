import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (vía pdfjs-dist) usa un paquete nativo (@napi-rs/canvas) que
  // el bundler no puede empaquetar — tiene que quedar como dependencia
  // externa real (require() en runtime) en vez de intentar incluirlo en el
  // bundle, o falla con "DOMMatrix is not defined" en producción (bug real
  // 2026-08-02, ver CLAUDE.md).
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  experimental: {
    // Los PDFs de padrones oficiales (a veces escaneados) pueden pesar bastante
    // más que el límite por defecto de 1MB para Server Actions
    // (/09-modulo-padron-electoral.md sección 4).
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
