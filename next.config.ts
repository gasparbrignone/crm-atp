import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
