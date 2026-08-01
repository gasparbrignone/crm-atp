import { type SelectHTMLAttributes, forwardRef, useId } from "react";
import { cn } from "@/lib/utils/cn";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

// Componente base del design system — ver /19-ux-ui.md sección 7.
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, children, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={selectId} className="text-sm font-semibold text-texto">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          aria-invalid={!!error}
          className={cn(
            "min-h-11 rounded-borde-chico border border-borde bg-fondo-superficie px-3 text-sm text-texto transition-colors focus:border-secundario focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-secundario/30 disabled:opacity-50",
            error && "border-error focus:border-error focus:outline-error/30",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        {error && (
          <p role="alert" className="text-xs text-error">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Select.displayName = "Select";
