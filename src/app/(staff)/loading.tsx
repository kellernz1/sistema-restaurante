import { LoaderCircle } from "lucide-react";

export default function StaffLoading() {
  return (
    <main className="centered-state" aria-live="polite">
      <LoaderCircle className="spin" aria-hidden="true" size={28} />
      <p>Carregando painel...</p>
    </main>
  );
}
