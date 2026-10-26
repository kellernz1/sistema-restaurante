export function normalizeCounterName(value: string): string | null {
  const name = value.replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim();
  if ([...name].length > 30) throw new Error("Counter name exceeds 30 characters");
  return name || null;
}
export function discountBasisPoints(value:string){
 if(!/^\d+(?:\.\d{1,2})?$/.test(value))throw new Error("Invalid discount percentage");
 const [whole,fraction=""]=value.split(".");
 const result=Number(whole)*100+Number(fraction.padEnd(2,"0"));
 if(!Number.isSafeInteger(result)||result<1||result>10000)throw new Error("Invalid discount percentage");
 return result;
}
export function counterWaitTone(readyAt: string, now: number, greenMinutes = 2, yellowMinutes = 5) {
  const elapsed = Math.max(0, now - Date.parse(readyAt));
  if (!Number.isFinite(elapsed)) return "red";
  return elapsed <= greenMinutes * 60000 ? "green" : elapsed <= yellowMinutes * 60000 ? "yellow" : "red";
}
