export type Reply =
  | { kind: "text"; body: string; handoff?: boolean; fallback_template?: { name: string; parameters: string[] } }
  | { kind: "buttons"; body: string; buttons: { id: string; title: string }[] }
  | { kind: "list"; body: string; rows: { id: string; title: string; description?: string }[] }
  | { kind: "template"; name: string; parameters: string[] };
export type Address = { street: string; number: string; complement: string; neighborhood: string; city: string; state: string; zip_code: string; reference: string };
export type Context = {
  order_type?: "dine_in" | "pickup" | "delivery"; table_id?: string; table_token?: string;
  cart: { product_id: string; quantity: number; notes: string }[];
  product_id?: string; quantity?: number; category_id?: string; page?: number;
  customer_name?: string; address?: Partial<Address>; address_index?: number; location?: string;
  payment_method?: "cash" | "transfer" | "card" | "pix"; cash_change_for?: number;
};
export type Session = { state: string; context: Context; needs_human: boolean; opted_out: boolean; last_message_at: string };
export type Environment = {
  now: number; appUrl: string; settings: { is_accepting_orders: boolean; whatsapp_enabled: boolean; pickup_enabled: boolean; delivery_enabled: boolean; dine_in_qr_enabled: boolean; delivery_fee: number; min_delivery_order: number; estimated_pickup_minutes: number; estimated_delivery_minutes: number };
  categories: { id: string; name: string }[];
  products: { id: string; category_id: string; name: string; price: number }[];
  tables: { id: string; table_number: number; qr_token: string; status: string }[];
  customerName?: string; addresses: { id: string; address: Address }[];
};
export type Input = { text: string; location?: { latitude: number; longitude: number } };
export type Transition = { session: Session; replies: Reply[]; submit?: boolean };
