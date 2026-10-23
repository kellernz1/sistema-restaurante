import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["src/features/whatsapp/**/*.test.ts"], environment: "node" } });
