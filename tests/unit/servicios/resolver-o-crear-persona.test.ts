import { describe, it, expect, vi, beforeEach } from "vitest";

// resolverOCrearPersona() — PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md sección
// 3.4 (P2): punto de entrada único que ahora usa importaciones.service.ts en
// vez de comparar solo DNI. Este test protege el contrato de las 3 vías de
// salida (creada / vinculada / ambiguo) contra una futura regresión que
// vuelva a desconectar algún caller del motor de identidad completo.

const buscarPersonaCoincidenteMock = vi.fn();
const obtenerUmbralConfianzaDuplicadosMock = vi.fn();
const registrarCambioMock = vi.fn();
const revincularPersonaNuevaConPadronesPendientesMock = vi.fn();

vi.mock("@/lib/ia/deteccion-duplicados", () => ({
  buscarPersonaCoincidente: (...args: unknown[]) => buscarPersonaCoincidenteMock(...args),
  obtenerUmbralConfianzaDuplicados: () => obtenerUmbralConfianzaDuplicadosMock(),
}));

vi.mock("@/lib/servicios/auditoria.service", () => ({
  registrarCambio: (...args: unknown[]) => registrarCambioMock(...args),
}));

vi.mock("@/lib/servicios/padron.service", () => ({
  revincularPersonaNuevaConPadronesPendientes: (...args: unknown[]) =>
    revincularPersonaNuevaConPadronesPendientesMock(...args),
}));

vi.mock("@/lib/servicios/configuracion.service", () => ({
  crearValorCatalogo: vi.fn(),
}));

vi.mock("@/lib/servicios/lexico-identidad.service", () => ({
  obtenerCatalogoLexicoIdentidad: () =>
    Promise.resolve({ nombresCompuestos: [], particulasApellido: [] }),
}));

const personaCreateMock = vi.fn();
const personaFindFirstMock = vi.fn();

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ persona: { create: personaCreateMock } }),
    persona: { findFirst: personaFindFirstMock },
  },
}));

const { resolverOCrearPersona } = await import("@/lib/servicios/personas.service");

const DATOS_BASE = {
  nombre: "Juan",
  apellido: "Perez",
  dni: undefined,
  legajo: undefined,
  carreraId: undefined,
  anio: undefined,
  telefono: undefined,
  email: undefined,
  instagram: undefined,
  observacionesGenerales: undefined,
};

describe("resolverOCrearPersona — contrato de las 3 vías", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obtenerUmbralConfianzaDuplicadosMock.mockResolvedValue(0.65);
    personaFindFirstMock.mockResolvedValue(null);
  });

  it("tipo 'coincidencia' del motor → se reporta como 'vinculada', nunca crea una Persona nueva", async () => {
    buscarPersonaCoincidenteMock.mockResolvedValue({
      tipo: "coincidencia",
      personaId: "persona-existente-1",
      confianza: 0.9,
      motivo: "DNI idéntico",
    });

    const resultado = await resolverOCrearPersona(DATOS_BASE, "usuario-1", "importacion_csv");

    expect(resultado).toEqual({
      tipo: "vinculada",
      personaId: "persona-existente-1",
      confianza: 0.9,
      motivo: "DNI idéntico",
    });
    expect(personaCreateMock).not.toHaveBeenCalled();
  });

  it("tipo 'ambiguo' del motor → se propaga tal cual, nunca crea ni vincula sola", async () => {
    const candidatos = [{ id: "c1", nombre: "Juan", apellido: "Perez", telefono: null }];
    buscarPersonaCoincidenteMock.mockResolvedValue({
      tipo: "ambiguo",
      motivo: "Coincidencia de baja confianza (55%): apellido coincide",
      candidatos,
    });

    const resultado = await resolverOCrearPersona(DATOS_BASE, "usuario-1", "importacion_csv");

    expect(resultado.tipo).toBe("ambiguo");
    if (resultado.tipo === "ambiguo") {
      expect(resultado.candidatos).toEqual(candidatos);
    }
    expect(personaCreateMock).not.toHaveBeenCalled();
  });

  it("tipo 'sin_candidatos' del motor → crea una Persona nueva con el origen pasado", async () => {
    buscarPersonaCoincidenteMock.mockResolvedValue({ tipo: "sin_candidatos" });
    personaCreateMock.mockResolvedValue({ id: "persona-nueva-1", dni: null });

    const resultado = await resolverOCrearPersona(DATOS_BASE, "usuario-1", "importacion_csv");

    expect(resultado).toEqual({ tipo: "creada", personaId: "persona-nueva-1" });
    expect(personaCreateMock).toHaveBeenCalledTimes(1);
    const dataCreada = personaCreateMock.mock.calls[0][0].data;
    expect(dataCreada.nombre).toBe("Juan");
    expect(dataCreada.apellido).toBe("Perez");
  });

  it("pasa el umbral configurado (no un valor fijo) a buscarPersonaCoincidente", async () => {
    obtenerUmbralConfianzaDuplicadosMock.mockResolvedValue(0.8);
    buscarPersonaCoincidenteMock.mockResolvedValue({ tipo: "sin_candidatos" });
    personaCreateMock.mockResolvedValue({ id: "x", dni: null });

    await resolverOCrearPersona(DATOS_BASE, "usuario-1", "alta_manual");

    expect(buscarPersonaCoincidenteMock).toHaveBeenCalledWith(expect.anything(), 0.8, expect.anything());
  });
});
