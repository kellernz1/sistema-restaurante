"use client";

import { useTranslation } from "@/components/language-provider";


import { CircleAlert, RotateCcw } from "lucide-react";

export default function StaffError({ reset }: { reset: () => void }) {
  const t = useTranslation();
  return (
    <main className="centered-state" role="alert">
      <CircleAlert aria-hidden="true" size={32} />
      <h1>{t("Não foi possível carregar esta área")}</h1>
      <p>{t("Tente novamente. Se o problema continuar, fale com o administrador.")}</p>
      <button className="primary-button compact-button" type="button" onClick={reset}>
        <RotateCcw aria-hidden="true" size={17} />
        {t("Tentar novamente")}</button>
    </main>
  );
}
