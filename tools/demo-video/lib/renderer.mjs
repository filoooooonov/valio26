// Turns a recording + the (possibly edited) script into a 1080p60 video.
// Render-only edits: hold lengths, zoom factors, zoom out, `cut`, camera mode, captions. Everything else needs a re-record.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { ScriptError } from "./script.mjs";
import { CURSOR, RINGS, ensureAssets } from "./assets.mjs";

const FPS = 60,
  OUT_W = 1920,
  OUT_H = 1080,
  DISSOLVE = 0.5;
const quintic = (u) => u * u * u * (u * (u * 6 - 15) + 10);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BREAK_BEFORE = new Set(["open", "card", "run"]);

export async function render(
  script,
  { outDir, captions = false, log = console.log },
) {
  const recDir = resolve(outDir, "recording");
  const recFile = resolve(recDir, "recording.json");
  if (!existsSync(recFile))
    throw new ScriptError(
      `No recording in ${recDir}. Run without --render-only first.`,
    );
  const rec = JSON.parse(readFileSync(recFile, "utf8"));
  const W = rec.viewport.width,
    H = rec.viewport.height,
    SW = W * rec.scale,
    SH = H * rec.scale;

  // ---- 1. match edited script to the recording ----
  const scenes = script.scenes.slice(0, rec.scenes.length);
  const stale = scenes
    .filter((s, i) => s.hash !== rec.scenes[i].hash)
    .map((s) => `"${s.title}"`);
  if (stale.length)
    throw new ScriptError(
      `These scenes changed what happens in the browser: ${stale.join(", ")}.\nRe-record (drop --render-only). Holds, zoom factors, "zoom out", ", cut" and notes are render-only.`,
    );
  if (script.scenes.length > rec.scenes.length)
    log(
      `  note: recording covers ${rec.scenes.length}/${script.scenes.length} scenes (recorded with --until)`,
    );

  // ---- 2. build the edit: segments of source pieces and freezes ----
  const segments = [];
  let seg = null,
    T = 0; // T = concatenated output time (before dissolve overlaps)
  const newSegment = () => {
    seg = { start: T, pieces: [], cursorOff: false };
    segments.push(seg);
  };
  const addSrc = (a, b) => {
    if (b - a > 1e-3) {
      seg.pieces.push({ kind: "src", a, b, T0: T });
      T += b - a;
    }
  };
  const addFreeze = (s, dur) => {
    if (dur > 1e-3) {
      seg.pieces.push({ kind: "freeze", a: s, b: s, T0: T, dur });
      T += dur;
    }
  };
  const camKeys = [],
    sceneSpans = [];
  newSegment();
  let s = rec.scenes[0].start;
  for (const [si, scene] of scenes.entries()) {
    const r = rec.scenes[si];
    const span = {
      title: scene.title,
      notes: scene.notes,
      start: null,
      end: null,
    };
    let ai = 0;
    for (const step of scene.steps) {
      if (step.action) {
        const a = r.actions[ai++];
        if (BREAK_BEFORE.has(step.verb) && a.ready) {
          addSrc(s, a.t0);
          if (seg.pieces.length) newSegment();
          s = a.ready;
          span.start ??= T;
          addSrc(s, a.t1);
          s = a.t1;
        } else if (step.verb === "wait" && step.cut && a.t1 - a.t0 > 1.2) {
          span.start ??= T;
          addSrc(s, a.t0 + 0.25);
          newSegment();
          s = a.t1 - 0.45;
          addSrc(s, a.t1);
          s = a.t1;
        } else {
          span.start ??= T;
          addSrc(s, a.t1);
          s = a.t1;
        }
        if (step.verb === "zoom") {
          const k = rec.camera.find(
            (c) => c.type === "focus" && !c.auto && c.t >= a.t0 && c.t <= a.t1,
          );
          if (k) camKeys.push({ src: k.t, ...k, zoom: step.zoom });
        }
      } else if (step.verb === "hold") {
        span.start ??= T;
        addFreeze(s, step.seconds);
      } else if (step.verb === "zoomout") {
        span.start ??= T;
        camKeys.push({ T, type: "wide" });
      }
    }
    addSrc(s, r.end);
    s = r.end;
    span.start ??= T;
    span.end = T;
    sceneSpans.push(span);
  }
  const total = T;

  // source time → concatenated output time (events inside removed gaps snap to the next kept moment)
  const pieces = segments.flatMap((g) => g.pieces);
  const toOut = (t) => {
    for (const p of pieces) {
      if (t < p.a) return p.T0;
      if (t <= p.b) return p.kind === "src" ? p.T0 + (t - p.a) : p.T0;
    }
    return null;
  };
  const toSrc = (Tc) => {
    let lo = 0,
      hi = pieces.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (pieces[m].T0 <= Tc) lo = m;
      else hi = m - 1;
    }
    const p = pieces[lo];
    return p.kind === "src" ? Math.min(p.b, p.a + (Tc - p.T0)) : p.a;
  };

  // ---- 3. camera: keyframes → eased transitions (critically smooth quintic, ≥0.6s) ----
  const auto = script.meta.camera !== "manual";
  for (const c of rec.camera) {
    if (c.type === "wide" && !c.auto) {
      const t = toOut(c.t);
      if (t != null) camKeys.push({ T: t, type: "wide" });
    } else if (c.auto && auto) {
      const t = toOut(c.t);
      if (t != null)
        camKeys.push(
          c.type === "wide"
            ? { T: t, type: "wide" }
            : {
                T: t,
                type: "focus",
                x: c.x,
                y: c.y,
                w: c.w,
                h: c.h,
                zoom: c.zoom,
              },
        );
    }
  }
  for (const k of camKeys) if (k.src != null) k.T = toOut(k.src) ?? total;
  camKeys.sort((a, b) => a.T - b.T);
  const WIDE = { x: W / 2, y: H / 2, z: 1 };
  const fit = (k) => {
    const z = clamp(
      Math.min(k.zoom ?? 1.4, (W * 0.82) / k.w, (H * 0.82) / k.h),
      1,
      1.8,
    );
    return {
      x: clamp(k.x, W / (2 * z), W - W / (2 * z)),
      y: clamp(k.y, H / (2 * z), H - H / (2 * z)),
      z,
    };
  };
  const transitions = [];
  const camAt = (t) => {
    let v = { ...WIDE };
    for (const tr of transitions) {
      if (t < tr.at) break;
      const e = quintic(clamp((t - tr.at) / tr.dur, 0, 1));
      v = {
        x: tr.from.x + (tr.to.x - tr.from.x) * e,
        y: tr.from.y + (tr.to.y - tr.from.y) * e,
        z: tr.from.z + (tr.to.z - tr.from.z) * e,
      };
    }
    return v;
  };
  const pushKey = (at, to, dur) => {
    const from = camAt(at);
    if (
      Math.abs(from.x - to.x) + Math.abs(from.y - to.y) < 1 &&
      Math.abs(from.z - to.z) < 0.01
    )
      return;
    transitions.push({ at, dur, from, to });
  };
  for (const k of camKeys)
    pushKey(
      k.T,
      k.type === "wide" ? WIDE : fit(k),
      k.type === "wide" ? 0.9 : 1.0,
    );
  // follow clicks that would land outside a zoomed view
  for (const c of rec.clicks) {
    const t = toOut(c.t);
    if (t == null) continue;
    const v = camAt(t);
    if (v.z < 1.05) continue;
    const hw = W / (2 * v.z),
      hh = H / (2 * v.z);
    if (Math.abs(c.x - v.x) > hw * 0.8 || Math.abs(c.y - v.y) > hh * 0.8) {
      const at = Math.max(0, t - 0.7);
      transitions.push({
        at,
        dur: 0.7,
        from: camAt(at),
        to: { x: clamp(c.x, hw, W - hw), y: clamp(c.y, hh, H - hh), z: v.z },
      });
      transitions.sort((a, b) => a.at - b.at);
    }
  }

  // ---- 4. cursor path and visibility ----
  const mouse = rec.mouse;
  const pointerAt = (t) => {
    let lo = 0,
      hi = mouse.length - 1;
    if (t <= mouse[0].t) return mouse[0];
    if (t >= mouse[hi].t) return mouse[hi];
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (mouse[m].t <= t) lo = m;
      else hi = m;
    }
    const a = mouse[lo],
      b = mouse[hi],
      u = (t - a.t) / (b.t - a.t || 1);
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  };
  const visibleAt = (t) => {
    let v = true;
    for (const c of rec.cursor) {
      if (c.t > t) break;
      v = c.visible;
    }
    return v;
  };
  const frameAt = (t) => {
    const f = rec.frames;
    let lo = 0,
      hi = f.length - 1;
    if (t <= f[0].t) return f[0].f;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (f[m].t <= t) lo = m;
      else hi = m - 1;
    }
    return f[lo].f;
  };
  const clicksOut = rec.clicks
    .map((c) => ({ ...c, T: toOut(c.t) }))
    .filter((c) => c.T != null);

  // ---- 5. render each segment (in parallel), then dissolve them together ----
  const assets = await ensureAssets(resolve(recDir, "assets"));
  const work = resolve(outDir, "render");
  mkdirSync(work, { recursive: true });
  for (const [i, g] of segments.entries())
    g.end = segments[i + 1]?.start ?? total;
  const live = segments.filter((g) => g.end - g.start > 0.05);
  const crop = (v) => {
    const w = SW / v.z,
      h = SH / v.z;
    return {
      w,
      h,
      x: clamp(v.x * rec.scale - w / 2, 0, SW - w),
      y: clamp(v.y * rec.scale - h / 2, 0, SH - h),
    };
  };
  const expr = (key, g) => {
    // only the transition already running at segment start plus those starting inside it
    const rel = transitions.filter((tr) => tr.at < g.end);
    const firstIdx = Math.max(
      0,
      rel.findLastIndex((tr) => tr.at <= g.start),
    );
    let e = String(
      rel.length && rel[firstIdx].at <= g.start
        ? rel[firstIdx].from[key]
        : camAt(g.start)[key],
    );
    for (const tr of rel.slice(firstIdx)) {
      const at = (tr.at - g.start).toFixed(4),
        u = `clip((on/${FPS}-(${at}))/${tr.dur.toFixed(4)},0,1)`;
      e = `if(gte(on/${FPS},${at}),${tr.from[key].toFixed(4)}+(${(tr.to[key] - tr.from[key]).toFixed(4)})*(${u}*${u}*${u}*(${u}*(${u}*6-15)+10)),${e})`;
    }
    return e;
  };
  const t0 = Date.now();
  const jobs = live.map((g, gi) => () => {
    const n = Math.max(1, Math.round((g.end - g.start) * FPS));
    // concat list at 60fps granularity, with runs of the same source frame merged
    const entries = [];
    const cmds = [];
    for (let i = 0; i < n; i++) {
      const Tc = g.start + i / FPS,
        src = toSrc(Tc),
        f = frameAt(src);
      if (entries.length && entries.at(-1).f === f) entries.at(-1).n++;
      else entries.push({ f, n: 1 });
      const v = camAt(Tc),
        c = crop(v),
        p = pointerAt(src);
      const show = visibleAt(src);
      const ox = show
          ? ((p.x * rec.scale - c.x) * OUT_W) / c.w - CURSOR.hotX
          : -500,
        oy = show
          ? ((p.y * rec.scale - c.y) * OUT_H) / c.h - CURSOR.hotY
          : -500;
      cmds.push(
        `${(i / FPS).toFixed(4)} overlay@cur x ${ox.toFixed(1)}, overlay@cur y ${oy.toFixed(1)};`,
      );
    }
    // ripple: each ring sprite shows for ~3 frames in sequence, positioned at the click
    const ringEnable = RINGS.map(() => []);
    for (const c of clicksOut) {
      if (c.T < g.start || c.T >= g.end) continue;
      const lt = c.T - g.start,
        v = camAt(c.T),
        cr = crop(v);
      const cx = ((c.x * rec.scale - cr.x) * OUT_W) / cr.w,
        cy = ((c.y * rec.scale - cr.y) * OUT_H) / cr.h;
      RINGS.forEach((r, k) => {
        const a = lt + k * 0.05;
        ringEnable[k].push(
          `between(t,${a.toFixed(3)},${(a + 0.05).toFixed(3)})`,
        );
        cmds.push(
          `${Math.max(0, a - 0.02).toFixed(4)} overlay@r${k} x ${(cx - r.size / 2).toFixed(1)}, overlay@r${k} y ${(cy - r.size / 2).toFixed(1)};`,
        );
      });
    }
    cmds.sort((a, b) => parseFloat(a) - parseFloat(b));
    const list =
      `ffconcat version 1.0\n` +
      entries
        .map((e) => `file '${e.f}'\nduration ${(e.n / FPS).toFixed(6)}`)
        .join("\n") +
      `\nfile '${entries.at(-1).f}'\n`;
    writeFileSync(resolve(recDir, `seg${gi}.ffconcat`), list);
    writeFileSync(resolve(work, `seg${gi}.cmd`), cmds.join("\n") + "\n");
    const z = expr("z", g),
      x = expr("x", g),
      y = expr("y", g);
    const rings = RINGS.map((_, k) =>
      ringEnable[k].length
        ? `[c${k}][${k + 2}:v]overlay@r${k}=x=-500:y=-500:enable='${ringEnable[k].join("+")}':shortest=1[c${k + 1}];`
        : `[c${k}]null[c${k + 1}];`,
    ).join("\n");
    const graph = `[0:v]fps=${FPS},zoompan=z='${z}':x='max(0,min(iw-iw/zoom,(${x})*${rec.scale}-iw/zoom/2))':y='max(0,min(ih-ih/zoom,(${y})*${rec.scale}-ih/zoom/2))':d=1:s=${OUT_W}x${OUT_H}:fps=${FPS},setsar=1,sendcmd=f='seg${gi}.cmd'[bg];
[bg][1:v]overlay@cur=x=-500:y=-500:shortest=1[c0];
${rings}
[c${RINGS.length}]format=yuv420p[out]`;
    writeFileSync(resolve(work, `seg${gi}.graph`), graph);
    const args = [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      resolve(recDir, `seg${gi}.ffconcat`),
      "-loop",
      "1",
      "-framerate",
      String(FPS),
      "-i",
      resolve(assets, "cursor.png"),
      ...RINGS.flatMap((_, k) => [
        "-loop",
        "1",
        "-framerate",
        String(FPS),
        "-i",
        resolve(assets, `ring${k}.png`),
      ]),
      "-filter_complex_script",
      `seg${gi}.graph`,
      "-map",
      "[out]",
      "-frames:v",
      String(n),
      "-r",
      String(FPS),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "17",
      `seg${gi}.mp4`,
    ];
    return ffmpeg(args, work).then(() => {
      g.file = resolve(work, `seg${gi}.mp4`);
      g.frames = n;
      log(
        `  rendered part ${gi + 1}/${live.length} (${(n / FPS).toFixed(1)}s)`,
      );
    });
  });
  await pool(jobs, 3);

  // ---- 6. dissolve parts together, optional burned captions ----
  let offset = 0;
  const starts = [];
  for (const [i, g] of live.entries()) {
    starts.push(offset);
    offset += g.frames / FPS - (i < live.length - 1 ? DISSOLVE : 0);
  }
  const duration = offset;
  const globalT = (Tc) => {
    let k = live.findLastIndex((g) => g.start <= Tc + 1e-6);
    if (k < 0) k = 0;
    return starts[k] + (Tc - live[k].start);
  };
  const cues = sceneSpans.map((s) => ({
    ...s,
    from: Math.max(0, globalT(s.start)),
    to: Math.min(duration, globalT(s.end - 1e-6)),
  }));
  const inputs = live.flatMap((g) => ["-i", g.file]);
  let chain = live.length > 1 ? "" : "[0:v]null[v]";
  for (let i = 1, last = "0:v"; i < live.length; i++) {
    const label = i === live.length - 1 ? "v" : `x${i}`;
    chain += `[${last}][${i}:v]xfade=transition=fade:duration=${DISSOLVE}:offset=${starts[i].toFixed(4)}[${label}];`;
    last = label;
  }
  if (captions) {
    writeFileSync(resolve(work, "captions.ass"), assFile(cues));
    chain += `;[v]ass=captions.ass[vc]`;
  }
  writeFileSync(resolve(work, "final.graph"), chain.replace(/;;/g, ";"));
  await ffmpeg(
    [
      "-y",
      "-loglevel",
      "error",
      ...inputs,
      "-filter_complex_script",
      "final.graph",
      "-map",
      captions ? "[vc]" : "[v]",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      resolve(outDir, "video.mp4"),
    ],
    work,
  );

  writeFileSync(
    resolve(outDir, "voiceover.md"),
    cueSheet(script, cues, duration),
  );
  writeFileSync(
    resolve(outDir, "captions.srt"),
    cues
      .map(
        (c, i) =>
          `${i + 1}\n${srt(c.from)} --> ${srt(c.to)}\n${c.title}${c.notes.length ? "\n" + c.notes.join(" ") : ""}\n`,
      )
      .join("\n"),
  );
  return {
    duration,
    cues,
    renderSeconds: (Date.now() - t0) / 1000,
    parts: live.length,
  };
}

