import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import readline from "node:readline";
import { Writable } from "node:stream";
import vm from "node:vm";
import ts from "typescript";
import { createSupabaseRotationStore } from "./credential-rotation-supabase.mjs";
import { rotateCredentials } from "./credential-rotation-core.mjs";

// Read-only maintenance preparation. No write/apply mode exists in this tool.
export function validatePreflightArguments(args) {
  if (args.length) throw new Error("This tool accepts no arguments and cannot perform rotation writes.");
}
export async function runRotationPreflight({ projectUrl, activeKeyId, maintenanceKey, vault, createStore = createSupabaseRotationStore }) {
  const store = await createStore({ projectUrl, maintenanceKey, allowWrites: false });
  return rotateCredentials({ store, vault, activeKeyId, apply: false });
}
async function loadVault(env) {
  if (!env.OPERATR_KEY_ENCRYPTION_SECRET?.trim()) throw new Error("The active encryption key is not configured.");
  const modules = {
    "server-only": {},
    "node:crypto": { createCipheriv, createDecipheriv, randomBytes },
    "@/lib/server/env": { assertCredentialVaultConfiguration() {}, getServerEnvironment: () => ({ encryptionSecret: env.OPERATR_KEY_ENCRYPTION_SECRET.trim() }) },
  };
  const source = await readFile(new URL("../src/lib/server/vault.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: (id) => modules[id], process: { env }, Buffer };
  vm.runInNewContext(code, context);
  return context.exports;
}
function promptSecret() {
  const output = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const reader = readline.createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolveSecret) => {
    process.stdout.write("Maintenance key for the intended project (hidden): ");
    reader.question("", (answer) => { process.stdout.write("\n"); reader.close(); resolveSecret(answer.trim()); });
  });
}
async function main() {
  validatePreflightArguments(process.argv.slice(2));
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Run this read-only check in an interactive terminal.");
  const projectUrl = process.env.ROTATION_PROJECT_URL?.trim();
  const expectedProjectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const activeKeyId = process.env.OPERATR_KEY_ENCRYPTION_KEY_ID?.trim() || "primary-v1";
  if (!projectUrl || !expectedProjectUrl || projectUrl !== expectedProjectUrl) throw new Error("Rotation target must explicitly match the intended project's configured URL.");
  const vault = await loadVault(process.env);
  const maintenanceKey = await promptSecret();
  const result = await runRotationPreflight({ projectUrl, activeKeyId, maintenanceKey, vault });
  console.log(`READ-ONLY preflight complete: ${result.scanned} scanned, ${result.current} already current, ${result.requiresRotation} need rotation.`);
  console.log("A scan is not a backup, a database-wide snapshot, or authorization to rotate credentials.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    // Only show messages generated locally, not raw service responses or values.
    const allowed = new Set(["This tool accepts no arguments and cannot perform rotation writes.", "Run this read-only check in an interactive terminal.", "The active encryption key is not configured.", "Rotation target must explicitly match the intended project's configured URL."]);
    console.error(allowed.has(error?.message) ? error.message : "Preflight did not complete. No rotation writes were attempted; review configuration and staging tests.");
    process.exitCode = 1;
  });
}
