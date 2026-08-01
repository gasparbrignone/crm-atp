import { Card } from "@/components/ui/Card";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-fondo px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-borde-chico bg-primario text-base font-bold text-white">
            A
          </span>
          <h1 className="text-lg font-semibold text-texto">CRM ATP</h1>
        </div>
        <Card>{children}</Card>
      </div>
    </div>
  );
}
