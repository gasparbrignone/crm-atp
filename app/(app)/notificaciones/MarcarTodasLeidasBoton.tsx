"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { marcarTodasLeidasAction } from "@/app/(app)/notificaciones-actions";

export function MarcarTodasLeidasBoton() {
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="secundario"
      disabled={pendiente}
      onClick={() =>
        iniciar(async () => {
          await marcarTodasLeidasAction();
          router.refresh();
        })
      }
    >
      Marcar todas como leídas
    </Button>
  );
}
