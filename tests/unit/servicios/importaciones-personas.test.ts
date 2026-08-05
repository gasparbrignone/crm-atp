import { describe, it, expect, vi, beforeEach } from "vitest";

// procesarImportacionPersonasCsv() — PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md
// sección 3.4 (P2, severidad alta): hasta esta etapa, esta era la única de
// las 3 vías de entrada de Personas que NO usaba el Motor de Resolución de
// Identidad completo (solo comparaba DNI exacto). Este test protege que,
// tras el fix, una fila que matchea por nombre difuso (sin DNI, o con DNI
// distinto) se reporte como fila con error/duplicado en vez de crear una
// ficha duplicada silenciosa — y que una fila sin ningún candidato parecido
// sí se cree con normalidad.

const resolverOCrearPersonaMock = vi.fn();
vi.mock("@/lib/servicios/personas.service", () => ({
  resolverOCrearPersona: (...args: unknown[]) => resolverOCrearPersonaMock(...args),
}));

// La importación calcula el umbral una sola vez antes del loop (auditoría
// 2026-08-04, ver INFORME-CIERRE-SESION-2026-08-04.md) — se mockea acá para
// no depender de configuracionSistema en el prisma mockeado de este archivo.
const obtenerUmbralConfianzaDuplicadosMock = vi.fn();
vi.mock("@/lib/ia/deteccion-duplicados", () => ({
  obtenerUmbralConfianzaDuplicados: () => obtenerUmbralConfianzaDuplicadosMock(),
}));

// Mismo criterio que el umbral — se mockea para no depender de
// LexicoNombrePropio en el prisma mockeado de este archivo (ver
// PROPUESTA-REDISENO-DESDE-CERO-MATCHING-2026-08-05.md sección 6).
vi.mock("@/lib/servicios/lexico-identidad.service", () => ({
  obtenerCatalogoLexicoIdentidad: () =>
    Promise.resolve({ nombresCompuestos: [], particulasApellido: [] }),
}));

const resolverCarreraSemanticaMock = vi.fn();
vi.mock("@/lib/ia/normalizacion", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ia/normalizacion")>();
  return {
    ...real,
    resolverCarreraSemantica: (...args: unknown[]) => resolverCarreraSemanticaMock(...args),
  };
});

const importJobCreateMock = vi.fn();
const importJobUpdateMock = vi.fn();
const importJobErrorCreateMock = vi.fn();
const carreraFindManyMock = vi.fn();
const personaFindFirstMock = vi.fn();

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    importJob: { create: (...a: unknown[]) => importJobCreateMock(...a), update: (...a: unknown[]) => importJobUpdateMock(...a) },
    importJobError: { create: (...a: unknown[]) => importJobErrorCreateMock(...a) },
    carrera: { findMany: (...a: unknown[]) => carreraFindManyMock(...a) },
    persona: { findFirst: (...a: unknown[]) => personaFindFirstMock(...a) },
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  }),
}));

const registrarCambioMock = vi.fn();
vi.mock("@/lib/servicios/auditoria.service", () => ({
  registrarCambio: (...a: unknown[]) => registrarCambioMock(...a),
}));

const notificarImportacionFinalizadaMock = vi.fn();
vi.mock("@/lib/servicios/notificaciones.service", () => ({
  notificarImportacionFinalizada: (...a: unknown[]) => notificarImportacionFinalizadaMock(...a),
}));

const { procesarImportacionPersonasCsv } = await import("@/lib/servicios/importaciones.service");

function csvDeUnaFila(nombre: string, apellido: string) {
  return `nombre,apellido\n${nombre},${apellido}\n`;
}

