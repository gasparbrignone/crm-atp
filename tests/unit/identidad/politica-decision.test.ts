import { describe, it, expect } from "vitest";
import { clasificarConfianza, PISO_CONFIANZA_REVISION } from "@/lib/identidad/politica-decision";

// PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md sección 3.6 (P4): antes de esta
// función, lib/ia/matching-padron.ts tenía un piso de 0.4 por debajo del cual
// descartaba sin fricción de revisión, y lib/ia/deteccion-duplicados.ts no
// tenía ningún piso equivalente — inconsistencia real de comportamiento
// entre los dos únicos callers del motor de identidad. Este test fija el
// contrato de las 3 bandas para que ambos módulos no puedan volver a
// desincronizarse sin que un test falle acá.
describe("clasificarConfianza", () => {
  const UMBRAL = 0.65;

  it("por debajo del piso (0.4) siempre es 'descarte', sin importar el umbral", () => {
    expect(clasificarConfianza(0, UMBRAL)).toBe("descarte");
    expect(clasificarConfianza(0.05, UMBRAL)).toBe("descarte");
    expect(clasificarConfianza(0.39, UMBRAL)).toBe("descarte");
  });

  it("entre el piso y el umbral configurado es 'revision'", () => {
    expect(clasificarConfianza(0.4, UMBRAL)).toBe("revision");
    expect(clasificarConfianza(0.5, UMBRAL)).toBe("revision");
    expect(clasificarConfianza(0.64, UMBRAL)).toBe("revision");
  });

  it("igual o por encima del umbral configurado es 'auto'", () => {
    expect(clasificarConfianza(0.65, UMBRAL)).toBe("auto");
    expect(clasificarConfianza(0.9, UMBRAL)).toBe("auto");
    expect(clasificarConfianza(1, UMBRAL)).toBe("auto");
  });

  it("el piso es una constante de diseño (0.4), no depende del umbral configurado", () => {
    // Con un umbral configurado más bajo que el piso, la banda de "revision"
    // desaparece — el piso sigue ganando. No debería pasar en la práctica
    // (el umbral configurable vive muy por encima del piso), pero el
    // contrato tiene que sostenerse igual si alguien lo configura mal.
    expect(clasificarConfianza(0.3, 0.35)).toBe("descarte");
    expect(clasificarConfianza(0.4, 0.35)).toBe("auto");
    expect(PISO_CONFIANZA_REVISION).toBe(0.4);
  });
});
