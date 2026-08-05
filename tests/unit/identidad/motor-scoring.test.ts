import { describe, it, expect } from "vitest";
import { calcularConfianzaIdentidad } from "@/lib/identidad/motor-scoring";

// Regresión de bugs reales — /INFORME-AUDITORIA-EXTERNA.md sección 5.6 y
// /REVISION-CRITICA-AUDITORIA-2026-08-04.md sección 1.2. Estos casos
// vincularon automáticamente en producción a personas distintas porque la
// IA daba una confianza numérica inestable (60% una vez, 85% otra, para la
// misma comparación) — el propósito de este archivo es que una futura
// sesión no pueda reintroducir esa clase de bug sin que un test falle acá.
describe("calcularConfianzaIdentidad — regresión de bugs reales de producción", () => {
  const UMBRAL_AUTO_VINCULACION_CONFIGURADO = 0.65; // ver prisma/seed.ts

  const casosMismoApellidoPersonaDistinta: [string, string][] = [
    ["Cejas, Candela", "Cejas, Damaris"],
    ["Cejas, Candela", "Cejas, Agustina"],
    ["Cejas, Damaris", "Cejas, Agustina"],
    ["Barroso, Constanza", "cindy barroso"],
    ["Chazarreta, Melani Belen", "iara chazarreta"],
  ];

  it.each(casosMismoApellidoPersonaDistinta)(
    "NUNCA supera el umbral de auto-vinculación: %s vs %s",
    (a, b) => {
      const resultado = calcularConfianzaIdentidad(a, b);
      expect(resultado.confianza).toBeLessThan(UMBRAL_AUTO_VINCULACION_CONFIGURADO);
    },
  );

  it("la explicación menciona la compuerta cuando se activa", () => {
    const resultado = calcularConfianzaIdentidad("Barroso, Constanza", "cindy barroso");
    expect(resultado.explicacion.some((e) => e.includes("no tiene relación") || e.includes("no comparte"))).toBe(
      true,
    );
  });
});

describe("calcularConfianzaIdentidad — casos positivos (misma persona)", () => {
  it("nombre idéntico da confianza máxima", () => {
    expect(calcularConfianzaIdentidad("Juan Perez", "Juan Perez").confianza).toBeCloseTo(1, 9);
  });

  it("orden Apellido, Nombre vs Nombre Apellido no afecta la confianza", () => {
    const r = calcularConfianzaIdentidad("Perez, Juan Ignacio", "Juan Ignacio Perez");
    expect(r.confianza).toBeGreaterThan(0.9);
  });

  it("tolera inicial en vez de nombre completo", () => {
    const r = calcularConfianzaIdentidad("Juan Ignacio Perez", "Juan I. Perez");
    expect(r.confianza).toBeGreaterThan(0.65);
  });

  it("tolera un apellido materno de más en un lado", () => {
    const r = calcularConfianzaIdentidad("Juan Perez", "Juan Perez Garcia");
    expect(r.confianza).toBeGreaterThan(0.6);
  });

  it("un typo de apellido de 1 caracter es indistinguible de un apellido distinto parecido — va a revisión manual, no auto-vinculación (ambigüedad real, ver compartenApellidoExacto)", () => {
    const r = calcularConfianzaIdentidad("Maria Gonzalez", "Maria Gonzales");
    expect(r.confianza).toBeGreaterThan(0.4);
    expect(r.confianza).toBeLessThan(0.65);
  });

  it("tolera espacios extra y mayúsculas", () => {
    const r = calcularConfianzaIdentidad("juan   perez", "JUAN PEREZ");
    expect(r.confianza).toBeCloseTo(1, 9);
  });
});

describe("calcularConfianzaIdentidad — compuerta_apellido_sin_evidencia (caso real reportado 2026-08-05)", () => {
  // PROPUESTA-REDISENO-DESDE-CERO-MATCHING-2026-08-05.md sección 2: un
  // nombre de pila compartido (baja distintividad) no puede empujar solo la
  // confianza hasta la banda de revisión manual si el apellido no tiene
  // ninguna relación real — el apellido es el requisito de entrada, no una
  // señal más que suma. "Abril Nicolás" vs "Abril Soto" es el caso real que
  // motivó esta compuerta (quedaba en revisión con ~57-60% de confianza
  // antes de esta compuerta, puro ruido para el operador).
  it('"Abril Nicolas" vs "Abril Soto" queda por debajo del piso de revisión (descarte), no en revisión', () => {
    const r = calcularConfianzaIdentidad("Abril Nicolas", "Abril Soto");
    expect(r.confianza).toBeLessThan(0.4);
    expect(r.explicacion.some((e) => e.includes("no tiene ninguna relación real"))).toBe(true);
  });

  it("no dispara para variantes de tipeo reales de apellido (Fernandez/Hernandez sigue en revisión, no cae a descarte)", () => {
    const r = calcularConfianzaIdentidad("Ana Fernandez", "Ana Hernandez");
    expect(r.confianza).toBeGreaterThanOrEqual(0.4);
  });

  it("no dispara cuando el apellido real coincide exacto pero la heurística de partición lo mueve por un token extra (apellido materno de más)", () => {
    // "Candela Cejas" (3 tokens con el materno) vs 4 tokens con "Fernandez"
    // de más — la partición heurística reasigna qué tokens son apellido,
    // pero "Cejas" sigue estando literalmente en el conjunto completo del
    // otro lado, así que esta compuerta no debe activarse (a diferencia de
    // comparar apellido-contra-apellido directo, que si rompía este caso —
    // ver comentario in-line en motor-scoring.ts).
    const r = calcularConfianzaIdentidad("Candela Cejas", "Candela Cejas Fernandez");
    expect(r.explicacion.some((e) => e.includes("no tiene ninguna relación real"))).toBe(false);
    expect(r.confianza).toBeGreaterThan(0.4);
  });
});

describe("calcularConfianzaIdentidad — casos negativos (personas distintas)", () => {
  it("nombres sin ninguna relación dan confianza por debajo del piso de revisión manual (CONFIANZA_MINIMA_PARA_REVISION en matching-padron.ts)", () => {
    const r = calcularConfianzaIdentidad("Juan Perez", "Maria Rodriguez");
    expect(r.confianza).toBeLessThan(0.4);
  });

  it("apellidos parecidos pero distintos (sin apellido idéntico) no llegan a auto-vinculación", () => {
    const r = calcularConfianzaIdentidad("Ana Fernandez", "Ana Hernandez");
    expect(r.confianza).toBeLessThan(0.65);
  });
});
