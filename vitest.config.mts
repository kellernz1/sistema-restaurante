import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({ resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } }, test: { include: ["src/features/whatsapp/**/*.test.ts", "src/lib/i18n/**/*.test.ts"], environment: "node" } });
