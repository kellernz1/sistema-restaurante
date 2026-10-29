"use client";

import { useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { ArrowLink, EmptyState, ErrorState, FormField, LoadingState, Notice, Panel, PillButton, SectionTitle, SegmentedControl, StatusPill, Toast } from "@/components/ui";
import { Modal } from "@/components/ui-modal";

export function UiCatalog() {
  const t = useTranslation();
  const [value, setValue] = useState("all"), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [toast, setToast] = useState(true);
  return <>
    <Panel><SectionTitle title={t("Ações e estados")} description={t("Controles acessíveis para o atendimento")} />
      <div className="ui-catalog-row"><PillButton operational>{t("Registrar pagamentos")}</PillButton><PillButton variant="secondary">{t("Atualizar")}</PillButton><PillButton variant="danger">{t("Cancelar pedido")}</PillButton><PillButton disabled>{t("Aguarde...")}</PillButton><ArrowLink href="/cashier">{t("Voltar ao caixa")}</ArrowLink></div>
      <div className="ui-catalog-row">{(["green", "yellow", "red"] as const).map((tone, index) => <StatusPill key={tone} tone={tone}>{t(["Dentro do prazo", "Atenção à espera", "Prioridade de retirada"][index])}</StatusPill>)}</div>
      <SegmentedControl label={t("Filtrar pedidos por canal")} value={value} onChange={setValue} options={[{ value: "all", label: t("Todos"), count: 20 }, { value: "pickup", label: t("Retirada"), count: 12 }, { value: "delivery", label: t("Entrega"), count: 8 }]} />
    </Panel>
    <Panel><SectionTitle title={t("Dados e mensagens")} />
      <FormField id="catalog-name" label={t("Nome para chamar (opcional)")} help={t("Controles acessíveis para o atendimento")} autoComplete="name" />
      <FormField id="catalog-value" label={t("Valor em guaraníes")} type="number" inputMode="numeric" error={t("Confira os valores e tente novamente.")} />
      <Notice>{t("Os valores serão conferidos ao enviar.")}</Notice><Notice tone="warning">{t("Há impressões que precisam de conferência.")}</Notice><Notice tone="success">{t("Pagamentos atualizados.")}</Notice><Notice tone="danger" urgent>{t("Confira os valores e tente novamente.")}</Notice>
      {toast && <Toast dismissLabel={t("Fechar detalhes")} onDismiss={() => setToast(false)}>{t("Pagamentos atualizados.")}</Toast>}
      <EmptyState title={t("Seu carrinho está vazio.")}>{t("Adicione produtos para começar.")}</EmptyState><LoadingState>{t("Carregando cardápio...")}</LoadingState><ErrorState action={<PillButton variant="secondary">{t("Atualizar")}</PillButton>}>{t("Confira os valores e tente novamente.")}</ErrorState>
    </Panel>
    <PillButton onClick={() => setOpen(true)}>{t("Abrir demonstração do modal")}</PillButton>
    <Modal open={open} title={t("Descontos e cancelamentos")} closeLabel={t("Fechar confirmação")} busy={busy} onRequestClose={() => setOpen(false)} footer={<><button type="button" onClick={() => setBusy(v => !v)}>{t(busy ? "Continuar" : "Aguarde...")}</button><PillButton disabled={busy} onClick={() => setOpen(false)}>{t("Confirmar ação")}</PillButton></>}>
      <FormField id="catalog-modal-name" label={t("Nome")} autoComplete="name" />
      {Array.from({ length: 20 }, (_, index) => <p key={index}>{t("Se houver falha de conexão, tente novamente para recuperar a mesma operação.")}</p>)}
    </Modal>
  </>;
}
