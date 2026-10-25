import {requireStaff} from "@/lib/staff-api";
import {CashDayPanel} from "@/features/cash-sessions/day-panel";
import "@/features/cash-sessions/cash-sessions.css";
export default async function ReportsPage(){await requireStaff(["admin"]);return <CashDayPanel/>;}
