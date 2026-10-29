"use client";

import { usePathname } from "next/navigation";
import { isStaffRoute } from "@/lib/auth";
import { LanguagePicker } from "./language-picker";
import { ThemePicker } from "./theme-picker";

// Public pages keep preferences and their independent cart; never mount staff auth.
export function PublicPreferences() {
  const pathname = usePathname();
  if (isStaffRoute(pathname)) return null;
  return <div className="interface-preferences"><LanguagePicker /><ThemePicker /></div>;
}
