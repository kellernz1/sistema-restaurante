import type { Metadata } from "next";

import { OrderTracking } from "@/features/customer-ordering/order-tracking";

export const metadata: Metadata = { title: "Acompanhe seu pedido · Mesa Certa", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function TrackingPage({ params }: { params: Promise<{ token: string }> }) {
  return <OrderTracking token={(await params).token} />;
}
