import type { Metadata } from "next";

import { OffsiteMenu } from "@/features/customer-ordering/offsite-menu";

export const metadata: Metadata = { title: "Retirada e entrega · Mesa Certa" };
export default function PublicOrderPage() { return <OffsiteMenu />; }
