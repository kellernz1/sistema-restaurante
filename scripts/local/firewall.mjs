import {isMain} from "./lib.mjs";
import {command} from "./operations-process.mjs";

export function firewallPlan(action="install"){
 if(!["install","remove"].includes(action))throw Error("Use install or remove");
 const ports=[54322,54323];
 const rules=[
  {name:"MesaCerta-LocalAdmin-IPv4",remote:["0.0.0.0-126.255.255.255","128.0.0.0-255.255.255.255"]},
  {name:"MesaCerta-LocalAdmin-IPv6",remote:["::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"]},
 ];
 const lines=["$ErrorActionPreference='Stop'","$admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)","if(-not $admin){throw 'Run the approved operation in an elevated PowerShell'}"];
 for(const rule of rules){
  lines.push(`$existing=Get-NetFirewallRule -Name '${rule.name}' -ErrorAction SilentlyContinue`);
  if(action==="remove")lines.push(`if($existing){Remove-NetFirewallRule -Name '${rule.name}' -ErrorAction Stop}`);
  else{
   const parameters=`-Direction Inbound -Action Block -Enabled True -Profile Any -Protocol TCP -LocalPort ${ports.join(",")} -RemoteAddress ${rule.remote.map(r=>"'"+r+"'").join(",")} -EdgeTraversalPolicy Block`;
   lines.push(`if($existing){Set-NetFirewallRule -Name '${rule.name}' ${parameters} -ErrorAction Stop}else{New-NetFirewallRule -Name '${rule.name}' -DisplayName '${rule.name}' -Group 'Mesa Certa local administration' ${parameters} -ErrorAction Stop | Out-Null}`);
  }
 }
 return {action,ports,preserved_lan_ports:[3000,54321],loopback_preserved:["127.0.0.0/8","::1"],rules,command:"powershell.exe",args:["-NoProfile","-NonInteractive","-Command",lines.join("; ")]};
}
export async function main(){
 const args=process.argv.slice(2);
 if(args.some(arg=>!["install","remove","--dry-run","--apply"].includes(arg))||(args.includes("install")&&args.includes("remove")))throw Error("Use install or remove with --dry-run or --apply");
 const action=process.argv.includes("remove")?"remove":"install",plan=firewallPlan(action);
 console.log(JSON.stringify(plan,null,2));
 if(process.argv.includes("--dry-run")||!process.argv.includes("--apply")){console.log("DRY RUN: no firewall or Windows configuration changed.");return;}
 if(process.platform!=="win32")throw Error("Windows required");
 await command(plan.command,plan.args);
 console.log("Owned firewall rules updated. Verify loopback access and rejection from a separate LAN device before acceptance.");
}
if(isMain(import.meta.url))main().catch(()=>{console.error("Firewall command failed; inspect owned rules locally. No global firewall policy was changed by this command.");process.exitCode=1;});
