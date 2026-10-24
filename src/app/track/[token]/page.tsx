import { getTranslation } from "@/lib/i18n/server";
import type { Metadata } from "next";

import { OrderTracking } from "@/features/customer-ordering/order-tracking";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslation();
  return { title: t("Acompanhe seu pedido · Mesa Certa"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}
export default async function TrackingPage({ params }: { params: Promise<{ token: string }> }) {
  return <OrderTracking token={(await params).token} />;
}
