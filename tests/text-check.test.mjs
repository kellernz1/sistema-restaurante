import assert from "node:assert/strict";
import test from "node:test";
import {textProblems} from "../scripts/check-text.mjs";

test("text guard detects replacement, mojibake and damaged accents",()=>{
  for(const value of ["Relat?rios","Observa??o","bad\uFFFD","caf\u00c3\u00a9","a\u00e2\u20ac\u2122"])
    assert.ok(textProblems(value).length,value);
});
test("text guard accepts accents, punctuation, URLs and code outside strings",()=>{
  for(const value of ["Relatórios", "¿Cómo desea pagar?", "Troco para quanto?", "https://site.test/path?token=value", "/orders?day=today", "value ? left : right"])
    assert.deepEqual(textProblems(value),[],value);
});
