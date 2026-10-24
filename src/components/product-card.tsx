import { ProductPhoto } from "@/components/product-photo";

import { LineupCard, PillButton } from "@/components/ui";

export function ProductCard({ product, disabled, onAdd }: {
  product: { id: string; name: string; description: string | null; price: number; image_version?: string | null };
  disabled: boolean; onAdd: () => void;
}) {
  return <LineupCard className="menu-product" tone="neutral"
    visual={<ProductPhoto id={product.id} version={product.image_version} name={product.name} />}
    title={product.name} description={product.description ?? "Preparado com cuidado para você."}
    detail={new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(product.price)}
    actions={<PillButton disabled={disabled} onClick={onAdd} aria-label={`Adicionar ${product.name}`}>Adicionar</PillButton>} />;
}
