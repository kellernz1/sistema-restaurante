import {z} from "zod";
import {MAX_MONEY} from "../../lib/money.ts";
const amount=z.number().int().min(0).max(MAX_MONEY);
const reason=z.string().trim().min(1).max(500);
export const cashCommandSchema=z.discriminatedUnion("action",[
 z.strictObject({action:z.literal("open"),request_id:z.uuid(),payload:z.strictObject({opening_amount:amount})}),
 z.strictObject({action:z.literal("movement"),request_id:z.uuid(),payload:z.strictObject({session_id:z.uuid(),kind:z.enum(["supply","withdrawal"]),amount:amount.min(1),reason})}),
 z.strictObject({action:z.literal("close"),request_id:z.uuid(),payload:z.strictObject({session_id:z.uuid(),counted_amount:amount,notes:z.string().max(500).optional(),denominations:z.array(z.strictObject({value:amount.min(1),quantity:z.number().int().min(0).max(100000)})).max(30).optional()})}),
 z.strictObject({action:z.literal("reopen"),request_id:z.uuid(),payload:z.strictObject({session_id:z.uuid(),reason})}),
]);
export const cashPolicySchema=z.strictObject({require_open_session:z.boolean(),blind_count:z.boolean(),single_open_session:z.boolean().optional()});
