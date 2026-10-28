import {resolveTarget,databaseTarget,authorizeOperation} from "../target-safety.mjs";
export function sqlTestDatabase() {
 const context=resolveTarget();authorizeOperation(context,"sql");
 if(context.profile!=="disposable")throw Error("SQL tests require an owned disposable target");
 return databaseTarget(context,process.env.SQL_TEST_DATABASE??context.database).database;
}
