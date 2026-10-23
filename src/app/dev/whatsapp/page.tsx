import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { mockAllowed } from "@/features/whatsapp/security";

import { WhatsAppSimulator } from "./simulator";

export const metadata: Metadata = { title: "Simulador do WhatsApp · Mesa Certa" };
export const dynamic = "force-dynamic";

export default function WhatsAppSimulatorPage() {
  if (!mockAllowed(process.env.NODE_ENV, process.env.WHATSAPP_MOCK, process.env.APP_MODE)) notFound();
  return <WhatsAppSimulator />;
}
