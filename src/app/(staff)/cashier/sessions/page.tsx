import {requireStaff} from "@/lib/staff-api";
import {SessionsPanel} from "@/features/cash-sessions/sessions-panel";
import {z} from "zod";
import "@/features/cash-sessions/cash-sessions.css";
export default async function CashSessionsPage({searchParams}:{searchParams:Promise<{session?:string}>}){await requireStaff(["admin","cashier"]);const value=z.uuid().safeParse((await searchParams).session);return <SessionsPanel initialSession={value.success?value.data:""}/>;}
