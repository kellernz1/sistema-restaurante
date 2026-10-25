import {MAX_MONEY} from "../../lib/money.ts";
export function cashExpected(opening:number,cashNet:number,supply:number,withdrawal:number){
 for(const value of [opening,cashNet,supply,withdrawal])if(!Number.isSafeInteger(value)||value<0||value>MAX_MONEY)throw new Error("Invalid cash amount");
 const result=opening+cashNet+supply-withdrawal;if(!Number.isSafeInteger(result)||Math.abs(result)>MAX_MONEY)throw new Error("Cash balance exceeds limit");return result;
}
export function denominationTotal(rows:{value:number;quantity:number}[]){
 let total=0;for(const row of rows){if(!Number.isSafeInteger(row.value)||row.value<1||row.value>MAX_MONEY||!Number.isSafeInteger(row.quantity)||row.quantity<0||row.quantity>100000)throw new Error("Invalid denomination");total+=row.value*row.quantity;}
 if(!Number.isSafeInteger(total)||total>MAX_MONEY)throw new Error("Count exceeds limit");return total;
}
export function canRevealExpected(blind:boolean,counted:number|null){return !blind||counted!==null;}
