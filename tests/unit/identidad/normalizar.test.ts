import { describe, it, expect } from "vitest";
import {
  normalizarTextoIdentidad,
  tokenizarNombrePersona,
  huellaDigital,
} from "@/lib/identidad/normalizar";

describe("normalizarTextoIdentidad", () => {
  it("quita acentos, mayúsculas y puntuación", () => {
    expect(normalizarTextoIdentidad("Pérez, Juan Ignacio")).toBe("perez juan ignacio");
  });
  it("colapsa espacios extra", () => {
    expect(normalizarTextoIdentidad("Juan   Perez")).toBe("juan perez");
  });
});

describe("tokenizarNombrePersona", () => {
  it("detecta formato 'Apellido, Nombre' por la coma", () => {
    const r = tokenizarNombrePersona("Perez, Juan Ignacio");
    expect(r.tokensApellido).toEqual(["perez"]);
    expect(r.tokensNombre).toEqual(["juan", "ignacio"]);
  });
  it("sin coma, asume 'Nombre Apellido' con 2 tokens", () => {
    const r = tokenizarNombrePersona("Juan Perez");
    expect(r.tokensNombre).toEqual(["juan"]);
    expect(r.tokensApellido).toEqual(["perez"]);
  });
  it("sin coma con 4+ tokens, asume apellido compuesto (últimos 2)", () => {
    const r = tokenizarNombrePersona("Juan Ignacio Perez Garcia");
    expect(r.tokensNombre).toEqual(["juan", "ignacio"]);
    expect(r.tokensApellido).toEqual(["perez", "garcia"]);
  });
});

describe("huellaDigital", () => {
  it("es igual sin importar el orden de las palabras", () => {
    expect(huellaDigital("Juan Perez")).toBe(huellaDigital("Perez Juan"));
  });
  it("es igual sin importar mayúsculas/acentos", () => {
    expect(huellaDigital("María José")).toBe(huellaDigital("maria jose"));
  });
  it("distingue conjuntos de palabras distintos", () => {
    expect(huellaDigital("Juan Perez")).not.toBe(huellaDigital("Juan Peres"));
  });
});
