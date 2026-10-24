import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["src/features/whatsapp/**/*.test.ts", "src/lib/i18n/**/*.test.ts"], environment: "node" } });
