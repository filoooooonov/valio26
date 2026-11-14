#!/usr/bin/env node
// Demo video from a plain-English script.  See tools/demo-video/README.md.
//   node tools/demo-video/make.mjs tools/demo-video/scripts/pitch.md            record + render
//   … --render-only        re-render the last recording after editing holds, zooms, cuts, notes (seconds, no browser)
//   … --until "Scene"      record only up to that scene
//   … --dry                parse and print the plan
//   … --captions           burn scene titles as lower thirds
import { readFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { parseScript, describe, ScriptError } from "./lib/script.mjs";

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const value = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = args.find(
  (a, i) => !a.startsWith("--") && args[i - 1] !== "--until",
);
if (!file) {
  console.error(
    'Usage: node tools/demo-video/make.mjs <script.md> [--render-only] [--until "Scene"] [--dry] [--captions]',
  );
  process.exit(2);
}
const path = resolve(file);
if (!existsSync(path)) {
  console.error(`No such script: ${path}`);
  process.exit(2);
}

const root = resolve(import.meta.dirname, "../..");
const name = basename(path).replace(/\.md$/, "");
const outDir = resolve(
  root,
  process.env.DEMO_VIDEO_OUT ?? `artifacts/demo-video/${name}`,
);
const fmt = (s) =>
  s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m${Math.round(s % 60)}s`;

try {
  const script = parseScript(readFileSync(path, "utf8"), file);
  if (flag("--dry")) {
    console.log(describe(script));
    process.exit(0);
  }
  let recordSeconds = 0;
  if (!flag("--render-only")) {
    const { record } = await import("./lib/recorder.mjs");
    const t = Date.now();
    const rec = await record(script, { outDir, until: value("--until") });
    recordSeconds = (Date.now() - t) / 1000;
    console.log(
      `● recorded ${rec.frames.length} frames in ${fmt(recordSeconds)}`,
    );
  }
  const { render } = await import("./lib/renderer.mjs");
  const r = await render(script, { outDir, captions: flag("--captions") });
  console.log(
    `● rendered ${fmt(r.duration)} video (${r.parts} part${r.parts > 1 ? "s" : ""}) in ${fmt(r.renderSeconds)}`,
  );
  for (const c of r.cues)
    console.log(`   ${c.from.toFixed(1).padStart(6)}s  ${c.title}`);
  if (r.duration > 120)
    console.log(
      `⚠ over 2:00 — trim holds or add ", cut" to waits, then --render-only`,
    );
  console.log(
    `\n  video      ${resolve(outDir, "video.mp4")}\n  voiceover  ${resolve(outDir, "voiceover.md")}\n  subtitles  ${resolve(outDir, "captions.srt")}`,
  );
} catch (e) {
  if (e instanceof ScriptError) {
    console.error(`✖ ${e.message}`);
    process.exit(1);
  }
  throw e;
}
