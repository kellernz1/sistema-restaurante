import { getTranslation } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { mockAllowed } from "@/features/whatsapp/security";

import { WhatsAppSimulator } from "./simulator";
import { defaultPhoneCountry } from "@/lib/phone-settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslation();
  return { title: t("Simulador do WhatsApp · Mesa Certa") };
}
export const dynamic = "force-dynamic";

export default async function WhatsAppSimulatorPage() {
  if (!mockAllowed(process.env.NODE_ENV, process.env.WHATSAPP_MOCK, process.env.APP_MODE)) notFound();
  return <WhatsAppSimulator defaultCountry={await defaultPhoneCountry()} />;
}
