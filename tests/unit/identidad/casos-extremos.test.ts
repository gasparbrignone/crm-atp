import { describe, it, expect } from "vitest";
import { calcularConfianzaIdentidad } from "@/lib/identidad/motor-scoring";
import { tokenizarNombrePersona, huellaDigital, normalizarTextoIdentidad } from "@/lib/identidad/normalizar";

// Auditoría 2026-08-04 — intento deliberado de romper el motor de identidad
// con entradas extremas/adversariales (no casos de uso normales, que ya
// cubren algoritmos.test.ts/motor-scoring.test.ts/normalizar.test.ts).
// Objetivo: que nunca tire una excepción y que la confianza se mantenga
// siempre en el rango [0, 1] — un motor que decide si dos personas son la
// misma no puede romperse ante datos reales sucios (import de CSV con
// columnas mal mapeadas, copy-paste con basura, etc.).

function esConfianzaValida(confianza: number) {
  expect(confianza).toBeGreaterThanOrEqual(0);
  expect(confianza).toBeLessThanOrEqual(1);
  expect(Number.isFinite(confianza)).toBe(true);
}

describe("calcularConfianzaIdentidad — casos extremos, nunca debe romperse", () => {
  it("strings vacíos en ambos lados", () => {
    const r = calcularConfianzaIdentidad("", "");
    esConfianzaValida(r.confianza);
  });

  it("un lado vacío, el otro con nombre real", () => {
    const r = calcularConfianzaIdentidad("", "Juan Perez");
    esConfianzaValida(r.confianza);
    expect(r.confianza).toBeLessThan(0.5);
  });

  it("solo espacios en blanco", () => {
    const r = calcularConfianzaIdentidad("   ", "\t\n  ");
    esConfianzaValida(r.confianza);
  });

  it("solo una coma, sin nombre ni apellido", () => {
    const r = calcularConfianzaIdentidad(",", ",,,");
    esConfianzaValida(r.confianza);
  });

  it("solo un carácter cada uno", () => {
    const r = calcularConfianzaIdentidad("A", "B");
    esConfianzaValida(r.confianza);
  });

  it("nombre extremadamente largo (posible pegado accidental de un párrafo entero)", () => {
    const parrafo = "Juan Perez ".repeat(500).trim();
    const r = calcularConfianzaIdentidad(parrafo, "Juan Perez");
    esConfianzaValida(r.confianza);
  });

  it("solo números (posible columna mal mapeada, ej. DNI en el campo nombre)", () => {
    const r = calcularConfianzaIdentidad("12345678", "87654321");
    esConfianzaValida(r.confianza);
  });

  it("caracteres especiales, emojis y símbolos", () => {
    const r = calcularConfianzaIdentidad("Juan 😀 Pérez!!!", "Juan Pérez ###");
    esConfianzaValida(r.confianza);
    // Los emojis/símbolos se filtran en la normalización — el nombre real
    // sigue siendo comparable y debería seguir dando alta confianza.
    expect(r.confianza).toBeGreaterThan(0.6);
  });

  it("intento de inyección SQL en el nombre (defensa en profundidad — igual nunca se concatena a SQL acá, pero no debe romper el parsing)", () => {
    const r = calcularConfianzaIdentidad("Juan'; DROP TABLE Persona; --", "Juan Perez");
    esConfianzaValida(r.confianza);
  });

  it("múltiples comas consecutivas y desordenadas", () => {
    const r = calcularConfianzaIdentidad("Perez,,, Juan,,,", "Juan Perez");
    esConfianzaValida(r.confianza);
  });

  it("nombre con muchísimos tokens (posible dirección completa pegada por error)", () => {
    const r = calcularConfianzaIdentidad(
      "Juan Perez Av Siempreviva 742 Piso 3 Depto B Rosario Santa Fe Argentina",
      "Juan Perez",
    );
    esConfianzaValida(r.confianza);
  });

  it("mismo nombre repetido muchas veces en un solo lado", () => {
    const r = calcularConfianzaIdentidad("Juan Juan Juan Perez", "Juan Perez");
    esConfianzaValida(r.confianza);
  });

  it("caracteres de otros alfabetos (cirílico, chino, árabe) sin romper", () => {
    const r = calcularConfianzaIdentidad("Иван Петров", "王 伟");
    esConfianzaValida(r.confianza);
  });

  // LIMITACIÓN REAL ENCONTRADA en la auditoría 2026-08-04 (documentada, no
  // corregida sin la aprobación de Gaspar — ver INFORME-CIERRE-SESION-2026-08-04.md):
  // normalizarTextoIdentidad() conserva el guion como parte del token
  // ("garcia-lopez" queda como UN token), así que un apellido compuesto
  // escrito con guion en un lado y con espacio en el otro ("Garcia-Lopez" vs
  // "Garcia Lopez" — la MISMA persona, solo un formato de escritura distinto,
  // caso real y común en apellidos españoles/franceses) no cumple
  // compartenApellidoExacto() y la compuerta topea la confianza en 0.6 —
  // queda en revisión manual en vez de acercarse a una coincidencia casi
  // perfecta como debería. Cambiar esto requiere tocar la tokenización del
  // motor ya calibrado contra el benchmark (lib/identidad/BENCHMARK-RESULTADOS.md)
  // y volver a correrlo — no es un fix aislado, por eso no se tocó en esta
  // auditoría. Este test fija el comportamiento ACTUAL (con la limitación),
  // no el deseado, para que quede documentado en el código, no solo en un
  // informe.
  it("apellido compuesto con guion NO se reconoce como equivalente al mismo apellido con espacio (limitación conocida, sin corregir)", () => {
    const r = calcularConfianzaIdentidad("Maria Jose Garcia-Lopez", "Maria Jose Garcia Lopez");
    esConfianzaValida(r.confianza);
    expect(r.confianza).toBe(0.6); // debería ser >0.9 — ver comentario arriba
  });

  it("nombres invertidos con inicial y apellido compuesto materno+paterno", () => {
    const r = calcularConfianzaIdentidad("Garcia Lopez, M. Jose", "Maria Jose Garcia Lopez");
    esConfianzaValida(r.confianza);
  });

  it("homónimos exactos reales (mismo nombre y apellido, personas distintas) — el motor no puede saber que son distintas sin más datos, da confianza máxima como se espera", () => {
    const r = calcularConfianzaIdentidad("Juan Perez", "Juan Perez");
    esConfianzaValida(r.confianza);
    // toBeCloseTo, no toBe: la suma de las 4 señales (0.42+0.3+0.2+0.08) da
    // 0.9999999999999999 en punto flotante, no exactamente 1 — esperable,
    // no es un bug del motor.
    expect(r.confianza).toBeCloseTo(1, 9);
  });

  it("null/undefined no deberían llegar nunca (TypeScript los previene), pero un string vacío no debe tirar excepción", () => {
    expect(() => calcularConfianzaIdentidad("", "")).not.toThrow();
  });

  it("nombre con solo la partícula, sin apellido real", () => {
    const r = calcularConfianzaIdentidad("de la Cruz", "de la Cruz Fernandez");
    esConfianzaValida(r.confianza);
  });

  it("un lado es literalmente el mismo string muy largo repetido", () => {
    const largo = "x".repeat(10000);
    const r = calcularConfianzaIdentidad(largo, largo);
    esConfianzaValida(r.confianza);
  });
});

describe("tokenizarNombrePersona — casos extremos", () => {
  it("nunca tira excepción con entradas adversariales", () => {
    const casos = ["", " ", ",", ",,,,", "a", "1234", "😀🎉", "Juan,", ",Perez", "a,b,c,d,e"];
    for (const caso of casos) {
      expect(() => tokenizarNombrePersona(caso)).not.toThrow();
    }
  });

  it("con coma y parte después vacía, no rompe (ej. 'Perez,')", () => {
    const r = tokenizarNombrePersona("Perez,");
    expect(r.tokensApellido).toEqual(["perez"]);
    expect(r.tokensNombre).toEqual([]);
  });
});

describe("huellaDigital / normalizarTextoIdentidad — casos extremos", () => {
  it("nunca tira excepción con entradas adversariales", () => {
    const casos = ["", " ", "😀", "a".repeat(5000), "\n\t\r"];
    for (const caso of casos) {
      expect(() => huellaDigital(caso)).not.toThrow();
      expect(() => normalizarTextoIdentidad(caso)).not.toThrow();
    }
  });

  it("huella de string vacío es string vacío, no rompe la comparación", () => {
    expect(huellaDigital("")).toBe("");
    expect(huellaDigital("   ")).toBe("");
  });
});
