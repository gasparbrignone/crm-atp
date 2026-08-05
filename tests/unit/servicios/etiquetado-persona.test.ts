import { describe, it, expect, vi, beforeEach } from "vitest";

// Etiquetado de Personas — /05-modulo-personas.md sección 7. Backend
// completado en esta sesión, UI cableada encima (alta manual, ficha,
// listado). Protege: idempotencia (asignar/quitar dos veces no rompe ni
// duplica), reactivación de una etiqueta desactivada al reusar su nombre, y
// el conteo correcto de la acción masiva.

const registrarCambioMock = vi.fn();
vi.mock("@/lib/servicios/auditoria.service", () => ({
  registrarCambio: (...a: unknown[]) => registrarCambioMock(...a),
}));

const crearValorCatalogoMock = vi.fn();
vi.mock("@/lib/servicios/configuracion.service", () => ({
  crearValorCatalogo: (...a: unknown[]) => crearValorCatalogoMock(...a),
}));

const personaEtiquetaFindUniqueMock = vi.fn();
const personaEtiquetaCreateMock = vi.fn();
const personaEtiquetaCreateManyMock = vi.fn();
const personaEtiquetaFindManyMock = vi.fn();
const personaEtiquetaDeleteMock = vi.fn();
const etiquetaFindFirstMock = vi.fn();
const etiquetaFindUniqueOrThrowMock = vi.fn();
const etiquetaUpdateMock = vi.fn();

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    personaEtiqueta: {
      findUnique: (...a: unknown[]) => personaEtiquetaFindUniqueMock(...a),
      findMany: (...a: unknown[]) => personaEtiquetaFindManyMock(...a),
      create: (...a: unknown[]) => personaEtiquetaCreateMock(...a),
      createMany: (...a: unknown[]) => personaEtiquetaCreateManyMock(...a),
      delete: (...a: unknown[]) => personaEtiquetaDeleteMock(...a),
    },
    etiqueta: {
      findFirst: (...a: unknown[]) => etiquetaFindFirstMock(...a),
      findUniqueOrThrow: (...a: unknown[]) => etiquetaFindUniqueOrThrowMock(...a),
      update: (...a: unknown[]) => etiquetaUpdateMock(...a),
    },
  },
}));

const {
  agregarEtiquetaAPersona,
  quitarEtiquetaDePersona,
  asignarEtiquetaMasivo,
  obtenerOCrearEtiquetaPorNombre,
} = await import("@/lib/servicios/personas.service");

