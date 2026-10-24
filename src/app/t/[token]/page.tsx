import { getTranslation } from "@/lib/i18n/server";
import type { Metadata } from "next";

import { TableMenu } from "@/features/customer-ordering/table-menu";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslation();
  return { title: t("Peça na mesa · Mesa Certa"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function CustomerTablePage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ src?: string }>;
}) {
  const [{ token }, search] = await Promise.all([params, searchParams]);
  return <TableMenu token={token} source={search.src === "nfc" ? "nfc" : "qr"} />;
}
