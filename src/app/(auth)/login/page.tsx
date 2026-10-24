import { getTranslation } from "@/lib/i18n/server";
import { ChefHat } from "lucide-react";

import { LoginForm } from "@/features/auth/login-form";

export default async function LoginPage() {
  const t = await getTranslation();
  return (
    <main className="login-page">
      <section className="login-intro" aria-label={t("Apresentação")}>
        <div className="intro-content">
          <span className="brand-mark">
            <ChefHat aria-hidden="true" size={34} />
          </span>
          <p className="eyebrow eyebrow-light">{t("Operação simples, serviço melhor")}</p>
          <h1>{t("Todo o restaurante, no mesmo ritmo.")}</h1>
          <p>
            {t("Pedidos, cozinha, mesas e caixa conectados para sua equipe cuidar do que realmente importa: a experiência de cada cliente.")}</p>
        </div>
        <p className="intro-footnote">{t("Sistema interno • acesso exclusivo da equipe")}</p>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-brand">
            <span className="brand-mark brand-mark-small">
              <ChefHat aria-hidden="true" size={22} />
            </span>
            <strong>Mesa Certa</strong>
          </div>
          <p className="eyebrow">{t("Bem-vindo de volta")}</p>
          <h2>{t("Acesse sua conta")}</h2>
          <p className="login-helper">{t("Use o e-mail e a senha cadastrados pelo administrador.")}</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
