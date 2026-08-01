import { type TextareaHTMLAttributes, forwardRef, useId } from "react";
import { cn } from "@/lib/utils/cn";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  ayuda?: string;
}

// Componente base del design system — mismo criterio que Input.tsx (ver
// /19-ux-ui.md sección 7), para campos de texto largo (descripción,
// observaciones) usados en Actividades y Personas.
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, ayuda, id, rows = 3, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id ?? generatedId;
    const errorId = error ? `${textareaId}-error` : undefined;
    const ayudaId = ayuda ? `${textareaId}-ayuda` : undefined;

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={textareaId} className="text-sm font-semibold text-texto">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          aria-invalid={!!error}
          aria-describedby={cn(errorId, ayudaId) || undefined}
          className={cn(
            "rounded-borde-chico border border-borde bg-fondo-superficie px-3 py-2 text-sm text-texto placeholder:text-texto-secundario transition-colors focus:border-secundario focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-secundario/30 disabled:opacity-50",
            error && "border-error focus:border-error focus:outline-error/30",
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
Textarea.displayName = "Textarea";
