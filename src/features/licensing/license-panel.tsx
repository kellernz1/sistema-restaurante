"use client";
import {useEffect,useState}from "react";
import Link from "next/link";
import {useTranslation}from "@/components/language-provider";
import {licenseLabels,type LicenseStatus}from "./types";
import {licenseErrors,validLicenseEnvelope}from "./validation";
async function requestLicense(body?:object){const r=await fetch("/api/staff/license",body?{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}:{cache:"no-store"});const data=await r.json();if(!r.ok)throw Error(data.error);return data as LicenseStatus;}
export function LicenseBanner({manage=false}:{manage?:boolean}){
 const t=useTranslation(),[s,setState]=useState<LicenseStatus|null>(null);
 useEffect(()=>{let active=true;const load=()=>{void requestLicense().then(v=>{if(active)setState(v);}).catch(()=>{});};load();const timer=setInterval(load,15000);window.addEventListener("focus",load);window.addEventListener("cash-session-changed",load);window.addEventListener("license-changed",load);return()=>{active=false;clearInterval(timer);window.removeEventListener("focus",load);window.removeEventListener("cash-session-changed",load);window.removeEventListener("license-changed",load);};},[]);
 if(!s||(s.state==="active"&&!s.clock_suspect&&!s.requires_online))return null;
 return <aside className={`license-banner license-${s.state}`}role="status"><strong>{t("Licença")}: {t(licenseLabels[s.state])}</strong>{s.state==="expiring"&&<span>{t("A licença vence em {0} dias.").replace("{0}",String(s.days_remaining))}</span>}{s.state==="grace"&&<span>{t("Renove a licença. O período de tolerância está em andamento.")}</span>}{s.state==="restricted"&&<span>{t("Novos pedidos estão indisponíveis. Conclua normalmente os pedidos, pagamentos e relatórios existentes.")}</span>}{s.pending_restriction&&<span>{t("A restrição começa na próxima abertura de caixa ou virada do dia comercial.")}</span>}{(s.clock_suspect||s.requires_online)&&<span>{t("Relógio suspeito: confira a data do computador e solicite renovação online.")}</span>}{manage?<Link href="/admin/settings/license">{t("Conferir licença")}</Link>:<span>{t("Fale com o administrador para renovar.")}</span>}</aside>;
}
export function LicensePanel(){
 const t=useTranslation(),[s,setState]=useState<LicenseStatus|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[token,setToken]=useState(""),[url,setUrl]=useState(""),[days,setDays]=useState(7),[importError,setImportError]=useState(""),[importNotice,setImportNotice]=useState("");
 useEffect(()=>{let active=true;void requestLicense().then(v=>{if(active){setState(v);setUrl(v.renewal_url??"");setDays(v.renewal_interval_days??7);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 async function act(body:{command:string;[key:string]:unknown}){
  const importing=body.command==="import";
  if(importing&&!validLicenseEnvelope(token.trim())){setImportError(licenseErrors.format);setImportNotice("");return;}
  setBusy(true);setError("");setNotice("");
  if(importing){setImportError("");setImportNotice("");}
  try{const result=await requestLicense(body);setState(current=>({...current,...result}));if(importing){setImportNotice("Licença importada com sucesso.");setToken("");}else setNotice("Licença atualizada.");window.dispatchEvent(new Event("license-changed"));}
  catch(e){if(importing)setImportError((e as Error).message);else setError((e as Error).message);}
  finally{setBusy(false);}
 }
 const date=(value:string|null)=>value?new Date(value).toLocaleString():t("Ainda não realizada");
 return <section className="license-panel"><header><span className="eyebrow">{t("Assinatura da instalação")}</span><h1>{t("Licença")}</h1><p>{t("Renove semanalmente. A validade exige renovação ao menos mensal; importação manual também está disponível.")}</p></header>
 {error&&<p role="alert"className="table-notice table-notice-error">{t(error)}</p>}{notice&&<p role="status">{t(notice)}</p>}
 {s?.public_key_environment==="missing"&&<p role="status"className="table-notice">{t(licenseErrors.keyEmpty)}</p>}
 {s?.public_key_environment==="invalid"&&<p role="alert"className="table-notice table-notice-error">{t(licenseErrors.invalidKey)}</p>}
 {s&&<><section className="order-panel"><h2>{t(licenseLabels[s.state])}</h2><dl className="license-facts"><div><dt>{t("Plano")}</dt><dd>{s.plan??"—"}</dd></div><div><dt>{t("Validade")}</dt><dd>{date(s.expires_at)}</dd></div><div><dt>{t("Fim da tolerância")}</dt><dd>{date(s.grace_until)}</dd></div><div><dt>{t("Dias restantes")}</dt><dd>{s.days_remaining??"—"}</dd></div><div><dt>{t("Última renovação online")}</dt><dd>{date(s.last_online_at)}</dd></div></dl><p>{t("Recursos habilitados")}: {s.features.map(f=>t(f==="delivery"?"Entrega":f==="whatsapp"?"WhatsApp":f)).join(", ")||t("Nenhum")}</p><label>{t("ID da instalação")}<input value={s.installation_id}readOnly/></label><button className="ghost-button"onClick={async()=>{try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(s.installation_id);}else{const area=document.createElement("textarea");area.value=s.installation_id;document.body.append(area);area.select();const copied=document.execCommand("copy");area.remove();if(!copied)throw Error();}setNotice(t("ID copiado."));}catch{setError(t("Não foi possível copiar. Selecione o ID e copie manualmente."));}}}>{t("Copiar ID")}</button>{!s.key_configured&&<p>{t("Configure a chave pública da licença no ambiente desta instalação. A chave privada pertence somente ao emissor.")}</p>}<button className="primary-button"disabled={busy}onClick={()=>void act({command:"renew"})}>{t("Renovar agora")}</button></section>
 <section className="order-panel"><h2>{t("Renovação pela internet")}</h2><label>{t("URL de renovação")}<input type="url"placeholder="https://license.example/v1/renew"value={url}onChange={e=>setUrl(e.target.value)}/></label><label>{t("Intervalo de renovação (dias)")}<input type="number"min={1}max={7}value={days}onChange={e=>setDays(Number(e.target.value))}/></label><button disabled={busy}onClick={()=>void act({command:"configure",url,days})}>{t("Salvar configuração")}</button></section>
 <section className="order-panel license-import"><h2>{t("Importar licença")}</h2>
 <label>{t("Licença assinada")}<textarea rows={5}maxLength={12000}value={token}aria-invalid={!!importError}aria-describedby={importError?"license-import-error":undefined}onChange={e=>{setToken(e.target.value);setImportError("");setImportNotice("");}}/></label>
 <label>{t("Arquivo de licença")}<input type="file"accept=".txt,.license"onChange={async e=>{
  const file=e.target.files?.[0];if(!file)return;
  setToken("");setImportNotice("");setImportError("");
  if(file.size>12000){setImportError("Arquivo de licença muito grande.");return;}
  try{const content=(await file.text()).trim();if(!content){setImportError(licenseErrors.emptyFile);return;}setToken(content);if(!validLicenseEnvelope(content))setImportError(licenseErrors.format);}
  catch{setImportError("Não foi possível ler o arquivo de licença. Selecione o arquivo novamente.");}
 }}/></label>
 {importError&&<p id="license-import-error"role="alert"className="table-notice table-notice-error">{t(importError)}</p>}
 {importNotice&&<p role="status">{t(importNotice)}</p>}
 <button className="primary-button"disabled={busy}onClick={()=>void act({command:"import",token:token.trim()})}>{t(busy?"Aguarde...":"Importar licença")}</button><p>{t("Importar não altera a data da última renovação online. Nenhum dado de atendimento é apagado.")}</p></section></>}
 </section>;
}
