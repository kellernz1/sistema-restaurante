export class CustomerApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export async function customerApi<T>(url: string, options?: RequestInit): Promise<T> {
  const submittingOrder = options?.method?.toUpperCase() === "POST" && url === "/api/public/orders";
  const unavailable = submittingOrder
    ? "Não foi possível confirmar a resposta do pedido. Confira com o restaurante se ele foi recebido antes de enviar novamente. Seus itens continuam no carrinho."
    : "A conexão com o sistema está temporariamente indisponível. Aguarde um instante e tente novamente.";
  let response: Response;
  try { response = await fetch(url, { ...options, cache: "no-store" }); }
  catch (failure) {
    if (options?.signal?.aborted) throw failure;
    throw new CustomerApiError(503, unavailable);
  }
  if (!/^application\/(?:[\w.+-]+\+)?json\b/i.test(response.headers.get("content-type") ?? "")) {
    throw new CustomerApiError(502, unavailable);
  }
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new CustomerApiError(502, unavailable); }
  if (body === null || typeof body !== "object") throw new CustomerApiError(502, unavailable);
  if (!response.ok) {
    const message = "error" in body && typeof body.error === "string" ? body.error : "Não foi possível concluir. Tente novamente.";
    throw new CustomerApiError(response.status, response.status >= 500 && submittingOrder ? unavailable : message);
  }
  return body as T;
}
