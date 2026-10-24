"use client";

import { AlertCircle, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { createClient } from "@/utils/supabase/client";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setError("Informe um e-mail válido.");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (signInError) {
      setError("E-mail ou senha incorretos. Verifique os dados e tente novamente.");
      setLoading(false);
      return;
    }

    const { data: account } = await supabase.auth.getUser();
    const { data: profile } = account.user ? await supabase.from("profiles").select("is_active").eq("id", account.user.id).maybeSingle() : { data: null };
    if (profile?.is_active === false) {
      await supabase.auth.signOut();
      setError("Seu acesso está bloqueado. Fale com o administrador do restaurante.");
      setLoading(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      <div className="field-group">
        <label htmlFor="email">E-mail</label>
        <div className="input-shell">
          <Mail aria-hidden="true" size={19} />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="voce@restaurante.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={loading}
            required
          />
        </div>
      </div>

      <div className="field-group">
        <label htmlFor="password">Senha</label>
        <div className="input-shell">
          <LockKeyhole aria-hidden="true" size={19} />
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Digite sua senha"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={loading}
            required
          />
        </div>
      </div>

      {error ? (
        <div className="form-error" role="alert">
          <AlertCircle aria-hidden="true" size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      <button className="primary-button" type="submit" disabled={loading}>
        {loading ? (
          <>
            <LoaderCircle className="spin" aria-hidden="true" size={18} />
            Entrando...
          </>
        ) : (
          "Entrar"
        )}
      </button>
    </form>
  );
}
