import {integrationContext}from "../../scripts/integration/context.mjs";
export const assertIntegrationEnvironment=integrationContext;
if(process.env.PUBLIC_TEST_URL||process.env.NEXT_PUBLIC_SUPABASE_URL)assertIntegrationEnvironment();
