import type {SupabaseClient}from "@supabase/supabase-js";
import type {Database,Json}from "../src/types/database.types";
export function renewLicense(db:SupabaseClient<Database>,options?:{force?:boolean;publicKey?:string}):Promise<{attempted:boolean;failed?:boolean;status?:Json}>;
export function verifyLicenseToken(token:string,hex:string):Record<string,unknown>;
