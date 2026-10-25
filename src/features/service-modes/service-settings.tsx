"use client";
import {useEffect,useState} from "react";
import {useTranslation} from "@/components/language-provider";
import {customerApi} from "@/features/customer-ordering/public-client";
import {servicePolicySchema} from "./validation";
import type {z} from "zod";
export function ServiceSettings(){
 const t=useTranslation();const [form,setForm]=useState<z.infer<typeof servicePolicySchema>|null>(null),[message,setMessage]=useState("");
 useEffect(()=>{let alive=true;void customerApi("/api/staff/service-modes").then(data=>{const {counter_enabled,uses_waiter,qr_confirmation,qr_phone,pending_per_table,pending_per_phone}=data as z.infer<typeof servicePolicySchema>;if(alive)setForm({counter_enabled,uses_waiter,qr_confirmation,qr_phone,pending_per_table,pending_per_phone});}).catch(()=>{if(alive)setMessage(t("Não foi possível carregar as opções de atendimento."));});return()=>{alive=false;};},[t]);
 return <fieldset className="settings-fieldset"><legend>{t("Modos de atendimento e segurança do QR")}</legend>{message&&<p role="status">{message}</p>}{form&&<>
 <label><input type="checkbox" checked={form.counter_enabled} onChange={e=>setForm({...form,counter_enabled:e.target.checked})}/>{t("Ativar balcão")}</label><label><input type="checkbox" checked={form.uses_waiter} onChange={e=>setForm({...form,uses_waiter:e.target.checked})}/>{t("Usa garçom")}</label>
 <label className="field-group">{t("Confirmação dos pedidos por QR")}<select className="order-input" value={form.qr_confirmation} onChange={e=>setForm({...form,qr_confirmation:e.target.value as typeof form.qr_confirmation})}><option value="manual">{t("Sempre confirmar no caixa")}</option><option value="after_first">{t("Automática após a primeira confirmação da conta")}</option><option value="payment">{t("Receber e confirmar")}</option></select></label>
 <label className="field-group">{t("Telefone no pedido por QR")}<select className="order-input" value={form.qr_phone} onChange={e=>setForm({...form,qr_phone:e.target.value as typeof form.qr_phone})}><option value="required">{t("Obrigatório")}</option><option value="optional">{t("Opcional")}</option><option value="off">{t("Desligado")}</option></select></label>
 <label className="field-group">{t("Máximo de pedidos pendentes por mesa")}<input className="order-input" type="number" min={1} max={20} value={form.pending_per_table} onChange={e=>setForm({...form,pending_per_table:Number(e.target.value)})}/></label><label className="field-group">{t("Máximo de pedidos pendentes por telefone")}<input className="order-input" type="number" min={1} max={20} value={form.pending_per_phone} onChange={e=>setForm({...form,pending_per_phone:Number(e.target.value)})}/></label>
 <p>{t("O nome é obrigatório. Sem telefone, o limite por número e o bloqueio não podem ser aplicados.")}</p><button type="button" className="primary-button" onClick={async()=>{try{await customerApi("/api/staff/service-modes",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(form)});setMessage(t("Configurações atualizadas"));window.dispatchEvent(new Event("service-modes-changed"));}catch{setMessage(t("Não foi possível salvar."));}}}>{t("Salvar opções de atendimento")}</button></>}
 </fieldset>;
}
