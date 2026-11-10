import { readFile } from "node:fs/promises";
import readline from "node:readline";
import { Writable } from "node:stream";
import { runIsolatedRotationTest } from "./rotation-isolated-e2e.mjs";

async function configuredAppUrl() {
  // Read the local config, but extract only the public project URL; never print other values.
  const source = await readFile(new URL("../.env.local", import.meta.url), "utf8");
  const lines = source.split(/\r?\n/).filter((line) => /^\s*NEXT_PUBLIC_SUPABASE_URL\s*=/.test(line));
  if (lines.length !== 1) throw new Error("Could not uniquely identify the current Operatr Supabase URL in .env.local.");
  const match = /^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*(['"]?)(https:\/\/[^\s'"#]+)\1\s*(?:#.*)?$/.exec(lines[0]);
  if (!match) throw new Error("Could not safely parse the current Operatr Supabase URL.");
  return match[2];
}
function promptTerminal() {
  let muted = false;
  const output = new Writable({ write(chunk, _encoding, done) { if (!muted) process.stdout.write(chunk); done(); } });
  const reader = readline.createInterface({ input: process.stdin, output, terminal: true });
  return { ask(label, hidden = false) { return new Promise((resolve) => { process.stdout.write(label); muted = hidden; reader.question("", (answer) => { muted = false; if (hidden) process.stdout.write("\n"); resolve(answer.trim()); }); }); }, close() { reader.close(); } };
}
async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Run this test in an interactive terminal.");
  const appUrl = await configuredAppUrl();
  const cli = promptTerminal();
  let stagingUrl, stagingPublishable, stagingSecret;
  try {
    stagingUrl = await cli.ask("DISPOSABLE test-project URL: ");
    // Refuse to prompt for any test keys if the project is obviously the app.
    if (new URL(stagingUrl).origin === new URL(appUrl).origin) throw new Error("STOP: The test project matches your configured Operatr project.");
    stagingPublishable = await cli.ask("DISPOSABLE project publishable key (hidden): ", true);
    stagingSecret = await cli.ask("DISPOSABLE project secret key (hidden): ", true);
  } finally { cli.close(); }
  await runIsolatedRotationTest({ stagingUrl, appUrl, stagingPublishable, stagingSecret });
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Isolated test unavailable."); process.exitCode = 1; });
