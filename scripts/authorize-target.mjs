import {resolveTarget,authorizeAutomation} from "./target-safety.mjs";
const context=resolveTarget();
const index=process.argv.indexOf("--operations");
if(index<0)throw Error("Specify --operations backup or --operations backup,runtime");
authorizeAutomation(context,process.argv[index+1].split(","));
console.log("Installation-bound automation authorization saved. No credentials printed.");
