import { notFound } from "next/navigation";
import Link from "next/link";
import { requerirPermiso } from "@/lib/permisos/permisos";
import { obtenerPersonasPorIds } from "@/lib/servicios/personas.service";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormularioFusion } from "./FormularioFusion";

// Fusión de duplicados — /05-modulo-personas.md sección 8.2. La persona
// `definitivaId` es la que sobrevive (recibe Participacion/PunteoPersona/
// Historial de la otra); `descartadaId` pasa a estadoFicha=fusionada. El
// usuario puede invertir cuál es cuál desde acá si se equivocó de orden —
// ver el link "Invertir" más abajo.
export default async function FusionarPersonasPage({
  params,
}: {
  params: Promise<{ definitivaId: string; descartadaId: string }>;
}) {
  await requerirPermiso("personas.fusionar_duplicados");
  const { definitivaId, descartadaId } = await params;

  if (definitivaId === descartadaId) notFound();

  const personas = await obtenerPersonasPorIds([definitivaId, descartadaId]);
  const personaDefinitiva = personas.find((p) => p.id === definitivaId);
  const personaDescartada = personas.find((p) => p.id === descartadaId);
  if (!personaDefinitiva || !personaDescartada) notFound();

  if (personaDefinitiva.estadoFicha === "fusionada" || personaDescartada.estadoFicha === "fusionada") {
    notFound();
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-texto">Fusionar fichas duplicadas</h1>
        <Link
          href={`/personas/fusionar/${descartadaId}/${definitivaId}`}
          className="text-sm text-secundario hover:underline"
        >
          Invertir cuál queda
        </Link>
      </div>
      <p className="text-sm text-texto-secundario">
        <strong className="text-texto">{personaDescartada.nombre} {personaDescartada.apellido}</strong> pasa
        a fusionada y toda su actividad se re-vincula a{" "}
        <strong className="text-texto">{personaDefinitiva.nombre} {personaDefinitiva.apellido}</strong>, que
        es la ficha que queda. Para cada dato distinto, elegí cuál conservar.
      </p>
      <Card>
        <FormularioFusion definitiva={personaDefinitiva} descartada={personaDescartada} />
      </Card>
      <Link href={`/personas/${descartadaId}`} className="self-start">
        <Button variant="secundario">Cancelar</Button>
      </Link>
    </div>
  );
}
