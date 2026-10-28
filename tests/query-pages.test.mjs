import test from "node:test";
import assert from "node:assert/strict";
import { collectQueryPages } from "../src/lib/query-pages.ts";

test("operational pagination retains rows beyond the API default 1000-row ceiling", async () => {
  const source = Array.from({ length: 1251 }, (_, id) => ({ id }));
  const result = await collectQueryPages(async (from, to) => ({ data: source.slice(from, to + 1), error: null }));
  assert.deepEqual(result, { data: source, error: null });
});
test("a failed later page does not expose a partial operational queue as complete", async () => {
  const error = new Error("Connection lost");
  const result = await collectQueryPages(async from => from === 0
    ? { data: [1,2], error: null } : { data: null, error }, 2);
  assert.equal(result.data, null);
  assert.equal(result.error, error);
});
