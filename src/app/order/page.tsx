import { getTranslation } from "@/lib/i18n/server";
import type { Metadata } from "next";

import { OffsiteMenu } from "@/features/customer-ordering/offsite-menu";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslation();
  return { title: t("Retirada e entrega · Mesa Certa") };
}
export default function PublicOrderPage() { return <OffsiteMenu />; }
