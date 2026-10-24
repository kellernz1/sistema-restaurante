"use client";

import { useTranslation } from "@/components/language-provider";
import { ProductPhoto } from "@/components/product-photo";

import { LineupCard, PillButton } from "@/components/ui";

export function ProductCard({ product, disabled, onAdd }: {
  product: { id: string; name: string; description: string | null; price: number; image_version?: string | null };
  disabled: boolean; onAdd: () => void;
}) {
  const t = useTranslation();
  return <LineupCard className="menu-product" tone="neutral"
    visual={<ProductPhoto id={product.id} version={product.image_version} name={product.name} />}
    title={product.name} description={product.description ?? t("Preparado com cuidado para você.")}
    detail={new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(product.price)}
    actions={<PillButton disabled={disabled} onClick={onAdd} aria-label={t(`Adicionar ${product.name}`)}>{t("Adicionar")}</PillButton>} />;
}
