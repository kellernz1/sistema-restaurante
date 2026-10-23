export function lineSubtotalInCents(item: { unit_price: number; quantity: number }) {
  return Math.round(item.unit_price * 100) * item.quantity;
}

export function billSubtotal(items: readonly { unit_price: number; quantity: number }[]) {
  return items.reduce((sum, item) => sum + lineSubtotalInCents(item), 0) / 100;
}
