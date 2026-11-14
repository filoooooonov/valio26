// Plays storyboard.ts against the live app and gateway and writes out/timeline.json plus one MP4 per screen
// scene. Usage: node record/record.ts [sceneId ...]   (no ids = all scenes; with ids, other scenes are kept)
// Runs under Node (not Bun): Bun hangs launching Playwright's browser on Windows.
import { chromium, type Page, type Locator, type CDPSession } from "playwright";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { scenes, meta, type Scene, type Step } from "../storyboard.ts";
import { cursorScript } from "./cursor.ts";

const OUT = "out";
const GATEWAY = process.env.GATEWAY ?? "http://localhost:8787";
mkdirSync(OUT, { recursive: true });

type Box = { x: number; y: number; w: number; h: number }; // fractions of the viewport (0..1)
export type Ev = {
  kind: Step["do"];
  t: number;
  tEnd: number;
  caption?: string;
  zoom?: number;
  box?: Box;
  real?: number;
}; // real = recorded ms of a compressed wait
export type TimelineScene = Record<string, unknown> & {
  id: string;
  kind: Scene["kind"];
};

const only = process.argv.slice(2);
const prev: TimelineScene[] = existsSync(join(OUT, "timeline.json"))
  ? JSON.parse(readFileSync(join(OUT, "timeline.json"), "utf8")).scenes
  : [];

async function preflight() {
  for (const [name, url] of [
    ["gateway", GATEWAY + "/api/health"],
    ["app", (scenes.find((s) => s.kind === "screen") as any)?.url],
  ]) {
    if (!url) continue;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
    } catch (e) {
      console.error(
        `✗ ${name} not reachable at ${url} (${e}). Start it with: bun run dev`,
      );
      process.exit(1);
    }
  }
}

// ---------- screen scenes ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ease = (k: number) =>
  k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;

