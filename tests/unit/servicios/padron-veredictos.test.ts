import { describe, it, expect, vi, beforeEach } from "vitest";

// vincularEntradaManualmente()/marcarEntradaSinCoincidencia() — protegen que
// la captura de veredictos (PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md
// sección 3.9) esté correctamente cableada: vincular registra "misma_persona"
// sobre la persona elegida; descartar registra "distinta_persona" por CADA
// candidato que se le había sugerido a la entrada.

const registrarVeredictoIdentidadMock = vi.fn();
vi.mock("@/lib/servicios/veredictos-identidad.service", () => ({
  registrarVeredictoIdentidad: (...a: unknown[]) => registrarVeredictoIdentidadMock(...a),
}));

const registrarCambioMock = vi.fn();
vi.mock("@/lib/servicios/auditoria.service", () => ({
  registrarCambio: (...a: unknown[]) => registrarCambioMock(...a),
}));

const padronEntradaFindUniqueOrThrowMock = vi.fn();
const padronEntradaUpdateMock = vi.fn();
const personaFindUniqueMock = vi.fn();

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    padronEntrada: {
      findUniqueOrThrow: (...a: unknown[]) => padronEntradaFindUniqueOrThrowMock(...a),
      update: (...a: unknown[]) => padronEntradaUpdateMock(...a),
    },
    persona: { findUnique: (...a: unknown[]) => personaFindUniqueMock(...a) },
  },
}));

const { vincularEntradaManualmente, marcarEntradaSinCoincidencia } = await import(
  "@/lib/servicios/padron.service"
);

describe("padron.service — captura de veredictos en revisión manual", () => {
  beforeEach(() => vi.clearAllMocks());

  it("vincularEntradaManualmente registra un veredicto 'misma_persona' sobre la persona elegida", async () => {
    padronEntradaFindUniqueOrThrowMock.mockResolvedValue({
      id: "e1",
      nombreCompletoOriginal: "Perez, Juan",
      candidatosSugeridos: null,
    });
    personaFindUniqueMock.mockResolvedValue({ id: "p1", nombre: "Juan", apellido: "Perez" });
    padronEntradaUpdateMock.mockResolvedValue({ id: "e1" });

    await vincularEntradaManualmente("e1", "p1", "u1");

    expect(registrarVeredictoIdentidadMock).toHaveBeenCalledTimes(1);
    const arg = registrarVeredictoIdentidadMock.mock.calls[0][0];
    expect(arg.decision).toBe("misma_persona");
    expect(arg.contexto).toBe("padron");
    expect(arg.candidatoId).toBe("p1");
  });

  it("marcarEntradaSinCoincidencia registra un veredicto 'distinta_persona' por cada candidato sugerido descartado", async () => {
    padronEntradaFindUniqueOrThrowMock.mockResolvedValue({
      id: "e2",
      nombreCompletoOriginal: "Cejas, Candela",
      candidatosSugeridos: JSON.stringify([
        { id: "c1", nombre: "Damaris", apellido: "Cejas" },
        { id: "c2", nombre: "Agustina", apellido: "Cejas" },
      ]),
    });
    padronEntradaUpdateMock.mockResolvedValue({ id: "e2" });

    await marcarEntradaSinCoincidencia("e2", "u1");

    expect(registrarVeredictoIdentidadMock).toHaveBeenCalledTimes(2);
    const decisiones = registrarVeredictoIdentidadMock.mock.calls.map((c) => c[0].decision);
    expect(decisiones).toEqual(["distinta_persona", "distinta_persona"]);
    const candidatoIds = registrarVeredictoIdentidadMock.mock.calls.map((c) => c[0].candidatoId);
    expect(candidatoIds).toEqual(["c1", "c2"]);
  });

  it("marcarEntradaSinCoincidencia sin candidatos previos no registra ningún veredicto", async () => {
    padronEntradaFindUniqueOrThrowMock.mockResolvedValue({
      id: "e3",
      nombreCompletoOriginal: "Alguien Nuevo",
      candidatosSugeridos: null,
    });
    padronEntradaUpdateMock.mockResolvedValue({ id: "e3" });

    await marcarEntradaSinCoincidencia("e3", "u1");

    expect(registrarVeredictoIdentidadMock).not.toHaveBeenCalled();
  });
});
