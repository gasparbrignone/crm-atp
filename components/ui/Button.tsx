import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "primario" | "secundario" | "fantasma" | "peligro";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primario: "bg-primario text-white hover:opacity-90 focus-visible:outline-primario",
  secundario:
    "bg-transparent text-secundario border border-secundario hover:bg-secundario/10 focus-visible:outline-secundario",
  fantasma: "bg-transparent text-texto hover:bg-borde/40 focus-visible:outline-texto-secundario",
  peligro: "bg-error text-white hover:opacity-90 focus-visible:outline-error",
};

// Componente base del design system — ver /19-ux-ui.md sección 7.
// Área táctil mínima 44x44px en mobile (sección 9, accesibilidad).
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primario", type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-borde px-4 min-h-11 text-sm font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
          variantClasses[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
