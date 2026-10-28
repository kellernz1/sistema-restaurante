import {databaseSql,createBackup,copyExternal} from "../scripts/target-operations.mjs";
import type {TargetContext} from "../scripts/target-safety.mjs";
export function targetTypeContract(context:TargetContext){
 void databaseSql(context,"select 1");
 // @ts-expect-error Raw container names are not capabilities.
 void databaseSql("supabase_db_sistema-restaurante","postgres","select 1");
 // @ts-expect-error A plain object cannot forge the private target brand.
 void createBackup({profile:"disposable"});
 // @ts-expect-error Backup callers cannot override the context database.
 void createBackup(context,{database:"postgres"});
 // @ts-expect-error A free directory string is not an owned directory capability.
 void copyExternal(context,"backup.dump","C:/foreign-backups");
}
