import { describe, it, expect, vi, beforeEach } from "vitest";

// buscarPersonaCoincidente() — protege el fix de PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md
// sección 3.6 (P4): antes, una coincidencia de confianza casi nula (candidato
// con apellido remotamente parecido pero sin ninguna relación real) se
// reportaba igual como "ambiguo" (sugerencia de posible duplicado mostrada al
// usuario). Con la política centralizada, por debajo del piso de 0.4 debe
// tratarse como "sin_candidatos" (alta nueva segura, sin fricción). No se
// mockea el motor de scoring (motor-scoring.ts/algoritmos.ts/normalizar.ts
// quedan reales y deterministas) — solo la capa de acceso a datos.

const queryRawMock = vi.fn();
const personaFindManyMock = vi.fn();
const personaFindFirstMock = vi.fn();
const personaTelefonoFindManyMock = vi.fn();
const configuracionSistemaFindUniqueMock = vi.fn();

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    $queryRaw: (...a: unknown[]) => queryRawMock(...a),
    persona: {
      findFirst: (...a: unknown[]) => personaFindFirstMock(...a),
      findMany: (...a: unknown[]) => personaFindManyMock(...a),
    },
    personaTelefono: { findMany: (...a: unknown[]) => personaTelefonoFindManyMock(...a) },
    configuracionSistema: { findUnique: (...a: unknown[]) => configuracionSistemaFindUniqueMock(...a) },
  },
}));

const { buscarPersonaCoincidente } = await import("@/lib/ia/deteccion-duplicados");

const UMBRAL = 0.65;

describe("buscarPersonaCoincidente — piso de confianza (P4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    personaFindFirstMock.mockResolvedValue(null); // sin match de DNI
    personaTelefonoFindManyMock.mockResolvedValue([]); // sin match de teléfono
  });

  it("candidato con confianza por debajo del piso (0.4) → 'sin_candidatos', no 'ambiguo'", async () => {
    // "Juan Perez" vs "Maria Rodriguez": ningún token en común, confianza ~0.
    queryRawMock.mockResolvedValue([{ personaId: "candidato-lejano" }]);
    personaFindManyMock.mockResolvedValue([
      { id: "candidato-lejano", nombre: "Maria", apellido: "Rodriguez", telefonos: [], emails: [] },
    ]);

    const resultado = await buscarPersonaCoincidente(
      { nombre: "Juan", apellido: "Perez" },
      UMBRAL,
    );

    expect(resultado.tipo).toBe("sin_candidatos");
  });

  it("candidato en banda de revisión (piso ≤ confianza < umbral) → 'ambiguo'", async () => {
    // Mismo apellido exacto, nombre de pila distinto: la compuerta topea a
    // 0.6, que cae en la banda de revisión para un umbral de 0.65 — mismo
    // caso que el bug histórico de Cejas, nunca debe auto-vincular ni
    // descartarse silencioso.
    queryRawMock.mockResolvedValue([{ personaId: "candidato-mismo-apellido" }]);
    personaFindManyMock.mockResolvedValue([
      { id: "candidato-mismo-apellido", nombre: "Damaris", apellido: "Cejas", telefonos: [], emails: [] },
    ]);

    const resultado = await buscarPersonaCoincidente(
      { nombre: "Candela", apellido: "Cejas" },
      UMBRAL,
    );

    expect(resultado.tipo).toBe("ambiguo");
  });

  it("candidato con confianza igual o por encima del umbral → 'coincidencia'", async () => {
    queryRawMock.mockResolvedValue([{ personaId: "candidato-igual" }]);
    personaFindManyMock.mockResolvedValue([
      { id: "candidato-igual", nombre: "Juan", apellido: "Perez", telefonos: [], emails: [] },
    ]);

    const resultado = await buscarPersonaCoincidente(
      { nombre: "Juan", apellido: "Perez" },
      UMBRAL,
    );

    expect(resultado.tipo).toBe("coincidencia");
  });

  it("sin ningún candidato de blocking → 'sin_candidatos'", async () => {
    queryRawMock.mockResolvedValue([]);

    const resultado = await buscarPersonaCoincidente(
      { nombre: "Juan", apellido: "Perez" },
      UMBRAL,
    );

    expect(resultado.tipo).toBe("sin_candidatos");
    expect(personaFindManyMock).not.toHaveBeenCalled();
  });
});
