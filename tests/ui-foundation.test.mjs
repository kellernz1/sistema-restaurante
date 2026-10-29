import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync(new URL("../src/app/ui-foundation.css", import.meta.url), "utf8");
function contrast(a, b) {
  const luminance = color => color.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
const color = (block, name) => {
  const value = block.match(new RegExp(`--${name}: (#[a-f0-9]{6})`))?.[1];
  assert.ok(value, `Missing opaque token ${name}`);
  return value;
};
test("light and dark semantic text/state tokens meet normal-text contrast", () => {
  const light = css.slice(css.indexOf("html:root {"), css.indexOf("@media (prefers-color-scheme"));
  const dark = css.slice(css.indexOf('html:root[data-theme="dark"]'));
  for (const block of [light, dark]) {
    for (const state of ["success", "warning", "danger", "info"]) assert.ok(contrast(color(block, `${state}-text`), color(block, `${state}-bg`)) >= 4.5, `${state} failed AA`);
    assert.ok(contrast(color(block, "text-primary"), color(block, "canvas")) >= 4.5);
    assert.ok(contrast(color(block, "text-secondary"), color(block, "canvas")) >= 4.5);
    assert.ok(contrast(color(block, "restaurant-accent-text"), color(block, "canvas")) >= 4.5);
  }
  assert.ok(contrast(color(light, "on-action"), color(light, "restaurant-accent")) >= 4.5);
});
test("catalog source is excluded from the restaurant route tree", () => {
  assert.equal(fs.existsSync(new URL("../src/app/dev/ui-kit/page.tsx", import.meta.url)), false);
  assert.equal(fs.existsSync(new URL("../dev/ui-catalog/page.tsx", import.meta.url)), true);
});
test("visual checks load only the validated disposable environment", () => {
  const visual = fs.readFileSync(new URL("../scripts/visual-smoke.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(visual, /loadEnvFile\(\)/);
  assert.match(visual, /loadEnvFile\(path\.join\(target\.root/);
});
