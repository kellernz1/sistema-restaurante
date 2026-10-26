import path from "node:path";
import { command } from "./operations-process.mjs";
import { isMain, ROOT } from "./lib.mjs";

export function taskPlan(action, root=ROOT, node=process.execPath) {
  if(!["install","remove"].includes(action))throw new Error("Use install or remove");
  const name="MesaCertaLocal";
  const literal=value=>"'"+value.replace(/'/g,"''")+"'";
  const script=path.join(root,"scripts/local/start.mjs");
  const source=action==="remove"
    ? `if(Get-ScheduledTask -TaskName '${name}' -ErrorAction SilentlyContinue){Unregister-ScheduledTask -TaskName '${name}' -Confirm:$false -ErrorAction Stop}`
    : `$user=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name; $action=New-ScheduledTaskAction -Execute ${literal(node)} -Argument ${literal('"'+script+'"')} -WorkingDirectory ${literal(root)}; $trigger=New-ScheduledTaskTrigger -AtLogOn -User $user; $principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited; $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10); Register-ScheduledTask -TaskName '${name}' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force -ErrorAction Stop`;
  return {task:name,action,command:"powershell.exe",args:["-NoProfile","-NonInteractive","-Command",source]};
}
if(isMain(import.meta.url)) {
  const plan=taskPlan(process.argv[2]);
  console.log(JSON.stringify(plan,null,2));
  if(process.argv.includes("--dry-run"))console.log("DRY RUN: no Windows configuration changed.");
  else {
    if(process.platform!=="win32")throw new Error("Windows required");
    await command(plan.command,plan.args);
  }
}
