import { describe, it, expect, vi, beforeEach } from "vitest";

// fusionarPersonas() — bug real encontrado en la auditoría 2026-08-04
// (INFORME-CIERRE-SESION-2026-08-04.md): re-vinculaba Participacion,
// PunteoPersona, PadronEntrada e HistorialCambio de la ficha descartada a la
// definitiva (RN-2, /04-modelo-datos.md sección 18), pero NO PersonaEtiqueta
// — recién alcanzable de verdad ahora que existe una UI real de etiquetado.
// Este test protege que las etiquetas de la descartada terminen en la
// definitiva tras la fusión, sin duplicar si ya la tenía.

const registrarCambioMock = vi.fn();
vi.mock("@/lib/servicios/auditoria.service", () => ({
  registrarCambio: (...a: unknown[]) => registrarCambioMock(...a),
}));

vi.mock("@/lib/servicios/veredictos-identidad.service", () => ({
  registrarVeredictoIdentidad: vi.fn(),
}));

const personaFindUniqueOrThrowMock = vi.fn();
const personaEtiquetaFindManyMock = vi.fn();
const personaEtiquetaDeleteMock = vi.fn();
const personaEtiquetaUpdateMock = vi.fn();

function txStub() {
  return {
    persona: { update: vi.fn() },
    personaTelefono: { update: vi.fn() },
    personaEmail: { update: vi.fn() },
    participacion: { findMany: vi.fn().mockResolvedValue([]) },
    punteoPersona: { findMany: vi.fn().mockResolvedValue([]) },
    padronEntrada: { updateMany: vi.fn() },
    historialCambio: { updateMany: vi.fn() },
    personaEtiqueta: {
      findMany: (...a: unknown[]) => personaEtiquetaFindManyMock(...a),
      delete: (...a: unknown[]) => personaEtiquetaDeleteMock(...a),
      update: (...a: unknown[]) => personaEtiquetaUpdateMock(...a),
    },
  };
}

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    persona: {
      findUniqueOrThrow: (...a: unknown[]) => personaFindUniqueOrThrowMock(...a),
    },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(txStub()),
  },
}));

const { fusionarPersonas } = await import("@/lib/servicios/personas.service");

const DEFINITIVA = {
  id: "def1",
  nombre: "Juan",
  apellido: "Perez",
  estadoFicha: "activa",
  telefonos: [],
  emails: [],
};
const DESCARTADA = {
  id: "desc1",
  nombre: "Juan",
  apellido: "Peres",
  estadoFicha: "activa",
  telefonos: [],
  emails: [],
};

describe("fusionarPersonas — re-vinculación de etiquetas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    personaFindUniqueOrThrowMock
      .mockResolvedValueOnce(DEFINITIVA)
      .mockResolvedValueOnce(DESCARTADA)
      .mockResolvedValue({ id: "def1" }); // findUniqueOrThrow final de retorno
  });

  it("re-vincula a la definitiva una etiqueta que la descartada tenía y la definitiva no", async () => {
    personaEtiquetaFindManyMock
      .mockResolvedValueOnce([{ id: "pe-desc-1", etiquetaId: "e1" }]) // etiquetas de la descartada
      .mockResolvedValueOnce([]); // etiquetas ya en la definitiva

    await fusionarPersonas({
      personaDefinitivaId: "def1",
      personaDescartadaId: "desc1",
      camposElegidos: {},
      usuarioId: "u1",
    });

    expect(personaEtiquetaUpdateMock).toHaveBeenCalledWith({
      where: { id: "pe-desc-1" },
      data: { personaId: "def1" },
    });
    expect(personaEtiquetaDeleteMock).not.toHaveBeenCalled();
  });

  it("descarta el duplicado (no re-vincula) si la definitiva ya tenía esa etiqueta", async () => {
    personaEtiquetaFindManyMock
      .mockResolvedValueOnce([{ id: "pe-desc-1", etiquetaId: "e1" }]) // etiquetas de la descartada
      .mockResolvedValueOnce([{ etiquetaId: "e1" }]); // la definitiva ya tiene "e1"

    await fusionarPersonas({
      personaDefinitivaId: "def1",
      personaDescartadaId: "desc1",
      camposElegidos: {},
      usuarioId: "u1",
    });

    expect(personaEtiquetaDeleteMock).toHaveBeenCalledWith({ where: { id: "pe-desc-1" } });
    expect(personaEtiquetaUpdateMock).not.toHaveBeenCalled();
  });

  it("sin etiquetas en la descartada, no hace ninguna operación de PersonaEtiqueta", async () => {
    personaEtiquetaFindManyMock
      .mockResolvedValueOnce([]) // sin etiquetas en la descartada
      .mockResolvedValueOnce([]);

    await fusionarPersonas({
      personaDefinitivaId: "def1",
      personaDescartadaId: "desc1",
      camposElegidos: {},
      usuarioId: "u1",
    });

    expect(personaEtiquetaUpdateMock).not.toHaveBeenCalled();
    expect(personaEtiquetaDeleteMock).not.toHaveBeenCalled();
  });
});