describe("procesarImportacionPersonasCsv — duplicados vía Motor de Identidad completo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    carreraFindManyMock.mockResolvedValue([]);
    importJobCreateMock.mockResolvedValue({ id: "job-1" });
    importJobUpdateMock.mockResolvedValue({ id: "job-1", estado: "completado" });
    obtenerUmbralConfianzaDuplicadosMock.mockResolvedValue(0.65);
  });

  it("fila que matchea por nombre difuso (sin DNI) se reporta como duplicado, NO crea una Persona nueva", async () => {
    resolverOCrearPersonaMock.mockResolvedValue({
      tipo: "vinculada",
      personaId: "persona-existente",
      confianza: 0.9,
      motivo: "apellido y nombre coinciden",
    });

    await procesarImportacionPersonasCsv({
      usuarioId: "u1",
      nombreArchivo: "test.csv",
      contenidoCsv: csvDeUnaFila("Juan", "Perez"),
      mapeo: { nombre: "nombre", apellido: "apellido" },
    });

    expect(importJobErrorCreateMock).toHaveBeenCalledTimes(1);
    const mensaje = importJobErrorCreateMock.mock.calls[0][0].data.mensajeError;
    expect(mensaje).toContain("Ya existe una persona parecida");
    const dataFinal = importJobUpdateMock.mock.calls[0][0].data;
    expect(dataFinal.filasExitosas).toBe(0);
    expect(dataFinal.duplicadosDetectados).toBe(1);
  });

  it("fila ambigua (candidatos de baja confianza) se reporta para revisión manual, NO crea ni vincula sola", async () => {
    resolverOCrearPersonaMock.mockResolvedValue({
      tipo: "ambiguo",
      motivo: "Coincidencia de baja confianza",
      candidatos: [{ id: "c1", nombre: "Juan", apellido: "Perez", telefono: null }],
    });

    await procesarImportacionPersonasCsv({
      usuarioId: "u1",
      nombreArchivo: "test.csv",
      contenidoCsv: csvDeUnaFila("Juan", "Peres"),
      mapeo: { nombre: "nombre", apellido: "apellido" },
    });

    expect(importJobErrorCreateMock).toHaveBeenCalledTimes(1);
    const dataFinal = importJobUpdateMock.mock.calls[0][0].data;
    expect(dataFinal.filasExitosas).toBe(0);
    expect(dataFinal.filasConError).toBe(1);
  });

  it("fila sin ningún candidato parecido se crea con normalidad (alta nueva segura)", async () => {
    resolverOCrearPersonaMock.mockResolvedValue({ tipo: "creada", personaId: "persona-nueva" });

    await procesarImportacionPersonasCsv({
      usuarioId: "u1",
      nombreArchivo: "test.csv",
      contenidoCsv: csvDeUnaFila("Maria", "Gonzalez"),
      mapeo: { nombre: "nombre", apellido: "apellido" },
    });

    expect(importJobErrorCreateMock).not.toHaveBeenCalled();
    const dataFinal = importJobUpdateMock.mock.calls[0][0].data;
    expect(dataFinal.filasExitosas).toBe(1);
    expect(dataFinal.estado).toBe("completado");
  });

  it("pasa origen 'importacion_csv' y el umbral precalculado a resolverOCrearPersona", async () => {
    resolverOCrearPersonaMock.mockResolvedValue({ tipo: "creada", personaId: "x" });

    await procesarImportacionPersonasCsv({
      usuarioId: "u1",
      nombreArchivo: "test.csv",
      contenidoCsv: csvDeUnaFila("Ana", "Lopez"),
      mapeo: { nombre: "nombre", apellido: "apellido" },
    });

    expect(resolverOCrearPersonaMock).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      "importacion_csv",
      0.65,
      expect.anything(),
    );
  });

  it("calcula el umbral una sola vez para todo el archivo, no una vez por fila", async () => {
    resolverOCrearPersonaMock.mockResolvedValue({ tipo: "creada", personaId: "x" });

    const csv = `nombre,apellido\nJuan,Perez\nMaria,Gonzalez\nAna,Lopez\n`;
    await procesarImportacionPersonasCsv({
      usuarioId: "u1",
      nombreArchivo: "test.csv",
      contenidoCsv: csv,
      mapeo: { nombre: "nombre", apellido: "apellido" },
    });

    expect(obtenerUmbralConfianzaDuplicadosMock).toHaveBeenCalledTimes(1);
    expect(resolverOCrearPersonaMock).toHaveBeenCalledTimes(3);
  });

  it("DNI repetido dentro del mismo archivo se detecta antes de consultar el motor (mensaje específico)", async () => {
    resolverOCrearPersonaMock.mockResolvedValue({ tipo: "creada", personaId: "x" });

    const csv = `nombre,apellido,dni\nJuan,Perez,30111222\nJuan,Perez,30111222\n`;
    await procesarImportacionPersonasCsv({
      usuarioId: "u1",
      nombreArchivo: "test.csv",
      contenidoCsv: csv,
      mapeo: { nombre: "nombre", apellido: "apellido", dni: "dni" },
    });

    expect(resolverOCrearPersonaMock).toHaveBeenCalledTimes(1);
    expect(importJobErrorCreateMock).toHaveBeenCalledTimes(1);
    expect(importJobErrorCreateMock.mock.calls[0][0].data.mensajeError).toContain(
      "DNI duplicado dentro del mismo archivo",
    );
  });

  it("si resolverOCrearPersona falla inesperadamente, la fila se reporta como error y la importación sigue (no se cae el for)", async () => {
    resolverOCrearPersonaMock
      .mockRejectedValueOnce(new Error("falla simulada"))
      .mockResolvedValueOnce({ tipo: "creada", personaId: "y" });

    const csv = `nombre,apellido\nJuan,Perez\nMaria,Gonzalez\n`;
    await procesarImportacionPersonasCsv({
      usuarioId: "u1",
      nombreArchivo: "test.csv",
      contenidoCsv: csv,
      mapeo: { nombre: "nombre", apellido: "apellido" },
    });

    const dataFinal = importJobUpdateMock.mock.calls[0][0].data;
    expect(dataFinal.filasExitosas).toBe(1);
    expect(dataFinal.filasConError).toBe(1);
    expect(dataFinal.estado).toBe("completado_con_errores");
  });
});
