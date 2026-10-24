"use client";

import { useTranslation } from "@/components/language-provider";


import Link from "next/link";
import { FormEvent, useState } from "react";

import { uuid } from "@/lib/uuid";

import { sendSimulatorMessage, type SimulatorReply } from "./actions";

type ChatMessage = { id: string; side: "customer" | "bot"; text: string; reply?: SimulatorReply };

function replyText(reply: SimulatorReply) {
  if (reply.kind === "template") return `Modelo ${reply.name}: ${reply.parameters.join(" · ")}`;
  return reply.body;
}

export function WhatsAppSimulator() {
  const t = useTranslation();
  const [phone, setPhone] = useState("+5511999990099");
  const [text, setText] = useState("menu");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function send(value: string) {
    const clean = value.trim();
    if (!clean || pending) return;
    setPending(true);
    setError("");
    setMessages((current) => [...current, { id: uuid(), side: "customer", text: clean }]);
    setText("");
    try {
      const result = await sendSimulatorMessage({ phone, text: clean, messageId: uuid() });
      setMessages((current) => [
        ...current,
        ...result.replies.map((reply) => ({ id: uuid(), side: "bot" as const, text: replyText(reply), reply })),
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Falha no simulador."));
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await send(text);
  }

  return (
    <main className="simulator-page">
      <header className="simulator-heading">
        <div>
          <span className="eyebrow">{t("Ferramenta local")}</span>
          <h1>{t("Simulador do WhatsApp")}</h1>
          <p>{t("Converse com o bot sem conta Meta. Os pedidos criados aparecem na Central de Pedidos.")}</p>
        </div>
        <Link className="ghost-button" href="/orders">{t("Abrir Central de Pedidos")}</Link>
      </header>

      <section className="simulator-phone" aria-label={t("Conversa simulada")}>
        <label className="field-group">
          <span>{t("Telefone de teste em formato internacional")}</span>
          <input className="order-input" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={pending} />
        </label>
        <div className="simulator-chat" aria-live="polite">
          {messages.length === 0 ? <p className="simulator-empty">{t("Envie “menu” para iniciar o atendimento.")}</p> : null}
          {messages.map((message) => (
            <article className={`simulator-bubble simulator-bubble-${message.side}`} key={message.id}>
              <small>{t(message.side === "customer" ? t("Cliente") : "Bot")}</small>
              <p>{message.text.split(/(https?:\/\/[^\s]+)/g).map((part, index) => /^https?:\/\//.test(part) ? <a key={index} href={part} target="_blank" rel="noopener noreferrer">{t(part)}</a> : part)}</p>
              {message.reply?.kind === "buttons" ? (
                <div className="simulator-options">
                  {message.reply.buttons.map((button) => <button disabled={pending} key={button.id} onClick={() => send(button.id)}>{t(button.title)}</button>)}
                </div>
              ) : null}
              {message.reply?.kind === "list" ? (
                <div className="simulator-options">
                  {message.reply.rows.map((row) => <button disabled={pending} key={row.id} onClick={() => send(row.id)}><strong>{t(row.title)}</strong>{row.description ? <span>{row.description}</span> : null}</button>)}
                </div>
              ) : null}
            </article>
          ))}
        </div>
        {error ? <p className="form-error">{t(error)}</p> : null}
        <form className="simulator-compose" onSubmit={submit}>
          <input className="order-input" aria-label={t("Mensagem")} value={text} onChange={(event) => setText(event.target.value)} placeholder={t("Digite uma mensagem")} disabled={pending} />
          <button className="primary-button" disabled={pending || !text.trim()} type="submit">{t(pending ? t("Enviando…") : t("Enviar"))}</button>
        </form>
      </section>
    </main>
  );
}
