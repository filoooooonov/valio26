// Plain-English demo script parser. One table entry per verb; see README for the format.
import { createHash } from "node:crypto";

const Q = String.raw`"((?:[^"\\]|\\.)*)"`; // quoted string with \" escapes
const QS = String.raw`"(?:[^"\\]|\\.)*"`;
// "text" [or "other text" …] [in "region"] [#n]
const TARGET = String.raw`(${QS}(?:\s+or\s+${QS})*)(?:\s+in\s+${Q})?(?:\s+#(\d+))?`;
const NUM = String.raw`(\d+(?:\.\d+)?)`;
const unq = (s) => s?.replace(/\\(.)/g, "$1");
const target = (m, i) => {
  const alts = [...m[i].matchAll(new RegExp(Q, "g"))].map((x) => unq(x[1]));
  return {
    text: alts[0],
    alts,
    region: unq(m[i + 1]) ?? null,
    nth: m[i + 2] ? Number(m[i + 2]) : null,
  };
};

// action: true = needs a recording; render-only verbs (hold, zoom out) can be edited without re-recording.
export const VERBS = [
  {
    verb: "open",
    re: /^open\s+(\S+)$/,
    action: true,
    build: (m) => ({ url: m[1] }),
  },
  {
    verb: "click",
    re: new RegExp(`^click\\s+${TARGET}$`),
    action: true,
    build: (m) => ({ target: target(m, 1) }),
  },
  {
    verb: "hover",
    re: new RegExp(`^hover\\s+${TARGET}$`),
    action: true,
    build: (m) => ({ target: target(m, 1) }),
  },
  {
    verb: "type",
    re: new RegExp(`^type\\s+${Q}\\s+into\\s+${TARGET}$`),
    action: true,
    build: (m) => ({ text: unq(m[1]), target: target(m, 2) }),
  },
  {
    verb: "press",
    re: /^press\s+(\S+)$/,
    action: true,
    build: (m) => ({ key: m[1] }),
  },
  {
    verb: "wait",
    re: new RegExp(
      `^wait\\s+for\\s+${TARGET}(?:\\s+up\\s+to\\s+${NUM}s)?(\\s*,\\s*cut)?$`,
    ),
    action: true,
    build: (m) => ({
      target: target(m, 1),
      timeout: m[4] ? Number(m[4]) : 30,
      cut: !!m[5],
    }),
    render: ["cut", "timeout"],
  },
  {
    verb: "zoom",
    re: new RegExp(`^zoom\\s+on\\s+${TARGET}(?:\\s+x${NUM})?$`),
    action: true,
    build: (m) => ({ target: target(m, 1), zoom: m[4] ? Number(m[4]) : 1.4 }),
    render: ["zoom"],
  },
  { verb: "zoomout", re: /^zoom\s+out$/, action: false, build: () => ({}) },
  {
    verb: "scroll",
    re: new RegExp(`^scroll\\s+to\\s+${TARGET}$`),
    action: true,
    build: (m) => ({ target: target(m, 1) }),
  },
  {
    verb: "hold",
    re: new RegExp(`^hold\\s+${NUM}s$`),
    action: false,
    build: (m) => ({ seconds: Number(m[1]) }),
  },
  {
    verb: "pause",
    re: new RegExp(`^pause\\s+${NUM}s$`),
    action: true,
    build: (m) => ({ seconds: Number(m[1]) }),
  },
  {
    verb: "card",
    re: new RegExp(`^card\\s+${Q}(?:\\s+${Q})?$`),
    action: true,
    build: (m) => ({ title: unq(m[1]), subtitle: unq(m[2]) ?? "" }),
  },
  {
    verb: "run",
    re: new RegExp(`^run\\s+${Q}\\s+as\\s+terminal$`),
    action: true,
    build: (m) => ({ command: unq(m[1]) }),
  },
];

export class ScriptError extends Error {}

export function parseScript(source, file = "script") {
  const lines = source.replace(/\r/g, "").split("\n");
  const meta = {
    title: "Demo",
    app: "http://localhost:5173",
    viewport: "1600x900",
    camera: "auto",
  };
  let i = 0;
  if (lines[0]?.trim() === "---") {
    for (i = 1; i < lines.length && lines[i].trim() !== "---"; i++) {
      const m = lines[i].match(/^(\w+)\s*:\s*(.*)$/);
      if (m) meta[m[1]] = m[2].trim();
    }
    i++;
  }
  const scenes = [];
  const errors = [];
  for (; i < lines.length; i++) {
    const raw = lines[i].trim(),
      line = i + 1;
    if (raw.startsWith("<!--")) {
      while (i < lines.length && !lines[i].includes("-->")) i++;
      continue;
    }
    if (!raw) continue;
    if (raw.startsWith("# ")) {
      scenes.push({ title: raw.slice(2).trim(), line, steps: [], notes: [] });
      continue;
    }
    const scene = scenes.at(-1);
    if (!scene) {
      errors.push(`${file}:${line}: put a "# Scene title" before steps`);
      continue;
    }
    if (raw.startsWith(">")) {
      scene.notes.push(
        raw
          .slice(1)
          .trim()
          .replace(/^Say:\s*/i, ""),
      );
      continue;
    }
    // ", optional" on any targeted step: skip quietly when the target never appears
    const optional = /,\s*optional$/i.test(raw);
    const body = raw.replace(/,\s*optional$/i, "");
    const def = VERBS.find((v) => v.re.test(body));
    if (
      def &&
      optional &&
      !["click", "hover", "zoom", "scroll", "wait"].includes(def.verb)
    ) {
      errors.push(
        `${file}:${line}: ", optional" only works on click, hover, zoom on, scroll to and wait for`,
      );
      continue;
    }
    if (!def) {
      errors.push(
        `${file}:${line}: unknown step "${raw}". Verbs: open, click, hover, type … into, press, wait for, zoom on, zoom out, scroll to, hold, pause, card, run … as terminal`,
      );
      continue;
    }
    scene.steps.push({
      verb: def.verb,
      line,
      raw,
      action: def.action,
      renderKeys: def.render ?? [],
      ...(optional ? { optional } : {}),
      ...def.build(body.match(def.re)),
    });
  }
  if (!scenes.length)
    errors.push(`${file}: no scenes (start one with "# Title")`);
  if (errors.length) throw new ScriptError(errors.join("\n"));
  const [vw, vh] = meta.viewport.split("x").map(Number);
  meta.width = vw;
  meta.height = vh;
  for (const s of scenes) s.hash = sceneHash(s);
  return { meta, scenes };
}

// Hash of what the browser must do in a scene. Holds, zoom out, notes, zoom factors and `cut` are render-only.
export function sceneHash(scene) {
  const acts = scene.steps
    .filter((s) => s.action)
    .map((s) => {
      const { line, raw, renderKeys, ...rest } = s;
      for (const k of renderKeys) delete rest[k];
      return rest;
    });
  return createHash("sha1")
    .update(JSON.stringify(acts))
    .digest("hex")
    .slice(0, 12);
}

export function describe(script) {
  const out = [
    `${script.meta.title}  (${script.meta.app}, ${script.meta.viewport}, camera ${script.meta.camera})`,
  ];
  for (const s of script.scenes) {
    out.push(`\n# ${s.title}  [${s.hash}]`);
    for (const st of s.steps)
      out.push(
        `  ${String(st.line).padStart(3)}  ${st.action ? "●" : "○"} ${st.raw}`,
      );
    for (const n of s.notes) out.push(`       > ${n}`);
  }
  out.push(
    "\n● recorded in the browser   ○ render-only (edit and re-render in seconds)",
  );
  return out.join("\n");
}
