import { publicJson } from "@/lib/public-table-api";
export async function GET() {return publicJson({error:"Atualize a página para usar a nova fila de impressão."},410);}
export const POST=GET;
