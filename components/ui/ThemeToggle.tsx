"use client";

import { useEffect, useState } from "react";

type Tema = "light" | "dark";

// Preferencia de usuario persistida — ver /19-ux-ui.md sección 10. El valor por
// defecto (sin elección explícita) sigue prefers-color-scheme del sistema.
export function ThemeToggle() {
  const [tema, setTema] = useState<Tema | null>(null);

  useEffect(() => {
    const guardado = localStorage.getItem("tema") as Tema | null;
    setTema(
      guardado ??
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    );
  }, []);

  function alternar() {
    const siguiente: Tema = tema === "dark" ? "light" : "dark";
    setTema(siguiente);
    localStorage.setItem("tema", siguiente);
    document.documentElement.setAttribute("data-theme", siguiente);
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={tema === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className="inline-flex h-11 w-11 items-center justify-center rounded-borde text-texto hover:bg-borde/40"
    >
      {tema === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
