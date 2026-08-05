import { describe, it, expect } from "vitest";
import {
  calcularConfianzaIdentidad,
  calcularConfianzaIdentidadEntreTokenizados,
} from "@/lib/identidad/motor-scoring";

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

  // LIMITACIÓN CONOCIDA, aceptada 2026-08-05 (mismo criterio que la del
  // apellido con guion en tests/unit/identidad/casos-extremos.test.ts):
  // comparando dos strings de TEXTO LIBRE, un nombre base de 2 tokens
  // ("Juan Perez") más un apellido materno agregado sin coma ("Juan Perez
  // Garcia", 3 tokens) cae en la heurística de partición que asume 3
  // tokens = 2 nombres + 1 apellido — el apellido real ("Perez") queda
  // reabsorbido como si fuera un segundo nombre de pila. Esto YA estaba en
  // el motor antes de esta sesión; lo que cambió es que la nueva compuerta
  // (compuerta_apellido_sin_evidencia, ver motor-scoring.ts) ya no lo
  // enmascara comparando contra el conjunto completo del otro lado — se
  // dejó de enmascarar a propósito, porque esa misma técnica de
  // enmascarar es la que causaba el bug real de producción 2026-08-05
  // (candidatos sin relación real de apellido pasando como revisión
  // manual). En la práctica esto no afecta a los dos callers reales
  // (deteccion-duplicados.ts y matching-padron.ts): ambos evitan esta
  // heurística pasando la partición YA CONOCIDA del candidato (siempre) y
  // de la consulta (cuando viene de un formulario estructurado) — ver
  // tokenizarPersonaEstructurada() en normalizar.ts. Este test fija el
  // comportamiento actual de la función de TEXTO LIBRE pura, no el de los
  // callers reales.
  it("apellido materno agregado SIN estructura conocida (texto libre puro) va a descarte, no a revisión — limitación aceptada, ver comentario", () => {
    const r = calcularConfianzaIdentidad("Juan Perez", "Juan Perez Garcia");
    expect(r.confianza).toBeLessThan(0.4);
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

  // Segunda vuelta de esta compuerta (ver comentario extenso en
  // motor-scoring.ts): la primera versión comparaba apellido contra el
  // CONJUNTO COMPLETO del otro lado para tolerar este caso (apellido
  // materno agregado en texto libre sin coma) — pero esa misma técnica
  // dejaba pasar el bug real de producción (un candidato cuyo nombre de
  // pila coincide con el apellido de la consulta parecía tener evidencia
  // real). Con la comparación directa apellido-contra-apellido, este caso
  // puntual de texto libre puro SÍ activa la compuerta (ver el test
  // "apellido materno agregado..." más arriba, LIMITACIÓN CONOCIDA) — pero
  // cuando el candidato viene con nombre/apellido estructurado (el caso
  // real siempre en producción, ver tokenizarPersonaEstructurada()), la
  // partición nunca se equivoca y este test SÍ pasa.
  it("con partición ESTRUCTURADA del candidato (caso real), el apellido materno de más no dispara la compuerta", () => {
    const a = { textoCompleto: "candela cejas", tokens: ["candela", "cejas"], tokensNombre: ["candela"], tokensApellido: ["cejas"] };
    const b = { textoCompleto: "candela cejas fernandez", tokens: ["candela", "cejas", "fernandez"], tokensNombre: ["candela"], tokensApellido: ["cejas", "fernandez"] };
    const r = calcularConfianzaIdentidadEntreTokenizados(a, b);
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
