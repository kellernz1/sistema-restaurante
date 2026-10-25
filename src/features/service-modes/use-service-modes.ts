"use client";
import {useEffect,useState} from "react";
import {createClient} from "@/utils/supabase/client";
export function useServiceModes(){
 const [value,setValue]=useState<{counter_enabled:boolean;uses_waiter:boolean;dine_in_qr_enabled:boolean;pickup_enabled:boolean;delivery_enabled:boolean}|null>(null);
 useEffect(()=>{let alive=true;const db=createClient();async function load(){const policy=await db.from("service_policy").select("counter_enabled,uses_waiter").single();const profile=await db.auth.getUser();const role=profile.data.user?await db.from("profiles").select("role").eq("id",profile.data.user.id).single():null;if(role?.data?.role==="waiter"&&!policy.data?.uses_waiter){if(alive&&policy.data)setValue({...policy.data,dine_in_qr_enabled:false,pickup_enabled:false,delivery_enabled:false});return;}const modes=await db.from("restaurant_settings").select("dine_in_qr_enabled,pickup_enabled,delivery_enabled").single();if(alive&&policy.data&&modes.data)setValue({...policy.data,...modes.data});}void load();window.addEventListener("service-modes-changed",load);const timer=setInterval(()=>void load(),15000);return()=>{alive=false;clearInterval(timer);window.removeEventListener("service-modes-changed",load);};},[]);
 return value;
}
