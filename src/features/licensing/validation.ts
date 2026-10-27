export const licenseErrors = {
  format: "Formato de licença inválido. Cole o código completo emitido ou selecione um arquivo de licença válido.",
  signature: "Assinatura da licença inválida. Use uma licença emitida com a chave correspondente a esta instalação.",
  installation: "Esta licença pertence a outra instalação. Solicite uma licença para o ID exibido nesta página.",
  older: "Esta licença é mais antiga que a atual. Solicite a versão mais recente ao emissor.",
  missingKey: "Chave pública não configurada. Configure LICENSE_PUBLIC_KEY e reinicie os serviços.",
  invalidKey: "LICENSE_PUBLIC_KEY inválida. Informe exatamente 64 caracteres hexadecimais, sem comandos ou caminhos.",
  differentKey: "A chave pública difere da chave já registrada. A troca exige manutenção do responsável pela instalação.",
  identity: "A licença tem outra identidade de assinatura. Solicite ao emissor uma atualização da licença atual.",
  claims: "Os dados ou a validade da licença são inválidos. Solicite uma nova licença ao emissor.",
  refused: "Não foi possível importar a licença. A licença atual foi preservada. Tente novamente ou fale com o responsável.",
  emptyFile: "O arquivo de licença está vazio. Conclua a emissão antes de importar.",
  keyEmpty: "LICENSE_PUBLIC_KEY está vazia ou ausente no ambiente. Configure a chave pública antes da primeira importação.",
} as const;

export function publicKeyConfiguration(value: string | undefined): "missing" | "invalid" | "valid" {
  if (!value?.trim()) return "missing";
  return /^[a-f0-9]{64}$/i.test(value.trim()) ? "valid" : "invalid";
}

// Envelope validation is intentionally separate from authoritative SQL signature checks.
export function validLicenseEnvelope(value: string): boolean {
  return value.length <= 12000 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}$/.test(value);
}

export function licenseImportError(error: { message?: string; code?: string }): string {
  switch (error.message) {
    case "Invalid license envelope": return licenseErrors.format;
    case "Invalid license signature or trust key": return licenseErrors.signature;
    case "License installation mismatch": return licenseErrors.installation;
    case "Older license rejected": return licenseErrors.older;
    case "License identity cannot change": return licenseErrors.identity;
    case "Trust key rotation requires owner maintenance": return licenseErrors.differentKey;
    case "Ed25519 public key required": return licenseErrors.invalidKey;
    case "Invalid license version":
    case "Invalid license claims":
    case "License timestamps required":
    case "License exceeds monthly validity or grace bound": return licenseErrors.claims;
    default: return licenseErrors.refused;
  }
}
