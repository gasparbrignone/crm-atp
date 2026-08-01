// Función pura (sin dependencias de servidor) para poder usarse también
// desde componentes cliente — /09-modulo-padron-electoral.md sección 6: solo
// prellena el nombre/apellido al dar de alta una ficha nueva desde una
// entrada sin coincidencia, siempre editable por el usuario antes de
// confirmar.
export function partirNombreCompleto(nombreCompleto: string): { nombre: string; apellido: string } {
  const texto = nombreCompleto.trim();
  if (texto.includes(",")) {
    const [apellido, nombre] = texto.split(",").map((p) => p.trim());
    return { nombre: nombre ?? "", apellido: apellido ?? "" };
  }
  const partes = texto.split(/\s+/);
  if (partes.length <= 1) return { nombre: texto, apellido: "" };
  const mitad = Math.ceil(partes.length / 2);
  return { nombre: partes.slice(mitad).join(" "), apellido: partes.slice(0, mitad).join(" ") };
}
