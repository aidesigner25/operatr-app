import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const run = promisify(execFile);
export function assessSharedLimiter(controlA, controlB, batchA, batchB) {
  if (controlA !== true || controlB !== true) throw new Error("INCONCLUSIVE: one or both workers could not use the configured shared limiter.");
  const combined = [...batchA, ...batchB];
  if (combined.length !== 6 || combined.some((v) => typeof v !== "boolean")) throw new Error("INCONCLUSIVE: unexpected worker results.");
  const allowed = combined.filter(Boolean).length;
  if (allowed !== 4) throw new Error(`FAIL or INCONCLUSIVE: expected four allowed and two blocked, got ${allowed} allowed.`);
  return { allowed, blocked: 6 - allowed };
}

async function worker(key, count, limit) {
  const [{ readFile }, { createHash }, vm, ts] = await Promise.all([import("node:fs/promises"), import("node:crypto"), import("node:vm"), import("typescript")]);
  const source = await readFile(new URL("../src/lib/server/rate-limit.ts", import.meta.url), "utf8");
  const code = ts.default.transpileModule(source, { compilerOptions: { module: ts.default.ModuleKind.CommonJS, target: ts.default.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: (id) => id === "node:crypto" ? { createHash } : {}, process, URL, AbortSignal, fetch, Date, Map, Number };
  vm.default.runInNewContext(code, context);
  const answers = [];
  for (let i = 0; i < count; i++) answers.push(await context.exports.allowRequest(key, limit, 60_000));
  process.stdout.write(JSON.stringify(answers));
}

async function main() {
  const url = process.env.OPERATR_REDIS_REST_URL?.trim();
  const token = process.env.OPERATR_REDIS_REST_TOKEN?.trim();
  if (!url || !token) throw new Error("INCONCLUSIVE: configure the Redis REST URL and token in .env.local first.");
  const unique = `shared-test:${randomUUID()}`;
  const path = fileURLToPath(import.meta.url);
  async function child(key, count, limit) {
    const { stdout } = await run(process.execPath, [path, "--worker", key, String(count), String(limit)], { timeout: 30_000, maxBuffer: 4096 });
    return JSON.parse(stdout);
  }
  const [controlA, controlB] = await Promise.all([child(`${unique}:control-a`, 1, 4), child(`${unique}:control-b`, 1, 4)]);
  if (controlA[0] !== true || controlB[0] !== true) throw new Error("INCONCLUSIVE: workers could not reach the configured shared limiter.");
  const [batchA, batchB] = await Promise.all([child(`${unique}:shared`, 3, 4), child(`${unique}:shared`, 3, 4)]);
  const result = assessSharedLimiter(controlA[0], controlB[0], batchA, batchB);
  const [afterA, afterB] = await Promise.all([child(`${unique}:after-a`, 1, 4), child(`${unique}:after-b`, 1, 4)]);
  if (afterA[0] !== true || afterB[0] !== true) throw new Error("INCONCLUSIVE: a worker lost access to the shared limiter during the test.");
  console.log(`PASS: two independent processes shared a limit: ${result.allowed} allowed, ${result.blocked} blocked.`);
  console.log("Temporary counters expire automatically after one minute.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const task = process.argv[2] === "--worker" ? worker(process.argv[3], Number(process.argv[4]), Number(process.argv[5])) : main();
  task.catch((error) => {
    const message = error instanceof Error ? error.message : "";
    console.error(/^(INCONCLUSIVE|FAIL or INCONCLUSIVE):/.test(message) ? message : "INCONCLUSIVE: limiter check could not complete. Verify Redis configuration and network access.");
    process.exitCode = 1;
  });
}
