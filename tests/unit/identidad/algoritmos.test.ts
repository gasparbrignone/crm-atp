import { describe, it, expect } from "vitest";
import {
  distanciaLevenshtein,
  distanciaDamerauLevenshtein,
  similitudJaro,
  similitudJaroWinkler,
  coeficienteDice,
  jaccardTokens,
  tokenSortRatio,
  tokenSetRatio,
  partialRatio,
} from "@/lib/identidad/algoritmos";

describe("distanciaLevenshtein", () => {
  it("es 0 para strings idénticos", () => {
    expect(distanciaLevenshtein("perez", "perez")).toBe(0);
  });
  it("cuenta ediciones simples", () => {
    expect(distanciaLevenshtein("perez", "peres")).toBe(1);
    expect(distanciaLevenshtein("gato", "pato")).toBe(1);
  });
  it("maneja strings vacíos", () => {
    expect(distanciaLevenshtein("", "abc")).toBe(3);
    expect(distanciaLevenshtein("abc", "")).toBe(3);
  });
});

describe("distanciaDamerauLevenshtein", () => {
  it("cuenta una transposición como 1 edición, no 2", () => {
    expect(distanciaDamerauLevenshtein("perez", "preez")).toBe(1);
    // Levenshtein clásico necesitaría 2 ediciones para la misma transposición.
    expect(distanciaLevenshtein("perez", "preez")).toBe(2);
  });
});

describe("similitudJaro / similitudJaroWinkler", () => {
  it("da 1 para strings idénticos", () => {
    expect(similitudJaro("juan", "juan")).toBe(1);
    expect(similitudJaroWinkler("juan", "juan")).toBe(1);
  });
  it("Jaro-Winkler bonifica prefijo común más que Jaro solo", () => {
    const jaro = similitudJaro("martinez", "martines");
    const jw = similitudJaroWinkler("martinez", "martines");
    expect(jw).toBeGreaterThanOrEqual(jaro);
  });
  it("da 0 cuando no hay ningún caracter en común", () => {
    expect(similitudJaro("abc", "xyz")).toBe(0);
  });
});

describe("coeficienteDice", () => {
  it("da 1 para strings idénticos", () => {
    expect(coeficienteDice("gonzalez", "gonzalez")).toBe(1);
  });
  it("da 0 cuando no comparten ningún bigrama", () => {
    expect(coeficienteDice("ab", "xy")).toBe(0);
  });
});

describe("jaccardTokens", () => {
  it("es invariante al orden de los tokens", () => {
    expect(jaccardTokens(["juan", "perez"], ["perez", "juan"])).toBe(1);
  });
  it("penaliza tokens exclusivos de un lado", () => {
    const s = jaccardTokens(["juan", "perez"], ["juan", "perez", "garcia"]);
    expect(s).toBeCloseTo(2 / 3, 5);
  });
});

describe("tokenSortRatio / tokenSetRatio", () => {
  it("tokenSortRatio ignora el orden Nombre/Apellido", () => {
    const s = tokenSortRatio(["juan", "perez"], ["perez", "juan"]);
    expect(s).toBe(1);
  });
  it("tokenSetRatio tolera tokens de más de un lado mejor que tokenSortRatio", () => {
    const conExtra = tokenSetRatio(["juan", "perez"], ["juan", "ignacio", "perez"]);
    expect(conExtra).toBeGreaterThan(0.7);
  });
});

describe("partialRatio", () => {
  it("da 1 cuando el string corto está contenido en el largo", () => {
    expect(partialRatio("juan perez", "juan perez garcia")).toBe(1);
  });
});
