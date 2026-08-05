import { describe, it, expect, vi, beforeEach } from "vitest";

// registrarVeredictoIdentidad() — PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md
// sección 3.9. No usa el motor de scoring mockeado (calcularConfianzaIdentidad
// queda real, pura y determinista) — solo se mockea la escritura a DB.

const veredictoCreateMock = vi.fn();
vi.mock("@/lib/prisma/client", () => ({
  prisma: { veredictoIdentidad: { create: (...a: unknown[]) => veredictoCreateMock(...a) } },
}));

const { registrarVeredictoIdentidad } = await import(
  "@/lib/servicios/veredictos-identidad.service"
);

describe("registrarVeredictoIdentidad", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recalcula la confianza real (no depende de un valor pasado por el caller) y la persiste", async () => {
    await registrarVeredictoIdentidad({
      nombreObjetivo: "Juan Perez",
      candidatoNombreCompleto: "Juan Ignacio Perez",
      candidatoId: "c1",
      decision: "misma_persona",
      contexto: "alta_manual",
      usuarioId: "u1",
    });

    expect(veredictoCreateMock).toHaveBeenCalledTimes(1);
    const data = veredictoCreateMock.mock.calls[0][0].data;
    expect(data.candidatoId).toBe("c1");
    expect(data.decision).toBe("misma_persona");
    expect(data.contexto).toBe("alta_manual");
    expect(data.usuarioId).toBe("u1");
    expect(data.confianza).toBeGreaterThan(0.5); // "Juan Perez" vs "Juan Ignacio Perez", debería ser alta
    expect(typeof data.explicacion).toBe("string");
    expect(data.explicacion.length).toBeGreaterThan(0);
  });

  it("un veredicto 'distinta_persona' sobre un par de baja confianza real (bug histórico Cejas) queda con confianza baja registrada", async () => {
    await registrarVeredictoIdentidad({
      nombreObjetivo: "Cejas, Candela",
      candidatoNombreCompleto: "Cejas, Damaris",
      candidatoId: "c2",
      decision: "distinta_persona",
      contexto: "padron",
      usuarioId: null,
    });

    const data = veredictoCreateMock.mock.calls[0][0].data;
    expect(Number(data.confianza)).toBeLessThan(0.65);
    expect(data.usuarioId).toBeNull();
  });
});
