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

// Distinto de partirNombreCompleto(): esa función asume la convención
// burocrática de un padrón oficial ("Apellido, Nombre", o adivina apellido
// primero si no hay coma). Un formulario de inscripción autocompletado por
// la propia persona (Google Sheets de un formulario) sigue la convención
// contraria — "Nombre Apellido" — así que reusar la otra función acá
// invertía nombre y apellido en la mayoría de los casos reales.
export function partirNombreYApellido(nombreCompleto: string): { nombre: string; apellido: string } {
  const partes = nombreCompleto.trim().split(/\s+/);
  if (partes.length <= 1) return { nombre: nombreCompleto.trim(), apellido: "" };
  return { nombre: partes[0], apellido: partes.slice(1).join(" ") };
}
