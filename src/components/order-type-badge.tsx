import { Bike, ShoppingBag, Utensils } from "lucide-react";

import type { Database } from "@/types/database.types";

const orderTypes = {
  dine_in: { label: "Local", icon: Utensils },
  pickup: { label: "Retirada", icon: ShoppingBag },
  delivery: { label: "Entrega", icon: Bike },
};

export function OrderTypeBadge({ type }: {
  type: Database["public"]["Enums"]["order_type"];
}) {
  const { label, icon: Icon } = orderTypes[type];
  return (
    <span className={`order-type-badge order-type-${type}`}>
      <Icon aria-hidden="true" size={15} />
      {label}
    </span>
  );
}
