import { describe, it, expect, vi, beforeEach } from "vitest";

// persona-token.service.ts — PROPUESTA-REDISENO-DESDE-CERO-MATCHING-2026-08-05.md
// sección 4: índice invertido que reemplaza el blocking por trigram de campo
// completo. Se mockea solo la capa de acceso a datos — la tokenización real
// (lib/identidad/normalizar.ts) queda real y determinista.

const queryRawMock = vi.fn();
const deleteManyMock = vi.fn();
const createManyMock = vi.fn();

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    $queryRaw: (...a: unknown[]) => queryRawMock(...a),
    personaToken: {
      deleteMany: (...a: unknown[]) => deleteManyMock(...a),
      createMany: (...a: unknown[]) => createManyMock(...a),
    },
  },
}));

const { sincronizarTokensPersona, buscarPersonaIdsPorTokens } = await import(
  "@/lib/servicios/persona-token.service"
);

describe("sincronizarTokensPersona", () => {
  beforeEach(() => vi.clearAllMocks());

  it("borra los tokens previos y crea uno por unidad léxica de nombre y apellido", async () => {
    const clienteFake = { personaToken: { deleteMany: deleteManyMock, createMany: createManyMock } };
    await sincronizarTokensPersona(
      clienteFake as never,
      "persona-1",
      "Juan Ignacio",
      "Perez",
      { nombresCompuestos: [], particulasApellido: [] },
    );

    expect(deleteManyMock).toHaveBeenCalledWith({ where: { personaId: "persona-1" } });
    expect(createManyMock).toHaveBeenCalledWith({
      data: [
        { personaId: "persona-1", token: "juan", esApellido: false },
        { personaId: "persona-1", token: "ignacio", esApellido: false },
        { personaId: "persona-1", token: "perez", esApellido: true },
      ],
    });
  });

  it("no llama a createMany si no hay tokens (campos vacíos)", async () => {
    const clienteFake = { personaToken: { deleteMany: deleteManyMock, createMany: createManyMock } };
    await sincronizarTokensPersona(clienteFake as never, "persona-2", "", "", {
      nombresCompuestos: [],
      particulasApellido: [],
    });

    expect(deleteManyMock).toHaveBeenCalled();
    expect(createManyMock).not.toHaveBeenCalled();
  });
});

describe("buscarPersonaIdsPorTokens", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sin tokens válidos, no consulta la base", async () => {
    const ids = await buscarPersonaIdsPorTokens([], true);
    expect(ids).toEqual([]);
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("une resultados exactos y difusos sin duplicar personaId", async () => {
    queryRawMock
      .mockResolvedValueOnce([{ personaId: "p1" }]) // exacto
      .mockResolvedValueOnce([{ personaId: "p1" }, { personaId: "p2" }]); // fuzzy del único token >=3 chars

    const ids = await buscarPersonaIdsPorTokens(["perez"], true);

    expect(ids.sort()).toEqual(["p1", "p2"]);
  });

  it("no hace la pasada difusa para tokens de menos de 3 caracteres", async () => {
    queryRawMock.mockResolvedValueOnce([{ personaId: "p1" }]); // solo la consulta exacta

    const ids = await buscarPersonaIdsPorTokens(["yo"], true);

    expect(ids).toEqual(["p1"]);
    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });
});
