"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect,useRef} from "react";
import {LayoutDashboard,ShoppingBag,WalletCards} from "lucide-react";
import {useTranslation} from "@/components/language-provider";
import "./cashier-navigation.css";

export function CashierNavigation({counterEnabled,tablesEnabled}:{counterEnabled:boolean;tablesEnabled:boolean}){
 const t=useTranslation(),pathname=usePathname(),nav=useRef<HTMLElement>(null);
 useEffect(()=>{
  const element=nav.current,header=document.querySelector<HTMLElement>(".staff-header"),container=element?.closest<HTMLElement>(".staff-content");
  if(!element||!header||!container)return;
  const update=()=>{const height=header.getBoundingClientRect().height;container.style.setProperty("--cashier-header-height",`${height}px`);container.style.setProperty("--cashier-sticky-bottom",`${height+element.getBoundingClientRect().height+12}px`);};
  const observer=new ResizeObserver(update);observer.observe(header);observer.observe(element);update();
  return()=>{observer.disconnect();container.style.removeProperty("--cashier-header-height");container.style.removeProperty("--cashier-sticky-bottom");};
 },[]);
 const entries=[{href:"/cashier",label:tablesEnabled?"Caixa e mesas":"Caixa",icon:LayoutDashboard},...(counterEnabled?[{href:"/cashier/counter",label:"Pedido de balcão",icon:ShoppingBag}]:[]),{href:"/cashier/sessions",label:"Turnos de caixa",icon:WalletCards}];
 const active=pathname.startsWith("/cashier/counter")?"/cashier/counter":pathname.startsWith("/cashier/sessions")?"/cashier/sessions":"/cashier";
 return <nav className="cashier-workspace-nav" ref={nav} aria-label={t("Navegação do caixa")}><span className="cashier-nav-caption">{t("Operação do caixa")}</span><div className="cashier-workspace-tabs">{entries.map(({href,label,icon:Icon})=><Link key={href} href={href} aria-current={active===href?"page":undefined}><Icon size={19} aria-hidden="true"/><span>{t(label)}</span></Link>)}</div></nav>;
}
