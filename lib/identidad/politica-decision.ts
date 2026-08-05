// Política de decisión de 3 vías sobre una confianza ya calculada —
// PROPUESTA-REDISENO-IDENTIDAD-2026-08-04.md sección 3.6 (P4): antes de este
// archivo, el piso por debajo del cual se descarta sin fricción de revisión
// (`CONFIANZA_MINIMA_PARA_REVISION`) solo vivía en lib/ia/matching-padron.ts;
// lib/ia/deteccion-duplicados.ts no tenía ningún piso equivalente, así que
// una coincidencia de confianza casi nula (ej. 5%) igual se mostraba como
// "sugerencia ambigua" al usuario en el alta manual o como fila de error en
// una importación — inconsistencia real de comportamiento entre los dos
// módulos que llaman al mismo motor. Esta función centraliza la política
// para que ambos compartan el mismo criterio, y para que agregar un tercer
// caller en el futuro no pueda repetir la inconsistencia por accidente.
//
// No decide nada de negocio nuevo — el criterio (piso 0.4, calibrado en
// lib/identidad/BENCHMARK-RESULTADOS.md como la banda de "revisión manual")
// ya regía en matching-padron.ts desde el bug real 2026-08-02 de revisiones
// sin sentido por coincidencias espurias de un token corto y común.

export type DecisionCoincidencia = "auto" | "revision" | "descarte";

export const PISO_CONFIANZA_REVISION = 0.4;

// `umbral` es el valor configurable `umbral_confianza_duplicados` (editable
// desde /configuracion, ver ConfiguracionSistema) — el piso de esta función
// es una constante de diseño, no configurable, porque calibra un límite de
// ruido del motor (por debajo de esto no hay evidencia real de coincidencia
// para NINGÚN umbral razonable), no una preferencia de negocio.
export function clasificarConfianza(confianza: number, umbral: number): DecisionCoincidencia {
  if (confianza < PISO_CONFIANZA_REVISION) return "descarte";
  if (confianza < umbral) return "revision";
  return "auto";
}
