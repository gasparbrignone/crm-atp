import { type InputHTMLAttributes, forwardRef, useId } from "react";
import { cn } from "@/lib/utils/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  ayuda?: string;
}

// Componente base del design system — ver /19-ux-ui.md sección 7 (formulario de
// campo simple con estado de error inline).
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ayuda, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = error ? `${inputId}-error` : undefined;
    const ayudaId = ayuda ? `${inputId}-ayuda` : undefined;

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-semibold text-texto">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={cn(errorId, ayudaId) || undefined}
          className={cn(
            "min-h-11 rounded-borde border border-borde bg-fondo-superficie px-3 text-sm text-texto placeholder:text-texto-secundario focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-secundario disabled:opacity-50",
            error && "border-error focus:outline-error",
            className,
          )}
          {...props}
        />
        {ayuda && !error && (
          <p id={ayudaId} className="text-xs text-texto-secundario">
            {ayuda}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs text-error">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
