import type { TargetContext } from "../../target-safety.mjs";
export type FileOptions = { purpose?: string; platform?: string; wait?: (ms: number) => Promise<unknown>; io?: typeof import("node:fs/promises") };
export const fileRetryDelays: readonly number[];
export function retryOperationalFile<T>(context: TargetContext, file: string, operation: () => Promise<T>, options?: FileOptions): Promise<T>;
export function serializeOperationalFile<T>(context: TargetContext, file: string, operation: () => T | Promise<T>, options?: FileOptions): Promise<T>;
export function writeOperationalJson(context: TargetContext, file: string, value: unknown, options?: FileOptions): Promise<void>;
export function patchOperationalState(context: TargetContext, value: Record<string, unknown>, options?: FileOptions): Promise<void>;
export function removeOperationalFile(context: TargetContext, file: string, options?: FileOptions): Promise<void>;
export function createOperationalLogger(context: TargetContext, options?: FileOptions & { maximum?: number; copies?: number; maximumPending?: number }): (name: string, text: string) => Promise<void>;
