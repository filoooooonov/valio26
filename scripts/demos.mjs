#!/usr/bin/env node
// Starts the gateway (:8787), the console (:5173) and every demos/<key> app (if any exist).
// Services already listening are reused, not restarted. Ctrl+C stops what this script started.
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

const up = async (url) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return r.status < 500;
  } catch {
    return false;
  }
};

const services = [
  {
    name: "gateway",
    cwd: "app/server",
    url: "http://localhost:8787/api/health",
  },
  { name: "console", cwd: "app/web", url: "http://localhost:5173/" },
];
if (existsSync("demos")) {
  readdirSync("demos", { withFileTypes: true })
    .filter(
      (d) => d.isDirectory() && existsSync(`demos/${d.name}/package.json`),
    )
    .forEach((d, i) =>
      services.push({
        name: d.name,
        cwd: `demos/${d.name}`,
        url: `http://localhost:${5201 + i}/`,
        port: 5201 + i,
      }),
    );
}

const started = [];
for (const s of services) {
  if (await up(s.url)) {
    console.log(`[${s.name}] already running at ${s.url}`);
    continue;
  }
  const args = [
    "run",
    "dev",
    ...(s.port ? ["--", "--port", String(s.port), "--strictPort"] : []),
  ];
  const p = spawn("bun", args, {
    cwd: s.cwd,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tag = (d) =>
    process.stdout.write(String(d).replace(/^(?=.)/gm, `[${s.name}] `));
  p.stdout.on("data", tag);
  p.stderr.on("data", tag);
  p.on("exit", (code) => console.log(`[${s.name}] exited ${code}`));
  started.push(p);
  console.log(`[${s.name}] starting at ${s.url}`);
}
if (!started.length) console.log("everything already running");
process.on("SIGINT", () => {
  started.forEach((p) => p.kill());
  process.exit(0);
});
if (!started.length) process.exit(0);
