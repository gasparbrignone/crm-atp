import { describe, it, expect } from "vitest";
import { tokenizarNombrePersona, type CatalogoLexicoIdentidad } from "@/lib/identidad/normalizar";

// Fusión léxica configurable — PROPUESTA-REDISENO-DESDE-CERO-MATCHING-2026-08-05.md
// sección 6. Sin catálogo (el default, `CATALOGO_LEXICO_VACIO`), el
// comportamiento tiene que ser IDÉNTICO al de antes (ver normalizar.test.ts)
// — estos tests solo cubren lo que cambia cuando SÍ se pasa un catálogo
// explícito, que es como lo usarán los callers reales (a través de
// lib/servicios/lexico-identidad.service.ts).

const CATALOGO: CatalogoLexicoIdentidad = {
  nombresCompuestos: [
    ["juan", "jose"],
    ["maria", "belen"],
  ],
  particulasApellido: [
    ["de", "la"],
    ["del"],
    ["di"],
    ["mc"],
  ],
};

describe("tokenizarNombrePersona — sin catálogo (comportamiento previo, sin cambios)", () => {
  // El caso real que rompe SIN catálogo no es el de 3 tokens (ese ya lo
  // resuelve bien la heurística posicional: 2 nombre + 1 apellido) — es
  // cuando el nombre compuesto suma 4+ tokens junto con un apellido de una
  // sola palabra: la heurística "4+ tokens → últimos 2 son apellido" se come
  // el segundo nombre de pila como si fuera parte del apellido.
  it('sin catálogo, "Juan Jose Ignacio Perez" (4 tokens, apellido real de 1 sola palabra) parte mal: "Ignacio" cae en el apellido', () => {
    const r = tokenizarNombrePersona("Juan Jose Ignacio Perez");
    expect(r.tokensNombre).toEqual(["juan", "jose"]);
    expect(r.tokensApellido).toEqual(["ignacio", "perez"]);
  });

  it('en cambio, con solo 3 tokens la heurística posicional ya funciona bien sin catálogo ("Maria Jose Gonzalez")', () => {
    const r = tokenizarNombrePersona("Maria Jose Gonzalez");
    expect(r.tokensNombre).toEqual(["maria", "jose"]);
    expect(r.tokensApellido).toEqual(["gonzalez"]);
  });
});

describe("tokenizarNombrePersona — con catálogo de nombres compuestos", () => {
  it('"Juan Jose Ignacio Perez" corrige la partición: fusiona "Juan Jose" y deja "Ignacio" en el nombre, "Perez" solo en el apellido', () => {
    const r = tokenizarNombrePersona("Juan Jose Ignacio Perez", CATALOGO);
    expect(r.tokensNombre).toEqual(["juan jose", "ignacio"]);
    expect(r.tokensApellido).toEqual(["perez"]);
  });

  it('"Maria Belen Rodriguez" mantiene "Maria Belen" junto', () => {
    const r = tokenizarNombrePersona("Maria Belen Rodriguez", CATALOGO);
    expect(r.tokensNombre).toEqual(["maria belen"]);
    expect(r.tokensApellido).toEqual(["rodriguez"]);
  });

  it("nombre compuesto no catalogado no se fusiona (comportamiento previo se mantiene para lo no cubierto)", () => {
    const r = tokenizarNombrePersona("Juan Cruz Fernandez", CATALOGO);
    expect(r.tokensNombre).toEqual(["juan", "cruz"]);
    expect(r.tokensApellido).toEqual(["fernandez"]);
  });
});

describe("tokenizarNombrePersona — con catálogo de partículas de apellido", () => {
  it('"Maria de la Cruz" mantiene "de la Cruz" como una unidad de apellido', () => {
    const r = tokenizarNombrePersona("Maria de la Cruz", CATALOGO);
    expect(r.tokensNombre).toEqual(["maria"]);
    expect(r.tokensApellido).toEqual(["de la cruz"]);
  });

  it('"Roberto del Valle" mantiene "del Valle" junto', () => {
    const r = tokenizarNombrePersona("Roberto del Valle", CATALOGO);
    expect(r.tokensNombre).toEqual(["roberto"]);
    expect(r.tokensApellido).toEqual(["del valle"]);
  });

  it('"Franco Di Santo" mantiene "Di Santo" junto', () => {
    const r = tokenizarNombrePersona("Franco Di Santo", CATALOGO);
    expect(r.tokensNombre).toEqual(["franco"]);
    expect(r.tokensApellido).toEqual(["di santo"]);
  });

  it('"Patricia Mc Donald" mantiene "Mc Donald" junto', () => {
    const r = tokenizarNombrePersona("Patricia Mc Donald", CATALOGO);
    expect(r.tokensNombre).toEqual(["patricia"]);
    expect(r.tokensApellido).toEqual(["mc donald"]);
  });

  it("una partícula sin nada detrás no se fusiona sola (al final del texto)", () => {
    const r = tokenizarNombrePersona("Roberto Del", CATALOGO);
    expect(r.tokensApellido).toEqual(["del"]);
  });

  it("con coma explícita, también aplica el catálogo de partículas del lado del apellido", () => {
    const r = tokenizarNombrePersona("del Valle, Roberto Carlos", CATALOGO);
    expect(r.tokensApellido).toEqual(["del valle"]);
    expect(r.tokensNombre).toEqual(["roberto", "carlos"]);
  });
});

describe("tokenizarNombrePersona — catálogo vacío o sin coincidencias, nunca rompe", () => {
  it("catálogo con secuencias que no aparecen en el texto no cambia nada", () => {
    const r = tokenizarNombrePersona("Ana Paula Fernandez", CATALOGO);
    expect(r.tokensNombre).toEqual(["ana", "paula"]);
    expect(r.tokensApellido).toEqual(["fernandez"]);
  });

  it("nunca tira excepción con entradas adversariales aunque haya catálogo", () => {
    const casos = ["", " ", ",", "de", "del del del", "mc mc mc mc"];
    for (const caso of casos) {
      expect(() => tokenizarNombrePersona(caso, CATALOGO)).not.toThrow();
    }
  });
});
