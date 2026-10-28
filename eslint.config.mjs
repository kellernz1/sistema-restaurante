import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    files: ["scripts/**/*.mjs"],
    rules: { "no-undef": "error" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "logs/**", ".local-secrets/**", "backups/**", "artifacts/**"]),
]);
