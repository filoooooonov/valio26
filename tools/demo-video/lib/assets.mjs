// Cursor and click-ripple sprites, rendered once with the browser as transparent PNGs.
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

export const CURSOR = { width: 50, height: 65, hotX: 10, hotY: 6.25 };
export const RINGS = [26, 36, 46, 56, 66, 76].map((size, i, all) => ({
  size,
  opacity: 0.62 * (1 - i / all.length) + 0.06,
}));
const TEAL = "0,86,112",
  LIME = "192,224,33"; // --teal and --lime from app/web/src/tokens.css

export async function ensureAssets(dir) {
  const files = ["cursor.png", ...RINGS.map((_, i) => `ring${i}.png`)].map(
    (f) => resolve(dir, f),
  );
  if (files.every((f) => existsSync(f))) return dir;
  mkdirSync(dir, { recursive: true });
  const { chromium } =
    await import("../../../video/node_modules/playwright/index.mjs");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 200, height: 200 },
    });
    const shot = async (html, w, h, file) => {
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}</style>${html}`,
      );
      await page
        .locator("svg")
        .screenshot({ path: file, omitBackground: true });
    };
    await shot(
      `<svg width="${CURSOR.width}" height="${CURSOR.height}" viewBox="-6 -4 40 52"><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.6" flood-color="#003747" flood-opacity=".38"/></filter><path filter="url(#s)" d="M2 1 L2 31 L9.5 24 L14.5 35.5 L19.5 33.3 L14.6 22 L24.5 22 Z" fill="#23282d" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
      0,
      0,
      files[0],
    );
    for (const [i, r] of RINGS.entries()) {
      const c = r.size / 2;
      await shot(
        `<svg width="${r.size}" height="${r.size}"><circle cx="${c}" cy="${c}" r="${c - 2}" fill="rgba(${LIME},${(r.opacity * 0.35).toFixed(3)})" stroke="rgba(${TEAL},${r.opacity.toFixed(3)})" stroke-width="2.5"/></svg>`,
        0,
        0,
        files[i + 1],
      );
    }
  } finally {
    await browser.close();
  }
  return dir;
}
