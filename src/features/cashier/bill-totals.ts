export function lineSubtotal(item: { unit_price: number; quantity: number }) {
  return item.unit_price * item.quantity;
}

export function billSubtotal(items: readonly { unit_price: number; quantity: number }[]) {
  return items.reduce((sum, item) => sum + lineSubtotal(item), 0);
}
