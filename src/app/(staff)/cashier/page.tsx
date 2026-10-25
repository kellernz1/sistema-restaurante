import { CounterQueue } from "@/features/counter/counter-queue";
import {QrQueue} from "@/features/service-modes/qr-queue";
import {ServiceAlerts} from "@/features/tables/service-alerts";
import { getTranslation } from "@/lib/i18n/server";
import "./counter/counter.css";
﻿import { CashierBoard } from "@/features/cashier/cashier-board";
import { cashierTablesQuery } from "@/features/cashier/cashier-query";
import { createClient } from "@/utils/supabase/server";

export default async function CashierDashboard() {
  const t=await getTranslation();
  const db = await createClient();
  const { data, error } = await cashierTablesQuery(db);
  const settings=await db.from("restaurant_settings").select("counter_green_minutes,counter_yellow_minutes,dine_in_qr_enabled").eq("id",true).single();
  const policy=await db.from("service_policy").select("counter_enabled").single();
  return <section className="cashier-home"><header className="section-heading"><div><span className="eyebrow">{t("Painel do caixa")}</span><h1>{t(settings.data?.dine_in_qr_enabled?"Caixa e mesas":"Caixa")}</h1><p>{t("Acompanhe pedidos prontos e gerencie os atendimentos.")}</p></div></header>{policy.data?.counter_enabled&&<><CounterQueue greenMinutes={settings.data?.counter_green_minutes ?? 2} yellowMinutes={settings.data?.counter_yellow_minutes ?? 5} /></>}{settings.data?.dine_in_qr_enabled&&<><QrQueue green={settings.data.counter_green_minutes} yellow={settings.data.counter_yellow_minutes}/><ServiceAlerts/><CashierBoard initialTables={data ?? []} initialError={!!error} /></>}</section>;
}
