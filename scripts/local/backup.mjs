export * from "../target-operations.mjs";
import {isMain} from "./lib.mjs";
import {resolveTarget,guardEntry} from "../target-safety.mjs";
import {createBackup} from "../target-operations.mjs";
if(isMain(import.meta.url)){await guardEntry(import.meta.url,"backup");await createBackup(resolveTarget());}
