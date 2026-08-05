import { describe, it, expect } from "vitest";
import { parsearLotePadron } from "@/lib/padron/lectura-padron";

// lib/padron/lectura-padron.ts — reemplazo determinístico de la lectura de
// padrón por Gemini, hecho el 2026-08-04 después de que el proyecto de
// Google AI Studio quedara bloqueado ("PERMISSION_DENIED") en medio de una
// carga real de padrón — el tercer incidente real de disponibilidad de un
// proveedor de IA para este módulo. El patrón acá reproduce EXACTAMENTE el
// formato real validado contra el padrón real de Medicina (79 páginas,
// 5356/5356 filas correctas) — las líneas de este archivo son ficticias
// (nombres inventados), nunca datos reales de personas, por diseño: no se
// commitea información personal de terceros al repositorio.

describe("parsearLotePadron — formato real del reporte de padrón", () => {
  it("parsea una fila típica completa (con legajo)", () => {
    const { entradas, lineasNoReconocidas } = parsearLotePadron(
      "1 Gomez, Maria Laura MEDICINA A-5207/8 43742955 A",
    );
    expect(lineasNoReconocidas).toEqual([]);
    expect(entradas).toEqual([
      { dni: "43742955", nombreCompleto: "Gomez, Maria Laura", carrera: "MEDICINA", confianzaExtraccion: 1 },
    ]);
  });

  it("parsea una fila sin legajo asignado (\"-\")", () => {
    const { entradas } = parsearLotePadron("5 Rodriguez, Juan MEDICINA - 47772900 A");
    expect(entradas[0]).toEqual({
      dni: "47772900",
      nombreCompleto: "Rodriguez, Juan",
      carrera: "MEDICINA",
      confianzaExtraccion: 1,
    });
  });

  it("parsea documentos extranjeros alfanuméricos (caso real: estudiantes con documento de otro país)", () => {
    const { entradas } = parsearLotePadron("1009 Silva, Ana MEDICINA - Gk666670 A");
    expect(entradas[0]?.dni).toBe("Gk666670");
  });

  it("nombre con inicial suelta de una sola letra no se confunde con la carrera (caso real encontrado)", () => {
    const { entradas } = parsearLotePadron("2051 Dubois, Marie J MEDICINA F-2996/3 19140124 A");
    expect(entradas[0]?.nombreCompleto).toBe("Dubois, Marie J");
    expect(entradas[0]?.carrera).toBe("MEDICINA");
  });

  it("carrera de más de una palabra se extrae completa", () => {
    const { entradas } = parsearLotePadron("1 Lopez, Carla TERAPIA OCUPACIONAL A-100/1 40000000 A");
    expect(entradas[0]?.carrera).toBe("TERAPIA OCUPACIONAL");
    expect(entradas[0]?.nombreCompleto).toBe("Lopez, Carla");
  });

  it("líneas de encabezado/filtro repetidas por página se ignoran, no cuentan como no reconocidas", () => {
    const { entradas, lineasNoReconocidas } = parsearLotePadron(
      [
        "Reporte Padrón de Consejo Directivo",
        "Filtro",
        "Nº Nombre Propuesta Legajo Documento Calidad Firma",
        "Todas las ubicaciones es igual a Sí",
        "Propuesta es igual a (M31) MEDICINA",
        "Fecha Desde desde 01/04/2025",
      ].join("\n"),
    );
    expect(entradas).toEqual([]);
    expect(lineasNoReconocidas).toEqual([]);
  });

  it("una línea que no matchea el patrón esperado queda en lineasNoReconocidas, no se pierde en silencio", () => {
    const { entradas, lineasNoReconocidas } = parsearLotePadron("esto no es una fila de padrón real");
    expect(entradas).toEqual([]);
    expect(lineasNoReconocidas).toEqual(["esto no es una fila de padrón real"]);
  });

  it("líneas vacías se ignoran sin generar ni entrada ni línea no reconocida", () => {
    const { entradas, lineasNoReconocidas } = parsearLotePadron("\n\n   \n\n");
    expect(entradas).toEqual([]);
    expect(lineasNoReconocidas).toEqual([]);
  });

  it("un lote real de varias filas mezcladas con encabezado se parsea completo, en orden", () => {
    const texto = [
      "Nº Nombre Propuesta Legajo Documento Calidad Firma",
      "1 Gomez, Maria Laura MEDICINA A-5207/8 43742955 A",
      "2 Fernandez Bennett, Luisina MEDICINA - 46343753 A",
      "3 Alvarez, Sofia MEDICINA A-5674/1 45677438 A",
    ].join("\n");
    const { entradas, lineasNoReconocidas } = parsearLotePadron(texto);
    expect(lineasNoReconocidas).toEqual([]);
    expect(entradas).toHaveLength(3);
    expect(entradas.map((e) => e.nombreCompleto)).toEqual([
      "Gomez, Maria Laura",
      "Fernandez Bennett, Luisina",
      "Alvarez, Sofia",
    ]);
  });

  it("filas duplicadas en el texto (error del reporte de origen) se parsean ambas — la deduplicación no es responsabilidad de este módulo", () => {
    const texto = [
      "57 Diaz, Victoria MEDICINA A-5383/1 45341399 A",
      "58 Diaz, Victoria MEDICINA A-5383/1 45341399 A",
    ].join("\n");
    const { entradas } = parsearLotePadron(texto);
    expect(entradas).toHaveLength(2);
  });

  it("nunca tira excepción con basura adversarial", () => {
    const casos = ["", " ", "1", "1 2 3", "'; DROP TABLE \"Persona\"; --", "😀".repeat(50), "1 , MEDICINA - 12345678 A"];
    for (const caso of casos) {
      expect(() => parsearLotePadron(caso)).not.toThrow();
    }
  });

  it("nombre sin coma (no viene como 'Apellido, Nombre') no se extrae — la coma es la señal de separación confiable", () => {
    const { entradas, lineasNoReconocidas } = parsearLotePadron(
      "1 Gomez Maria Laura MEDICINA A-5207/8 43742955 A",
    );
    expect(entradas).toEqual([]);
    expect(lineasNoReconocidas).toHaveLength(1);
  });
});
