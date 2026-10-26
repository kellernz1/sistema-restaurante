import { executable, run } from "./local/lib.mjs";

run(executable("npm"), ["run", "check:text"]);
run(executable("npm"), ["run", "test:whatsapp"]);
run(executable("npm"), ["run", "test:smoke"],{env:{INTEGRATION_VALIDATE_SQL:"true"}});
