// Drives the real app in Chromium and records crisp 2x frames plus a log of every mouse sample, click and camera cue.
// The visible cursor and camera are drawn later by the renderer at 60 fps, so recording speed never makes them stutter.
import { chromium } from "../../../video/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { exec } from "node:child_process";
import { ScriptError } from "./script.mjs";
import { createTargets } from "./targets.mjs";
import { inspectPage } from "./inspect.mjs";

const root = resolve(import.meta.dirname, "../../..");
const now = () => Date.now() / 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
function rng(seed) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

export async function record(
  script,
  { outDir, until, inspect = false, log = console.log },
) {
  const { meta } = script;
  const recDir = resolve(outDir, "recording");
  if (!inspect) {
    rmSync(recDir, { recursive: true, force: true });
    mkdirSync(resolve(recDir, "frames"), { recursive: true });
  }
  const app = meta.app.replace(/\/$/, "");
  const r = await fetch(app).catch((e) => ({ ok: false, status: e.message }));
  if (!r.ok)
    throw new Error(
      `App not reachable at ${app} (${r.status}). Start it with: bun run dev`,
    );

  const browser = await chromium.launch({
    args: ["--force-device-scale-factor=2"],
  });
  const context = await browser.newContext({
    viewport: { width: meta.width, height: meta.height },
    deviceScaleFactor: 2,
    locale: "en-GB",
    timezoneId: "Europe/Helsinki",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const cdp = await context.newCDPSession(page);
  const frames = [],
    writes = [];
  cdp.on("Page.screencastFrame", (f) => {
    const name = `frames/${String(frames.length).padStart(6, "0")}.jpg`;
    frames.push({ t: f.metadata.timestamp, f: name });
    writes.push(
      Promise.resolve().then(() =>
        writeFileSync(resolve(recDir, name), Buffer.from(f.data, "base64")),
      ),
    );
    cdp
      .send("Page.screencastFrameAck", { sessionId: f.sessionId })
      .catch(() => {});
  });

  const log_ = { mouse: [], clicks: [], camera: [], cursor: [], scenes: [] };
  const rand = rng(7);
  let pointer = { x: meta.width * 0.5, y: meta.height * 0.62 };
  log_.mouse.push({ t: now(), ...pointer });

  async function moveTo(x, y) {
    const from = { ...pointer },
      dist = Math.hypot(x - from.x, y - from.y);
    if (dist < 2) return;
    const ms = Math.min(900, Math.max(450, 380 + dist * 0.45));
    const bend = (rand() < 0.5 ? -1 : 1) * Math.min(80, dist * 0.12); // gentle arc, never a straight robotic line
    const nx = -(y - from.y) / dist,
      ny = (x - from.x) / dist;
    const c = {
      x: (from.x + x) / 2 + nx * bend,
      y: (from.y + y) / 2 + ny * bend,
    };
    const t0 = performance.now();
    for (;;) {
      const u = Math.min(1, (performance.now() - t0) / ms),
        e = easeInOut(u);
      const px = (1 - e) ** 2 * from.x + 2 * (1 - e) * e * c.x + e * e * x,
        py = (1 - e) ** 2 * from.y + 2 * (1 - e) * e * c.y + e * e * y;
      await page.mouse.move(px, py);
      log_.mouse.push({ t: now(), x: px, y: py });
      if (u >= 1) break;
      await sleep(12);
    }
    pointer = { x, y };
  }

  const { find, similar } = createTargets(page);
  let where = "";
  async function resolveTarget(t, timeout = 8) {
    const end = Date.now() + timeout * 1000;
    let last;
    do {
      last = await find(t);
      if (last.loc || last.ambiguous) break;
      await sleep(250);
    } while (Date.now() < end);
    if (last.loc) return last.loc;
    const what = `${(t.alts ?? [t.text]).map((a) => `"${a}"`).join(" or ")}${t.region ? ` in "${t.region}"` : ""}${t.nth ? ` #${t.nth}` : ""}`;
    throw new ScriptError(
      `${where}: ${what}: ${last.error}.\n  On screen now: ${(await similar(t.text)).map((s) => JSON.stringify(s)).join(", ") || "(nothing interactive)"}`,
    );
  }
  async function bringIntoView(loc) {
    await loc
      .evaluate(async (el) => {
        let node = el.parentElement,
          scroller = null;
        while (node) {
          const c = getComputedStyle(node);
          if (
            /auto|scroll/.test(c.overflowY) &&
            node.scrollHeight > node.clientHeight + 2
          ) {
            scroller = node;
            break;
          }
          node = node.parentElement;
        }
        const r = el.getBoundingClientRect(),
          host = scroller?.getBoundingClientRect() ?? {
            top: 0,
            height: innerHeight,
          };
        if (r.top >= host.top + 8 && r.bottom <= host.top + host.height - 8)
          return;
        const delta = r.top - host.top - host.height * 0.42 + r.height / 2;
        const from = scroller ? scroller.scrollTop : scrollY;
        const max = scroller
          ? scroller.scrollHeight - scroller.clientHeight
          : document.documentElement.scrollHeight - innerHeight;
        const to = Math.max(0, Math.min(max, from + delta));
        await new Promise((done) => {
          const s = performance.now();
          (function tick(n) {
            const p = Math.min(1, (n - s) / 700),
              e = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
            scroller
              ? (scroller.scrollTop = from + (to - from) * e)
              : scrollTo(0, from + (to - from) * e);
            p < 1 ? requestAnimationFrame(tick) : done();
          })(s);
        });
      })
      .catch(() => {});
  }
  async function box(loc) {
    await bringIntoView(loc);
    const b = await loc.boundingBox();
    if (!b) throw new ScriptError(`${where}: target has no visible box`);
    return b;
  }
  const cam = (type, extra = {}) =>
    log_.camera.push({ t: now(), type, ...extra });

  // ---- cards and terminal, styled from the app's brand tokens and self-hosted Geist ----
  const tokens = readFileSync(resolve(root, "app/web/src/tokens.css"), "utf8");
  const font = (i, w) =>
    `@font-face{font-family:Geist;font-weight:${w};src:url(data:font/ttf;base64,${readFileSync(resolve(root, `app/web/public/fonts/geist-${i}.ttf`)).toString("base64")}) format('truetype')}`;
  const fonts = font(0, 400) + font(1, 500) + font(2, 600);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const baseCss = `${tokens}${fonts}html,body{margin:0;height:100%;background:var(--teal-deep);color:var(--white);font-family:var(--font-display);-webkit-font-smoothing:antialiased}
    @keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}`;
  const cardHtml = (title, sub) => `<!doctype html><style>${baseCss}
    body{display:grid;place-content:center;padding:0 9vw;box-sizing:border-box}
    .eyebrow{color:var(--lime);font-size:20px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;animation:rise .7s cubic-bezier(.2,.8,.2,1) both}
    h1{font-size:76px;line-height:1.04;font-weight:600;letter-spacing:-.02em;margin:22px 0 0;max-width:1150px;animation:rise .8s .12s cubic-bezier(.2,.8,.2,1) both}
    </style><body>${sub ? `<div class="eyebrow">${esc(sub)}</div>` : ""}<h1>${esc(title).replace(/\\n|\n/g, "<br>")}</h1></body>`;
  const termHtml = (cmd) => `<!doctype html><style>${baseCss}
    body{display:grid;place-items:center;background:var(--teal-deep)}
    .win{width:1280px;max-height:760px;background:var(--brand-dark);border-radius:16px;border:1px solid var(--line);overflow:hidden;animation:rise .6s cubic-bezier(.2,.8,.2,1) both}
    .bar{height:44px;display:flex;align-items:center;gap:9px;padding:0 18px;background:var(--teal-deep)}
    .bar i{width:13px;height:13px;border-radius:50%;background:var(--muted)}
    .bar span{margin-left:12px;color:var(--blueberry);font-size:15px}
    pre{margin:0;padding:26px 30px;font:18px/1.55 ui-monospace,Consolas,monospace;white-space:pre-wrap;color:var(--hair)}
    .cmd{color:var(--lime)} .err{color:var(--red-light)}
    </style><body><div class="win"><div class="bar"><i></i><i></i><i></i><span>terminal · real command output</span></div><pre id="o"><span class="cmd">$ </span><span class="cmd" id="c"></span></pre></div></body>`;

  // ---- step runners ----
  const run = {
    async open(s) {
      cam("wide");
      log_.cursor.push({ t: now(), visible: true });
      // "open back": browser Back, e.g. return to a buyer page whose URL (?b=…&o=…) is only known at run time.
      if (s.url === "back") await page.goBack({ waitUntil: "load" });
      else {
        const url = /^https?:/.test(s.url)
          ? s.url
          : app + (s.url.startsWith("/") ? s.url : "/" + s.url);
        await page.goto(url, { waitUntil: "load" });
      }
      const ready = now();
      await sleep(900);
      return { ready };
    },
    async click(s) {
      const loc = await resolveTarget(s.target);
      const b = await box(loc);
      if (!(await loc.isEnabled().catch(() => true)))
        throw new ScriptError(`${where}: "${s.target.text}" is disabled`);
      const x = b.x + b.width / 2,
        y = b.y + b.height / 2;
      await moveTo(x, y);
      await sleep(170);
      log_.clicks.push({ t: now(), x, y });
      await page.mouse.down();
      await sleep(90);
      await page.mouse.up();
      await sleep(450);
    },
    async hover(s) {
      const b = await box(await resolveTarget(s.target));
      await moveTo(b.x + b.width / 2, b.y + b.height / 2);
      await sleep(400);
    },
    async type(s) {
      const loc = await resolveTarget(s.target);
      const b = await box(loc);
      cam("focus", {
        auto: true,
        x: b.x + b.width / 2,
        y: b.y + b.height / 2,
        w: b.width,
        h: b.height,
        zoom: 1.3,
      });
      await moveTo(b.x + Math.min(b.width * 0.25, 80), b.y + b.height / 2);
      await sleep(150);
      log_.clicks.push({ t: now(), x: pointer.x, y: pointer.y });
      await page.mouse.down();
      await sleep(80);
      await page.mouse.up();
      await sleep(250);
      await loc.fill("");
      // step the pointer just below the field so it never covers the text being typed
      await moveTo(
        b.x + b.width * 0.55,
        Math.min(meta.height - 14, b.y + b.height + 26),
      );
      for (const ch of s.text) {
        await page.keyboard.type(ch);
        await sleep(
          26 +
            rand() * 42 +
            (ch === " " ? 18 : 0) +
            (/[,.!?]/.test(ch) ? 90 : 0),
        );
      }
      await sleep(450);
      cam("wide", { auto: true });
    },
    async press(s) {
      await page.keyboard.press(s.key);
      await sleep(500);
    },
    async wait(s) {
      await resolveTarget(s.target, s.timeout);
      await sleep(350);
    },
    async zoom(s) {
      const b = await box(await resolveTarget(s.target));
      cam("focus", {
        x: b.x + b.width / 2,
        y: b.y + b.height / 2,
        w: b.width,
        h: b.height,
      });
      await sleep(150);
    },
    async scroll(s) {
      await box(await resolveTarget(s.target));
      await sleep(300);
    },
    async pause(s) {
      await sleep(s.seconds * 1000);
    },
    async card(s) {
      cam("wide");
      log_.cursor.push({ t: now(), visible: false });
      await page.setContent(cardHtml(s.title, s.subtitle));
      const ready = now();
      await sleep(1300);
      return { ready };
    },
    async run(s) {
      cam("wide");
      log_.cursor.push({ t: now(), visible: false });
      const result = await new Promise((done) =>
        exec(
          s.command,
          { cwd: root, timeout: 180000, maxBuffer: 1 << 22, env: process.env },
          (err, stdout, stderr) =>
            done({
              code: err?.code ?? 0,
              out: (stdout + (stderr ? "\n" + stderr : "")).trim(),
            }),
        ),
      );
      if (result.code)
        log(
          `  ! "${s.command}" exited with ${result.code}; showing its real output anyway`,
        );
      // a command that ends with a JSON transcript {lines:[{text}]} (e.g. video/record/agent-milk.ts) is shown as its transcript
      let raw = result.out.split("\n");
      try {
        const j = JSON.parse(raw.at(-1));
        if (Array.isArray(j?.lines))
          raw = [
            ...raw.slice(0, -1),
            ...j.lines.map((l) => (typeof l === "string" ? l : l.text)),
          ];
      } catch {}
      const lines = raw.map((l) =>
        l.length > 118 ? l.slice(0, 115) + "…" : l,
      );
      const shown =
        lines.length > 24
          ? [...lines.slice(0, 23), `… ${lines.length - 23} more lines`]
          : lines;
      await page.setContent(termHtml(s.command));
      const ready = now();
      await sleep(500);
      for (const ch of s.command) {
        await page.evaluate((c) => {
          document.getElementById("c").textContent += c;
        }, ch);
        await sleep(22 + rand() * 30);
      }
      await sleep(350);
      for (const l of shown) {
        await page.evaluate((l) => {
          const o = document.getElementById("o"),
            d = document.createElement("div");
          d.textContent = l || " ";
          if (/^(error|4\d\d|5\d\d)\b/i.test(l)) d.className = "err";
          o.append(d);
        }, l);
        await sleep(70);
      }
      await sleep(600);
      return { exitCode: result.code, ready };
    },
  };

  const started = now();
  log_.cursor.push({ t: started, visible: true });
  if (!inspect)
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 86,
      everyNthFrame: 1,
    });
  try {
    for (const [si, scene] of script.scenes.entries()) {
      const rec = {
        title: scene.title,
        hash: scene.hash,
        start: now(),
        actions: [],
      };
      log_.scenes.push(rec);
      log(`▶ ${scene.title}`);
      for (const step of scene.steps.filter((s) => s.action)) {
        where = `scene "${scene.title}", line ${step.line}`;
        const a = { verb: step.verb, line: step.line, t0: now() };
        if (step.optional) {
          const present = await resolveTarget(
            step.target,
            step.verb === "wait" ? step.timeout : 3,
          ).then(
            () => true,
            (e) => {
              if (e instanceof ScriptError) return false;
              throw e;
            },
          );
          if (!present) {
            log(`  · line ${step.line}: skipped (optional, not on screen)`);
            a.t1 = now();
            a.skipped = true;
            rec.actions.push(a);
            continue;
          }
        }
        const res = await run[step.verb](step);
        a.t1 = now();
        Object.assign(a, res ?? {});
        rec.actions.push(a);
      }
      rec.end = now();
      if (until && scene.title.toLowerCase() === until.toLowerCase()) {
        log(`■ stopped after "${scene.title}" (--until)`);
        break;
      }
    }
    await sleep(400);
  } catch (e) {
    // --inspect: show what is on screen where the script stopped, instead of only the error
    if (!(inspect && e instanceof ScriptError)) throw e;
    log(`✖ ${e.message.split("\n")[0]}`);
  } finally {
    if (inspect)
      await inspectPage(page, log).catch((e) =>
        log(`  (inspect failed: ${e.message})`),
      );
    await cdp.send("Page.stopScreencast").catch(() => {});
    await Promise.all(writes);
    await browser.close();
  }
  if (inspect) return null;
  if (!frames.length) throw new Error("No frames were captured");
  const data = {
    version: 1,
    viewport: { width: meta.width, height: meta.height },
    scale: 2,
    started,
    ended: now(),
    frames,
    ...log_,
  };
  writeFileSync(resolve(recDir, "recording.json"), JSON.stringify(data));
  return data;
}
