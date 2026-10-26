"use client";
import { useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { money } from "@/lib/money";
import { uuid } from "@/lib/uuid";
import { approvalRequest } from "@/features/approvals/sensitive-actions";
import { customerApi, CustomerApiError } from "@/features/customer-ordering/public-client";
import { counterDiscountSchema } from "./validation";
import { discountBasisPoints } from "./domain";
import { approvalFailureMessage, type ApprovalResult } from "@/features/approvals/pin-feedback";
export type CounterDiscountApproval={cartKey:string;gross:number;amount:number;total:number;payload:{draft_id:string;mode:"amount"|"percent";value:number;reason:string;binding:string;authorization:string|null}};
type Quote={binding:string;gross:number;discount:number;total:number;requires_approval:boolean};
type Configuration={approvers:{id:string;name:string}[];policy:{discount_reasons:string[]}};
export function CounterDiscount({cartKey,gross,disabled,onChange,onIntent}:{cartKey:string;gross:number;disabled:boolean;onChange:(value:CounterDiscountApproval|null)=>void;onIntent:(value:boolean)=>void}){
 const t=useTranslation();
 const [enabled,setEnabled]=useState(false),[mode,setMode]=useState<"amount"|"percent">("amount"),[value,setValue]=useState(""),[reason,setReason]=useState("");
 const [quote,setQuote]=useState<Quote|null>(null),[draftId,setDraftId]=useState(""),[config,setConfig]=useState<Configuration|null>(null),[approver,setApprover]=useState(""),[pin,setPin]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[applied,setApplied]=useState(false);
 function invalidate(){setQuote(null);setPin("");setApplied(false);setError("");onChange(null);}
 async function refresh(){setBusy(true);setError("");try{setConfig(await approvalRequest());setApprover("");setPin("");}catch{setError(t("Não foi possível carregar os aprovadores."));}finally{setBusy(false);}}
 async function apply(){
  setBusy(true);setError("");
  try{
   const discount=counterDiscountSchema.parse({mode,value:mode==="percent"?discountBasisPoints(value):Number(value),reason});
   const payload=JSON.parse(cartKey);
   let next=quote,id=draftId,authorization:string|null=null;
   if(!next){id=uuid();const configuration:Configuration=await approvalRequest();setConfig(configuration);next=await customerApi<Quote>("/api/staff/counter/discount",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({command:"quote",draft_id:id,payload,discount})});if(next.gross!==gross)throw Error(t("Os preços mudaram. Atualize a página e confira o carrinho."));setQuote(next);setDraftId(id);if(next.requires_approval)return;}
   if(next.requires_approval){
    if(!approver||!/^\d{4,6}$/.test(pin))throw Error(t("Selecione um aprovador e informe o PIN numérico de 4 a 6 dígitos."));
    const result=await customerApi<ApprovalResult>("/api/staff/counter/discount",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({command:"approve",request_id:uuid(),draft_id:id,payload,discount,binding:next.binding,approver,pin})});setPin("");if(!result.ok||!result.authorization)throw Error(approvalFailureMessage(result,t));authorization=result.authorization;
   }
   onChange({cartKey,gross:next.gross,amount:next.discount,total:next.total,payload:{...discount,draft_id:id,binding:next.binding,authorization}});setApplied(true);
  }catch(e){setPin("");if(e instanceof CustomerApiError&&e.status===409){setQuote(null);setApplied(false);onChange(null);}setError(e instanceof Error&&e.name!=="ZodError"&&e.message!=="Invalid discount percentage"?e.message:t("Confira o valor e o motivo do desconto."));}finally{setBusy(false);}
 }
 if(!enabled)return <button type="button" className="ghost-button" disabled={disabled||gross<=0} onClick={()=>{setEnabled(true);onIntent(true);}}>{t("Adicionar desconto")}</button>;
 return <fieldset className="counter-discount" disabled={disabled||busy}><legend>{t("Desconto no pedido")}</legend>
  <label>{t("Tipo de desconto")}<select className="order-input" value={mode} onChange={e=>{invalidate();setMode(e.target.value as typeof mode);}}><option value="amount">Gs.</option><option value="percent">%</option></select></label>
  <label>{t("Valor")}<input className="order-input" type="number" min={mode==="percent"?"0.01":"1"} max={mode==="percent"?"100":gross} step={mode==="percent"?"0.01":"1"} value={value} onChange={e=>{invalidate();setValue(e.target.value);}} /></label>
  <label>{t("Motivo obrigatório")}<input className="order-input" maxLength={300} list="counter-discount-reasons" value={reason} onChange={e=>{invalidate();setReason(e.target.value);}} /><datalist id="counter-discount-reasons">{config?.policy.discount_reasons.map(r=><option key={r} value={r}/>)}</datalist></label>
  {quote?.requires_approval&&!applied&&<>{config&&!config.approvers.length?<p role="status">{t("Nenhum aprovador com PIN cadastrado. Peça ao administrador ou supervisor para configurar o próprio PIN.")}</p>:<><label>{t("Aprovador")}<select className="order-input" value={approver} onChange={e=>{setApprover(e.target.value);setPin("");setError("");}}><option value="">{t("Selecione")}</option>{config?.approvers.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>{t("PIN de aprovação")}<input className="order-input" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={e=>setPin(e.target.value)}/></label></>}<button type="button" className="ghost-button" onClick={()=>void refresh()}>{t("Atualizar aprovadores")}</button><p>{t("Digite o PIN numérico de aprovação do responsável selecionado, não a senha de login.")}</p></>}
  {error&&<p role="alert" className="approval-feedback">{t(error)}</p>}{applied?<p role="status"><strong>{t("Desconto autorizado")}: {money.format(quote?.discount??0)}</strong></p>:<button type="button" className="primary-button" disabled={!!quote?.requires_approval&&(!approver||!/^\d{4,6}$/.test(pin))} onClick={()=>void apply()}>{t(quote?.requires_approval?"Autorizar desconto":"Conferir desconto")}</button>}
  <button type="button" className="ghost-button" onClick={()=>{invalidate();setEnabled(false);onIntent(false);}}>{t("Remover desconto")}</button><small>{t("Alterar o carrinho exige nova aprovação. O desconto só é gravado ao enviar o pedido.")}</small>
 </fieldset>;
}
