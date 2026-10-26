export type ApprovalResult={ok:boolean;authorization?:string;code?:string;attempts_remaining?:number;retry_after_seconds?:number;blocked_until?:string|null};

export function approvalFailureMessage(result:ApprovalResult,t:(value:string)=>string):string{
 const remaining=result.attempts_remaining;
 if(result.code==="locked"){
  const seconds=result.retry_after_seconds;
  if(typeof seconds==="number"&&Number.isFinite(seconds)&&seconds>0){
   const minutes=Math.ceil(seconds/60);
   return minutes===1?t("PIN deste aprovador bloqueado. Tente novamente em até 1 minuto."):t("PIN deste aprovador bloqueado. Tente novamente em até {0} minutos.").replace("{0}",String(minutes));
  }
  return t("PIN deste aprovador bloqueado temporariamente. Aguarde antes de tentar novamente.");
 }
 if(result.code==="limited"){
  const seconds=result.retry_after_seconds;
  return typeof seconds==="number"&&Number.isFinite(seconds)&&seconds>0?t("Limite de tentativas atingido para sua conta. Aguarde {0} segundos.").replace("{0}",String(Math.ceil(seconds))):t("Limite de tentativas atingido para sua conta. Aguarde antes de tentar novamente.");
 }
 if(result.code==="unavailable")return t("Este aprovador não está disponível. Atualize a lista e selecione outro responsável.");
 if(result.code==="pin"&&typeof remaining==="number"&&Number.isSafeInteger(remaining)&&remaining>0){
  return remaining===1?t("PIN incorreto. Resta 1 tentativa antes do bloqueio."):t("PIN incorreto. Restam {0} tentativas antes do bloqueio.").replace("{0}",String(remaining));
 }
 return t("Não foi possível validar o PIN. Atualize os aprovadores e tente novamente.");
}
