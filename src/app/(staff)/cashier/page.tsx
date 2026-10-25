import { CounterQueue } from "@/features/counter/counter-queue";
import Link from "next/link";
import { getTranslation } from "@/lib/i18n/server";
import "./counter/counter.css";
﻿import { CashierBoard } from "@/features/cashier/cashier-board";
import { cashierTablesQuery } from "@/features/cashier/cashier-query";
import { createClient } from "@/utils/supabase/server";

export default async function CashierDashboard() {
  const t=await getTranslation();
  const db = await createClient();
  const { data, error } = await cashierTablesQuery(db);
  const settings=await db.from("restaurant_settings").select("counter_green_minutes,counter_yellow_minutes").eq("id",true).single();
  return <><Link className="primary-button" href="/cashier/counter">{t("Pedido de balcão")}</Link><CounterQueue greenMinutes={settings.data?.counter_green_minutes ?? 2} yellowMinutes={settings.data?.counter_yellow_minutes ?? 5} /><CashierBoard initialTables={data ?? []} initialError={!!error} /></>;
}
