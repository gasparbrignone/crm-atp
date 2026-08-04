import { defineConfig } from "vitest/config";
import path from "node:path";

// Suite de unit tests — arranca acotada (ver /REVISION-CRITICA-AUDITORIA-2026-08-04.md
// sección 7: no toda la app, solo lógica pura y las reglas de negocio que ya
// causaron bugs de regresión reales). tests/unit por ahora; tests/integration
// y tests/e2e quedan para cuando la superficie de UI deje de cambiar tan
// rápido (Fase 12+).
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
