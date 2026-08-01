export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-fondo px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-center text-lg font-semibold text-texto">CRM ATP</h1>
        {children}
      </div>
    </div>
  );
}