describe("etiquetado de Personas", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("agregarEtiquetaAPersona", () => {
    it("crea la asignación y registra el cambio si no existía", async () => {
      personaEtiquetaFindUniqueMock.mockResolvedValue(null);
      personaEtiquetaCreateMock.mockResolvedValue({ id: "pe1" });
      etiquetaFindUniqueOrThrowMock.mockResolvedValue({ id: "e1", nombre: "Voluntario" });

      await agregarEtiquetaAPersona("p1", "e1", "u1");

      expect(personaEtiquetaCreateMock).toHaveBeenCalledTimes(1);
      expect(registrarCambioMock).toHaveBeenCalledTimes(1);
    });

    it("es idempotente: si ya estaba asignada, no crea ni registra de nuevo", async () => {
      personaEtiquetaFindUniqueMock.mockResolvedValue({ id: "pe1" });

      await agregarEtiquetaAPersona("p1", "e1", "u1");

      expect(personaEtiquetaCreateMock).not.toHaveBeenCalled();
      expect(registrarCambioMock).not.toHaveBeenCalled();
    });
  });

  describe("quitarEtiquetaDePersona", () => {
    it("elimina la asignación existente y registra el cambio", async () => {
      personaEtiquetaFindUniqueMock.mockResolvedValue({ id: "pe1" });
      etiquetaFindUniqueOrThrowMock.mockResolvedValue({ id: "e1", nombre: "Voluntario" });

      await quitarEtiquetaDePersona("p1", "e1", "u1");

      expect(personaEtiquetaDeleteMock).toHaveBeenCalledWith({ where: { id: "pe1" } });
      expect(registrarCambioMock).toHaveBeenCalledTimes(1);
    });

    it("no hace nada si la Persona no tenía esa etiqueta", async () => {
      personaEtiquetaFindUniqueMock.mockResolvedValue(null);

      await quitarEtiquetaDePersona("p1", "e1", "u1");

      expect(personaEtiquetaDeleteMock).not.toHaveBeenCalled();
      expect(registrarCambioMock).not.toHaveBeenCalled();
    });
  });

  describe("asignarEtiquetaMasivo", () => {
    beforeEach(() => {
      etiquetaFindUniqueOrThrowMock.mockResolvedValue({ id: "e1", nombre: "Voluntario" });
    });

    it("cuenta solo las asignaciones nuevas, no las que ya existían", async () => {
      personaEtiquetaFindManyMock.mockResolvedValue([{ personaId: "p2" }]); // p2 ya la tenía
      personaEtiquetaCreateManyMock.mockResolvedValue({ count: 1 });

      const resultado = await asignarEtiquetaMasivo(["p1", "p2"], "e1", "u1");

      expect(resultado).toEqual({ total: 2, asignadas: 1 });
      expect(personaEtiquetaCreateManyMock).toHaveBeenCalledWith({
        data: [{ personaId: "p1", etiquetaId: "e1", asignadoPorId: "u1" }],
        skipDuplicates: true,
      });
      expect(registrarCambioMock).toHaveBeenCalledTimes(1);
    });

    it("deduplica personaIds repetidos antes de contar el total", async () => {
      personaEtiquetaFindManyMock.mockResolvedValue([]);
      personaEtiquetaCreateManyMock.mockResolvedValue({ count: 1 });

      const resultado = await asignarEtiquetaMasivo(["p1", "p1", "p1"], "e1", "u1");

      expect(resultado.total).toBe(1);
    });

    it("no consulta ni escribe nada si todas las Personas ya tenían la etiqueta", async () => {
      personaEtiquetaFindManyMock.mockResolvedValue([{ personaId: "p1" }, { personaId: "p2" }]);

      const resultado = await asignarEtiquetaMasivo(["p1", "p2"], "e1", "u1");

      expect(resultado).toEqual({ total: 2, asignadas: 0 });
      expect(personaEtiquetaCreateManyMock).not.toHaveBeenCalled();
      expect(registrarCambioMock).not.toHaveBeenCalled();
    });

    it("busca la Etiqueta una sola vez, sin importar cuántas Personas estén seleccionadas", async () => {
      personaEtiquetaFindManyMock.mockResolvedValue([]);
      personaEtiquetaCreateManyMock.mockResolvedValue({ count: 3 });

      await asignarEtiquetaMasivo(["p1", "p2", "p3"], "e1", "u1");

      expect(etiquetaFindUniqueOrThrowMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("obtenerOCrearEtiquetaPorNombre", () => {
    it("reutiliza una etiqueta existente por nombre, sin distinguir mayúsculas", async () => {
      etiquetaFindFirstMock.mockResolvedValue({ id: "e1", nombre: "Voluntario", activo: true });

      const resultado = await obtenerOCrearEtiquetaPorNombre("VOLUNTARIO", "u1");

      expect(resultado?.id).toBe("e1");
      expect(crearValorCatalogoMock).not.toHaveBeenCalled();
    });

    it("reactiva una etiqueta existente pero desactivada en vez de duplicarla", async () => {
      etiquetaFindFirstMock.mockResolvedValue({ id: "e1", nombre: "Voluntario", activo: false });

      await obtenerOCrearEtiquetaPorNombre("Voluntario", "u1");

      expect(etiquetaUpdateMock).toHaveBeenCalledWith({
        where: { id: "e1" },
        data: { activo: true },
      });
      expect(crearValorCatalogoMock).not.toHaveBeenCalled();
    });

    it("crea una etiqueta nueva si no existe ninguna con ese nombre", async () => {
      etiquetaFindFirstMock.mockResolvedValue(null);
      crearValorCatalogoMock.mockResolvedValue({ id: "e2", nombre: "Nueva" });

      const resultado = await obtenerOCrearEtiquetaPorNombre("Nueva", "u1");

      expect(crearValorCatalogoMock).toHaveBeenCalledWith("etiqueta", { nombre: "Nueva" }, "u1");
      expect(resultado?.id).toBe("e2");
    });

    it("nombre vacío (solo espacios) no crea nada", async () => {
      const resultado = await obtenerOCrearEtiquetaPorNombre("   ", "u1");

      expect(resultado).toBeNull();
      expect(etiquetaFindFirstMock).not.toHaveBeenCalled();
    });
  });
});
