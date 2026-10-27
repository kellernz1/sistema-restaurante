import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {licenseErrors,licenseImportError,publicKeyConfiguration,validLicenseEnvelope} from "../src/features/licensing/validation.ts";

test("public key validation returns only state, never configuration contents",()=>{
 assert.equal(publicKeyConfiguration(undefined),"missing");
 assert.equal(publicKeyConfiguration("  "),"missing");
 assert.equal(publicKeyConfiguration("not-a-key"),"invalid");
 assert.equal(publicKeyConfiguration("a".repeat(63)),"invalid");
 assert.equal(publicKeyConfiguration("g".repeat(64)),"invalid");
 assert.equal(publicKeyConfiguration("A".repeat(64)),"valid");
});

test("license envelope rejects empty input, commands, incomplete signatures and oversized files",()=>{
 for(const value of ["","test","payload.signature","notepad file","a".repeat(12001)])assert.equal(validLicenseEnvelope(value),false);
 assert.equal(validLicenseEnvelope("e30."+"a".repeat(86)),true);
});

test("license errors distinguish causes without returning database details or input values",()=>{
 for(const [message,key]of [["Invalid license envelope","format"],["Invalid license signature or trust key","signature"],["License installation mismatch","installation"],["Older license rejected","older"],["Trust key rotation requires owner maintenance","differentKey"],["Ed25519 public key required","invalidKey"],["Invalid license claims","claims"]])assert.equal(licenseImportError({message}),licenseErrors[key]);
 assert.equal(licenseImportError({message:"Untrusted database detail"}),licenseErrors.refused);
});

test("Git ignores nested private material, issued licenses and environment variants",()=>{
 const paths=["sample.pem","nested/sample.key","nested/private-key.json","nested/license.license","nested/license.license.txt","nested/config.env","nested/.env.local.backup","owner-tools/licensing/registry.json"];
 const result=spawnSync("git",["check-ignore","--no-index","--",...paths],{encoding:"utf8",windowsHide:true});
 assert.equal(result.status,0);assert.deepEqual(result.stdout.trim().split(/\r?\n/),paths);
 const example=spawnSync("git",["check-ignore","--no-index","--",".env.example"],{encoding:"utf8",windowsHide:true});assert.equal(example.status,1);
});
