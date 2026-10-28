import test from "node:test";
import assert from "node:assert/strict";
import { preparePerformanceFixture, comparePerformanceVisibility, runDatabasePerformance } from "../scripts/local/db-performance.mjs";

test("performance fixtures and migration comparisons reject ordinary installations before any operation", async () => {
  for (const profile of ["development", "production", undefined]) {
    const target = { profile };
    await assert.rejects(() => preparePerformanceFixture(target, 20, false));
    await assert.rejects(() => comparePerformanceVisibility(target));
    await assert.rejects(() => runDatabasePerformance(target));
  }
});
