// --inspect: list what a script can target on the current screen, as ready-to-paste steps.
// Every suggestion is checked with the same matcher the recorder uses, so it works as written.
import { createTargets } from "./targets.mjs";

const KIND_ORDER = [
  "dialog",
  "heading",
  "field",
  "button",
  "link",
  "tab",
  "checkbox",
  "text",
];

export async function inspectPage(page, log = console.log) {
  const { find } = createTargets(page);
  // Candidate names, read roughly the way a viewer would; the matcher below has the final say.
  const raw = await page.evaluate(() => {
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        // also hides content of closed <details> (content-visibility), matching Playwright's notion of visible
        e.checkVisibility({
          contentVisibilityAuto: true,
          visibilityProperty: true,
        }) &&
        !e.closest("[hidden],[aria-hidden=true]")
      );
    };
    const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
    const labelOf = (e) =>
      clean(e.getAttribute("aria-label")) ||
      clean([...(e.labels ?? [])].map((l) => l.innerText).join(" ")) ||
      clean(e.getAttribute("placeholder")) ||
      clean(e.getAttribute("title"));
    const region = (e) => {
      const r = e.parentElement?.closest(
        "[role=dialog],dialog,section[aria-label],article[aria-label],[role=region][aria-label],form[aria-label]",
      );
      return r
        ? clean(r.getAttribute("aria-label")) ||
            clean(r.querySelector("h1,h2,h3")?.innerText)
        : "";
    };
    const out = [];
    const add = (kind, e, name) => {
      name = clean(name).slice(0, 80);
      if (name && vis(e)) {
        const r = e.getBoundingClientRect();
        out.push({
          kind,
          name,
          region: region(e),
          offscreen: r.bottom < 0 || r.top > innerHeight,
          disabled: !!e.disabled || e.getAttribute("aria-disabled") === "true",
        });
      }
    };
    for (const e of document.querySelectorAll("[role=dialog],dialog[open]"))
      add(
        "dialog",
        e,
        e.getAttribute("aria-label") || e.querySelector("h1,h2,h3")?.innerText,
      );
    for (const e of document.querySelectorAll("h1,h2,h3,h4,[role=heading]"))
      add("heading", e, e.innerText);
    for (const e of document.querySelectorAll(
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea,select,[role=textbox],[role=combobox]",
    ))
      add("field", e, labelOf(e));
    for (const e of document.querySelectorAll(
      "button,[role=button],summary,input[type=submit]",
    ))
      add(
        "button",
        e,
        e.getAttribute("aria-label") ||
          e.innerText ||
          e.value ||
          e.getAttribute("title"),
      );
    for (const e of document.querySelectorAll("a[href],[role=link]"))
      add("link", e, e.getAttribute("aria-label") || e.innerText);
    for (const e of document.querySelectorAll("[role=tab]"))
      add("tab", e, e.getAttribute("aria-label") || e.innerText);
    for (const e of document.querySelectorAll(
      "input[type=checkbox],input[type=radio],[role=checkbox],[role=radio],[role=switch]",
    ))
      add("checkbox", e, labelOf(e) || e.closest("label")?.innerText);
    return out;
  });
  // one row per (kind, name); count repeats
  const rows = new Map();
  for (const c of raw) {
    const key = c.kind + "\u0000" + c.name;
    const row = rows.get(key) ?? { ...c, count: 0, regions: new Set() };
    row.count++;
    if (c.region) row.regions.add(c.region);
    row.offscreen &&= c.offscreen;
    row.disabled &&= c.disabled;
    rows.set(key, row);
  }
  const verb = {
    dialog: "zoom on",
    heading: "zoom on",
    field: 'type "…" into',
    button: "click",
    link: "click",
    tab: "click",
    checkbox: "click",
    text: "zoom on",
  };
  const lines = [];
  const seen = new Set();
  for (const kind of KIND_ORDER) {
    const group = [...rows.values()].filter(
      (r) => r.kind === kind && !seen.has(r.name),
    );
    if (!group.length) continue;
    lines.push(`\n  ${kind === "field" ? "fields" : kind + "s"}`);
    for (const r of group) {
      seen.add(r.name);
      const res = await find({ text: r.name, alts: [r.name] });
      let target,
        note = "";
      if (res.loc) target = `"${r.name}"`;
      else if (res.ambiguous) {
        const region = r.regions.size === 1 ? [...r.regions][0] : null;
        const scoped =
          region && (await find({ text: r.name, alts: [r.name], region })).loc;
        target = scoped ? `"${r.name}" in "${region}"` : `"${r.name}" #1`;
        note = res.error.replace(/;.*/, "");
      } else {
        target = `"${r.name}"`;
        note = "not matched by this name, try other visible text";
      }
      if (r.offscreen)
        note = [note, "below the fold, scrolls into view"]
          .filter(Boolean)
          .join("; ");
      if (r.disabled) note = [note, "disabled now"].filter(Boolean).join("; ");
      lines.push(`    ${verb[kind]} ${target}${note ? `   · ${note}` : ""}`);
    }
  }
  log(
    `\n◆ ${page.url()}${lines.length ? "" : "\n  (nothing targetable on screen)"}${lines.join("\n")}`,
  );
}

export async function inspectUrls(meta, paths, log = console.log) {
  const { chromium } =
    await import("../../../video/node_modules/playwright/index.mjs");
  const app = meta.app.replace(/\/$/, "");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: meta.width, height: meta.height },
      locale: "en-GB",
      timezoneId: "Europe/Helsinki",
    });
    for (let p of paths.length ? paths : ["/"]) {
      // Git Bash rewrites a bare "/" into its install path; "home" is a shell-safe alias
      if (/^[A-Za-z]:[\\/].*Git[\\/]?/.test(p) || p === "home") p = "/";
      await page.goto(
        /^https?:/.test(p) ? p : app + (p.startsWith("/") ? p : "/" + p),
        { waitUntil: "load" },
      );
      await page.waitForTimeout(1200);
      await inspectPage(page, log);
    }
  } finally {
    await browser.close();
  }
}