const mmss = (t) =>
  `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const srt = (t) => {
  const ms = Math.round(t * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};
function cueSheet(script, cues, duration) {
  const rows = cues.map(
    (c, i) =>
      `| ${i + 1} | ${mmss(c.from)} – ${mmss(c.to)} | ${(c.to - c.from).toFixed(1)}s | **${c.title}** | ${c.notes.join(" ") || "—"} |`,
  );
  const warn =
    duration > 120
      ? `\n> ⚠ ${mmss(duration)} is over the 2:00 pitch-video limit. Trim holds or cut waits, then \`--render-only\`.\n`
      : "";
  return `# Voiceover cue sheet — ${script.meta.title}\n\nTotal **${mmss(duration)}** (${duration.toFixed(1)}s), 1920×1080 60 fps, no audio.${warn}\n\n| # | Time | Length | Scene | Say |\n|---|---|---|---|---|\n${rows.join("\n")}\n\nPacing guide: about 2.5 spoken words per second. If a line runs long, add \`hold 1s\` to that scene and re-render with \`--render-only\`.\n`;
}
function assFile(cues) {
  const t = (n) =>
    `${Math.floor(n / 3600)}:${String(Math.floor(n / 60) % 60).padStart(2, "0")}:${(n % 60).toFixed(2).padStart(5, "0")}`;
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Lower,Geist,38,&H00FFFFFF,&H00FFFFFF,&H00473700,&H00473700,0,0,0,0,100,100,0,0,3,14,0,1,90,90,70,1\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n${cues.map((c) => `Dialogue: 0,${t(c.from + 0.2)},${t(Math.max(c.from + 0.4, c.to - 0.15))},Lower,,0,0,0,,{\\fad(250,200)}${c.title.replace(/[{}\\]/g, "")}`).join("\n")}\n`;
}
function ffmpeg(args, cwd) {
  return new Promise((ok, fail) => {
    const p = spawn("ffmpeg", args, {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    p.stderr.on("data", (d) => {
      err += d;
    });
    p.on("close", (code) =>
      code
        ? fail(new Error(`ffmpeg failed (${code}): ${err.slice(-1500)}`))
        : ok(),
    );
  });
}
async function pool(jobs, n) {
  const q = [...jobs];
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (q.length) await q.shift()();
    }),
  );
}