async function recordScreen(
  scene: Extract<Scene, { kind: "screen" }>,
  page: Page,
): Promise<TimelineScene> {
  const { width: VW, height: VH } = meta.viewport;
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const dir = join(OUT, `frames-${scene.id}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  await page.goto(scene.url);
  await page.waitForLoadState("networkidle").catch(() => {});
  await sleep(800);

  const frames: { file: string; t: number }[] = [];
  let t0 = 0;
  cdp.on("Page.screencastFrame", async (f: any) => {
    const t = Date.now() - t0;
    const file = String(frames.length).padStart(6, "0") + ".jpg";
    frames.push({ file, t });
    writeFileSync(join(dir, file), Buffer.from(f.data, "base64"));
    await cdp
      .send("Page.screencastFrameAck", { sessionId: f.sessionId })
      .catch(() => {});
  });
  const px = Math.round(VW * meta.deviceScaleFactor),
    py = Math.round(VH * meta.deviceScaleFactor);
  t0 = Date.now();
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    maxWidth: px,
    maxHeight: py,
    everyNthFrame: 1,
  });

  const now = () => Date.now() - t0;
  const events: Ev[] = [];
  const waits: { a: number; b: number; to: number }[] = [];
  let cur = { x: VW * 0.62, y: VH * 0.55 };
  await page.mouse.move(cur.x, cur.y);

  const moveTo = async (x: number, y: number, ms = 650) => {
    const n = Math.max(8, Math.round(ms / 16)),
      from = { ...cur };
    for (let i = 1; i <= n; i++) {
      const k = ease(i / n);
      await page.mouse.move(
        from.x + (x - from.x) * k,
        from.y + (y - from.y) * k,
      );
      await sleep(ms / n);
    }
    cur = { x, y };
  };
  const boxOf = async (loc: Locator): Promise<Box | undefined> => {
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(150);
    const b = await loc.boundingBox();
    return b
      ? { x: b.x / VW, y: b.y / VH, w: b.width / VW, h: b.height / VH }
      : undefined;
  };
  const present = async (loc: Locator, timeout = 2500) =>
    loc.waitFor({ state: "visible", timeout }).then(
      () => true,
      () => false,
    );

  await sleep(400);
  for (const [i, s] of scene.steps.entries()) {
    const t = now();
    const label = `${scene.id}#${i} ${s.do}`;
    if (s.do === "pause") {
      await sleep(s.ms);
      events.push({ kind: s.do, t, tEnd: now(), caption: s.caption });
    } else if (s.do === "waitFor") {
      const ok = await present(s.target(page).first(), s.timeout ?? 60_000);
      if (!ok) throw new Error(`${label}: target never appeared`);
      const tEnd = now();
      if (s.compressTo && tEnd - t > s.compressTo * 1000)
        waits.push({ a: t, b: tEnd, to: s.compressTo * 1000 });
      events.push({ kind: s.do, t, tEnd, caption: s.caption, real: tEnd - t });
      await sleep(300);
    } else {
      const loc = s.target(page).first();
      if (!(await present(loc))) {
        if ("optional" in s && s.optional) {
          console.log(`  · skipped optional ${label}`);
          continue;
        }
        throw new Error(`${label}: target not found`);
      }
      const box = await boxOf(loc);
      if (!box) throw new Error(`${label}: target has no box`);
      const cx = (box.x + box.w / 2) * VW,
        cy = (box.y + box.h / 2) * VH;
      if (s.do === "focus") {
        await moveTo(
          Math.min(cx + box.w * VW * 0.3, (box.x + box.w) * VW - 6),
          cy + Math.min(14, box.h * VH * 0.3),
        );
      } else {
        await moveTo(cx, cy);
        await sleep(120);
        await page.mouse.down();
        await sleep(90);
        await page.mouse.up();
        if (s.do === "type") {
          await sleep(250);
          await page.keyboard.type(s.text, { delay: 32 });
        }
      }
      await sleep(s.hold ?? (s.do === "focus" ? 2500 : 900));
      events.push({
        kind: s.do,
        t,
        tEnd: now(),
        caption: s.caption,
        zoom: s.zoom ?? (s.do === "click" ? 1.5 : 1.7),
        box,
      });
    }
    console.log(`  ✓ ${label} (${((now() - t) / 1000).toFixed(1)}s)`);
  }
  await sleep(900);
  const end = now();
  await cdp.send("Page.stopScreencast");
  await sleep(200);
  if (!frames.length) throw new Error(`${scene.id}: no frames captured`);

  // Time remap: compressed waits play faster in the edit; everything else is real time.
  waits.sort((x, y) => x.a - y.a);
  const map = (t: number) => {
    let shift = 0;
    for (const w of waits) {
      if (t <= w.a) break;
      if (t < w.b) return t - shift - (t - w.a) * (1 - w.to / (w.b - w.a));
      shift += w.b - w.a - w.to;
    }
    return t - shift;
  };
  // Frames -> MP4 with exact per-frame durations (screencast only emits frames when the page changes).
  const list: string[] = [];
  for (const [i, f] of frames.entries()) {
    const a = i === 0 ? 0 : map(f.t),
      b = map(frames[i + 1]?.t ?? end);
    list.push(
      `file '${f.file}'`,
      `duration ${Math.max(0.001, (b - a) / 1000).toFixed(4)}`,
    );
  }
  list.push(`file '${frames[frames.length - 1].file}'`);
  writeFileSync(join(dir, "list.txt"), list.join("\n"));
  const file = `${scene.id}.mp4`;
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    join(dir, "list.txt"),
    "-vf",
    `fps=${meta.fps},scale=${px}:${py}:flags=lanczos,format=yuv420p`,
    "-c:v",
    "libx264",
    "-crf",
    "14",
    "-preset",
    "medium",
    join(OUT, file),
  ]);
  rmSync(dir, { recursive: true, force: true });

  return {
    id: scene.id,
    kind: "screen",
    file,
    durationMs: Math.round(map(end)),
    recordedMs: end,
    viewport: meta.viewport,
    events: events.map((e) => ({
      ...e,
      t: Math.round(map(e.t)),
      tEnd: Math.round(map(e.tEnd)),
    })),
  };
}

// ---------- main ----------
await preflight();
const browser = await chromium.launch();
const out: TimelineScene[] = [];
try {
  for (const s of scenes) {
    const keep = prev.find((p) => p.id === s.id);
    if (
      only.length &&
      !only.includes(s.id) &&
      keep &&
      s.kind !== "title" &&
      s.kind !== "diagram"
    ) {
      out.push(keep);
      console.log(`· ${s.id}: kept previous take`);
      continue;
    }
    console.log(`▶ ${s.id} (${s.kind})`);
    if (s.kind === "title" || s.kind === "diagram") {
      out.push({ ...s, durationMs: s.seconds * 1000 });
    } else if (s.kind === "terminal") {
      const raw = execFileSync("node", ["--no-warnings", s.script], {
        encoding: "utf8",
        env: { ...process.env, GATEWAY },
      });
      const res = JSON.parse(raw.trim().split("\n").pop()!);
      out.push({
        id: s.id,
        kind: "terminal",
        title: s.title,
        caption: s.caption,
        lines: res.lines,
      });
      console.log(`  ✓ ${res.lines.length} transcript lines`);
    } else {
      const ctx = await browser.newContext({
        viewport: meta.viewport,
        deviceScaleFactor: meta.deviceScaleFactor,
        locale: "en-GB",
        timezoneId: "Europe/Helsinki",
      });
      await ctx.addInitScript(cursorScript);
      const page = await ctx.newPage();
      out.push({ ...(await recordScreen(s, page)), title: undefined });
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
writeFileSync(
  join(OUT, "timeline.json"),
  JSON.stringify(
    { meta, recordedAt: new Date().toISOString(), scenes: out },
    null,
    2,
  ),
);
console.log(
  `\n✓ wrote ${OUT}/timeline.json (${out.length} scenes). Next: bun run video:render`,
);
