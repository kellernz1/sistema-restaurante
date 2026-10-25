import { CustomerApiError } from "../customer-ordering/public-client.ts";

export function paymentErrorMessage(failure: unknown): string {
  if (failure instanceof CustomerApiError && failure.status >= 400 && failure.status < 500) {
    if (failure.message === "Abra o caixa antes de registrar pagamentos.") return failure.message;
    return "Confira o saldo, as formas habilitadas e a cotação atual antes de tentar novamente.";
  }
  return "Envio incerto. Consulte o mesmo pagamento antes de tentar outro.";
}
