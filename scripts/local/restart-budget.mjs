export class RestartBudget {
  attempts = {};
  take(name) {
    const count=this.attempts[name]??0;
    if(count>=5)return null;
    this.attempts[name]=count+1;
    return Math.min(30000,(count+1)*3000);
  }
}
export function backupReason(state,policy,lastAttempt,latestClose,now=Date.now()) {
  if(now-lastAttempt<60000)return null;
  const success=state.last_success?Date.parse(state.last_success):NaN;
  if(!Number.isFinite(success)||now-success>policy.interval_hours*3600000)return "interval";
  if(policy.after_cash_close&&latestClose&&Date.parse(latestClose)>success)return "cash-close";
  return null;
}
