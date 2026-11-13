#!/usr/bin/env node
// Starts gateway (app/server, :8787) and console (app/web, :5173) together. Ctrl+C stops both.
import { spawn } from "node:child_process";

const procs = [
  ["server", "app/server", ["run", "dev"]],
  ["web", "app/web", ["run", "dev"]],
].map(([name, cwd, args]) => {
  const p = spawn("bun", args, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });
  const tag = (d) => process.stdout.write(String(d).replace(/^(?=.)/gm, `[${name}] `));
  p.stdout.on("data", tag);
  p.stderr.on("data", tag);
  p.on("exit", (code) => {
    console.log(`[${name}] exited ${code}`);
    procs.forEach((q) => q.kill());
    process.exit(code ?? 1);
  });
  return p;
});
process.on("SIGINT", () => procs.forEach((p) => p.kill()));
