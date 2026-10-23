import { executable, run } from "./local/lib.mjs";

run(executable("npm"), ["run", "test:whatsapp"]);
run(executable("npm"), ["run", "test:smoke"]);
