import { verifyHistory } from "./migration-history.mjs";
try {
  const result=await verifyHistory();
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
} catch(error){console.error(`History verification unavailable: ${error.message}`);process.exitCode=2;}
