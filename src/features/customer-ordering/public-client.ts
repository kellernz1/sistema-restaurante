export class CustomerApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function customerApi<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new CustomerApiError(response.status, body.error || "Não foi possível concluir. Tente novamente.");
  return body as T;
}
