import { describe, it, expect } from "vitest";
import { evaluarPoda, podarCandidatos } from "@/lib/identidad/poda";

// Etapa de candidate pruning — PROPUESTA-REDISENO-DESDE-CERO-MATCHING-2026-08-05.md.
// Casos reales que motivaron la etapa (reportados por Gaspar 2026-08-05):
// candidatos que el blocking por trigram de campo completo dejaba pasar sin
// evidencia real. Deliberadamente permisiva por pedido explícito — los
// tests de "debe sobrevivir" son tan importantes como los de "debe
// eliminarse", para no volver a caer en un ajuste demasiado conservador.

describe("evaluarPoda — casos reales reportados", () => {
  it('elimina "Abella Irene" vs "Dorado Antonella" (falso positivo real del blocking por trigram)', () => {
    const r = evaluarPoda("Abella Irene", "Dorado Antonella");
    expect(r.sobrevive).toBe(false);
  });

  it('mantiene vivo "Abril Nicolás" vs "Abril Soto" (comparten el token "abril" — el scoring, no la poda, decide qué hacer con eso)', () => {
    const r = evaluarPoda("Abril Nicolás", "Abril Soto");
    expect(r.sobrevive).toBe(true);
    expect(r.motivo).toContain("abril");
  });
});

describe("evaluarPoda — debe seguir siendo permisiva con variantes de tipeo genuinas", () => {
  it('mantiene vivo "Ana Fernandez" vs "Ana Hernandez" (apellido a 1 edición de distancia — el veto de "nunca auto sin exacto" sigue viviendo en el scoring)', () => {
    const r = evaluarPoda("Ana Fernandez", "Ana Hernandez");
    expect(r.sobrevive).toBe(true);
  });

  it('mantiene vivo "Juan Gonzalez" vs "Juan Gonzales" (typo real de 1 caracter)', () => {
    const r = evaluarPoda("Juan Gonzalez", "Juan Gonzales");
    expect(r.sobrevive).toBe(true);
  });

  it("mantiene vivo un apellido raro compartido exacto, aunque el nombre de pila no tenga relación", () => {
    const r = evaluarPoda("Melani Chazarreta", "Iara Chazarreta");
    expect(r.sobrevive).toBe(true);
  });

  it("mantiene vivo cuando comparten nombre y apellido materno pero no el paterno (token fuerte compartido)", () => {
    const r = evaluarPoda("Juan Perez Garcia", "Juan Lopez Garcia");
    expect(r.sobrevive).toBe(true);
  });
});

describe("evaluarPoda — elimina solo lo genuinamente sin evidencia", () => {
  it("elimina dos nombres completamente distintos sin ningún token ni apellido parecido", () => {
    const r = evaluarPoda("Martina Sol Ferreyra", "Bruno Santiago Ortiz");
    expect(r.sobrevive).toBe(false);
  });

  it("elimina apellidos genuinamente distintos sin nombre de pila en común", () => {
    const r = evaluarPoda("Diego Torres", "Federico Nunez");
    expect(r.sobrevive).toBe(false);
  });
});

describe("evaluarPoda — extensión para blocking multi-estrategia (todavía sin uso real)", () => {
  it("sobrevive si se marca como encontrado por más de una estrategia, aunque no comparta ningún token", () => {
    const r = evaluarPoda("Martina Sol Ferreyra", "Bruno Santiago Ortiz", {
      encontradoPorMasDeUnaEstrategia: true,
    });
    expect(r.sobrevive).toBe(true);
  });
});

describe("evaluarPoda — casos extremos, nunca debe romperse", () => {
  it("nunca tira excepción con entradas adversariales", () => {
    const casos: [string, string][] = [
      ["", ""],
      [" ", "Juan Perez"],
      [",", ",,,"],
      ["😀", "Juan Perez"],
      ["a".repeat(5000), "Juan Perez"],
    ];
    for (const [a, b] of casos) {
      expect(() => evaluarPoda(a, b)).not.toThrow();
    }
  });
});

describe("podarCandidatos", () => {
  it("preserva el orden y filtra solo los que no sobreviven", () => {
    const candidatos = [
      { id: "1", nombreCompleto: "Abril Soto" },
      { id: "2", nombreCompleto: "Dorado Antonella" },
      { id: "3", nombreCompleto: "Abril Fernandez" },
    ];
    const resultado = podarCandidatos("Abril Nicolas", candidatos);
    expect(resultado.map((c) => c.id)).toEqual(["1", "3"]);
  });
});
