import { command } from "./operations-process.mjs";

export function assertIsolated(database) {
  if(!/^mesa_(history|clean)_[a-f0-9]{24}$/.test(database))throw new Error("Unsafe isolated database name");
}
export async function databaseSql(container,database,source) {
  return command("docker",["exec","-i",container,"psql","-X","-U","supabase_admin","-d",database,"-At","-v","ON_ERROR_STOP=1"],{input:source,timeout:120000});
}
export async function createIsolatedDatabase(container,database) {
  assertIsolated(database);
  await command("docker",["exec",container,"createdb","-U","postgres","--template=template0",database]);
  // Only provider-owned prerequisites are copied. No public application objects or data are copied.
  const auth=await command("docker",["exec",container,"pg_dump","-U","supabase_admin","-d","postgres","--schema-only","--section=pre-data","--schema=auth"]);
  await databaseSql(container,database,`create schema extensions; create publication supabase_realtime;
    ${auth}
    alter table auth.users add primary key(id);
    grant all on all tables in schema auth to postgres;
    grant all on all sequences in schema auth to postgres;
    grant all on all functions in schema auth to postgres;
    grant usage on schema public,auth,extensions to postgres,anon,authenticated,service_role;
    alter default privileges for role postgres in schema public grant all on tables to postgres,anon,authenticated,service_role;
    alter default privileges for role postgres in schema public grant all on functions to postgres,anon,authenticated,service_role;
    alter default privileges for role postgres in schema public grant all on sequences to postgres,anon,authenticated,service_role;
    alter default privileges for role supabase_admin in schema public grant all on tables to postgres,anon,authenticated,service_role;
    alter default privileges for role supabase_admin in schema public grant all on functions to postgres,anon,authenticated,service_role;
    alter default privileges for role supabase_admin in schema public grant all on sequences to postgres,anon,authenticated,service_role;
  `);
}
export async function dropIsolatedDatabase(container,database) {
  assertIsolated(database);
  await command("docker",["exec",container,"dropdb","-U","postgres","--if-exists",database]);
}
