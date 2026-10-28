import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { ESLint } from "eslint";
import ts from "typescript";

test("script lint rejects a missing import without executing the script", async () => {
  const eslint = new ESLint({ cwd: path.resolve(import.meta.dirname, "..") });
  for (const filePath of ["scripts/missing-import-regression.mjs", "scripts/local/missing-import-regression.mjs"]) {
    const [broken] = await eslint.lintText("resolveTarget();\n", { filePath });
    assert.ok(broken.messages.some(message => message.ruleId === "no-undef"), filePath);
  }
  const [valid] = await eslint.lintText("const resolved = process.cwd();\nconsole.log(resolved);\n", {
    filePath: "scripts/local/defined-identifier-regression.mjs",
  });
  assert.equal(valid.errorCount, 0, "Node globals and defined bindings must remain valid");
});

test("every script relative import and re-export resolves to an existing file", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const failures = [];
  function scan(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { scan(file); continue; }
      if (!file.endsWith(".mjs")) continue;
      const ast = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      for (const node of ast.statements) {
        if (!(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ||
            !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
        const specifier = node.moduleSpecifier.text;
        if (specifier.startsWith(".") && !fs.existsSync(path.resolve(path.dirname(file), specifier))) {
          failures.push({ file: path.relative(root, file), specifier });
        }
      }
    }
  }
  scan(path.join(root, "scripts"));
  assert.deepEqual(failures, []);
});
