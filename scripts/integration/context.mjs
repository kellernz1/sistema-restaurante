import fs from "node:fs";
import path from "node:path";
import {fileURLToPath}from "node:url";

export function integrationContext(env=process.env){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
 const directory=env.INTEGRATION_RUN_DIR;
 if(!directory||path.dirname(path.resolve(directory))!==path.join(root,"artifacts","integration")||!/^[a-f0-9]{24}$/.test(path.basename(directory)))throw Error("Integration tests require the disposable runner; use npm run test:integration. Development targets are forbidden.");
 const marker=JSON.parse(fs.readFileSync(path.join(directory,"owner.json"),"utf8"));
 if(!marker.active||marker.nonce!==env.INTEGRATION_NONCE||marker.project!==`mesa-it-${path.basename(directory)}`)throw Error("Integration ownership mismatch or expired instance");
 if(!Number.isInteger(marker.dbPort)||marker.dbPort!==marker.apiPort+1||marker.dbPort===54322)throw Error("Unsafe integration database port");
 for(const [key,port]of [["PUBLIC_TEST_URL",marker.appPort],["NEXT_PUBLIC_APP_URL",marker.appPort],["NEXT_PUBLIC_SUPABASE_URL",marker.apiPort]])if(env[key]!==`http://127.0.0.1:${port}`||[3000,54321,54322].includes(port))throw Error(`Unsafe integration target: ${key}`);
 return marker;
}
