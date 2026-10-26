import {describe,expect,it} from "vitest";
import {approvalFailureMessage} from "./pin-feedback";
import {createTranslator} from "@/lib/i18n/catalog";
describe("server-authoritative approval feedback",()=>{
 it("shows remaining attempts with singular and plural",()=>{
  expect(approvalFailureMessage({ok:false,code:"pin",attempts_remaining:4},s=>s)).toContain("Restam 4 tentativas");
  expect(approvalFailureMessage({ok:false,code:"pin",attempts_remaining:1},s=>s)).toContain("Resta 1 tentativa");
 });
 it("distinguishes approver lock from the actor rate limit",()=>{
  expect(approvalFailureMessage({ok:false,code:"locked",retry_after_seconds:900},s=>s)).toContain("bloqueado. Tente novamente em até 15 minutos");
  expect(approvalFailureMessage({ok:false,code:"locked",retry_after_seconds:1},s=>s)).toContain("até 1 minuto");
  expect(approvalFailureMessage({ok:false,code:"limited",retry_after_seconds:42},s=>s)).toContain("sua conta. Aguarde 42 segundos");
 });
 it("does not invent counters for unavailable or legacy responses",()=>{
  expect(approvalFailureMessage({ok:false,code:"unavailable"},s=>s)).toContain("não está disponível");
  expect(approvalFailureMessage({ok:false,code:"pin"},s=>s)).not.toContain("tentativas antes");
 });
 it("translates the same numeric feedback into Spanish",()=>{
  const t=createTranslator("es");
  expect(approvalFailureMessage({ok:false,code:"pin",attempts_remaining:2},t)).toContain("Quedan 2 intentos");
  expect(approvalFailureMessage({ok:false,code:"locked",retry_after_seconds:120},t)).toContain("2 minutos");
 });
});
