"use client";
import Link from "next/link";
import type { MouseEvent } from "react";
import { useTranslation } from "@/components/language-provider";
import { administrationGroups } from "./administration-destinations";
import { isCurrentDestination, type NavigationModes } from "./navigation";

export default function AdministrationNavigation({modes,pathname,hash,navigate}:{modes:NavigationModes|null;pathname:string;hash:string;navigate:(event:MouseEvent<HTMLAnchorElement>)=>void}) {
  const t=useTranslation();
  return administrationGroups(modes).map(group=><section key={group.label}><h2>{t(group.label)}</h2>{group.destinations.map(entry=><Link key={entry.id} href={entry.href} prefetch={false} data-destination={entry.id} aria-current={isCurrentDestination(entry,pathname,hash)?"page":undefined} onClick={navigate}>{t(entry.label)}</Link>)}</section>);
}
