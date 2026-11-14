// THE file to edit when changing the demo video. Scenes play top to bottom.
// `bun run video:record` performs the "screen" scenes in a real browser against the live app and runs the
// "terminal" scenes for real; `bun run video:render` turns the recording into out/final.mp4.
//
// Rules:
// - Targets are functions of the Playwright page. Prefer roles + accessible names (what a user sees).
// - The live planner (Claude) can return a slightly different basket each run: mark steps that may not
//   apply as `optional: true` so the take continues instead of failing.
// - `compressTo` (seconds) speeds up a real wait in the edit. The wait is still recorded for real.
// - Keep the whole video ≤ 2:00 (Junction limit). `bun run video:check` prints the length.
// - Only erasable TypeScript here (Node runs this file directly): no enums, no namespaces.
import type { Page, Locator } from "playwright";

export type Target = (p: Page) => Locator;
export type Step =
  | { do: "pause"; ms: number; caption?: string }
  | {
      do: "click";
      target: Target;
      caption?: string;
      zoom?: number;
      hold?: number;
      optional?: boolean;
    }
  | {
      do: "type";
      target: Target;
      text: string;
      caption?: string;
      zoom?: number;
      hold?: number;
    }
  | {
      do: "focus";
      target: Target;
      caption?: string;
      zoom?: number;
      hold?: number;
      optional?: boolean;
    }
  | {
      do: "waitFor";
      target: Target;
      caption?: string;
      compressTo?: number;
      timeout?: number;
    };

export type Scene =
  | {
      id: string;
      kind: "title";
      title: string;
      subtitle?: string;
      seconds: number;
      vo?: string;
    }
  | { id: string; kind: "screen"; url: string; steps: Step[]; vo?: string }
  | { id: string; kind: "diagram"; title: string; seconds: number; vo?: string }
  | {
      id: string;
      kind: "terminal";
      title: string;
      script: string;
      caption?: string;
      vo?: string;
    };

const APP = process.env.APP_URL ?? "http://localhost:5173";
const HERO =
  "Ingredients for a catering event for 50 people on Saturday, one vegan option";

export const meta = {
  title: "Valio Aimo · Trusted Trade Agents",
  fps: 30,
  width: 1920,
  height: 1080,
  // Browser viewport (CSS px). Recorded at deviceScaleFactor so zooms stay sharp.
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1.6,
};

export const scenes: Scene[] = [
  {
    id: "intro",
    kind: "title",
    title: "Catering for 50, ordered in one line",
    subtitle:
      "An assistant inside the Valio Aimo webshop · every order checked against the buyer's mandate",
    seconds: 4,
  },
  {
    id: "buyer",
    kind: "screen",
    url: APP,
    steps: [
      {
        do: "pause",
        ms: 1200,
        caption:
          "Anna runs a hotel kitchen. She's in the Aimo webshop she already uses.",
      },
      {
        do: "type",
        target: (p) => p.getByPlaceholder("Describe what you need…"),
        text: HERO,
        caption: "She says what she needs, in one line",
        zoom: 1.7,
      },
      {
        do: "click",
        target: (p) => p.getByRole("button", { name: "Send" }),
        zoom: 1.7,
        hold: 600,
      },
      {
        do: "waitFor",
        target: (p) => p.getByRole("button", { name: /Review and confirm/ }),
        caption:
          "Claude plans the dishes. Only the shortlisted products are checked with Valio's price and stock APIs",
        compressTo: 4,
        timeout: 90_000,
      },
      {
        do: "focus",
        target: (p) => p.locator(".order").getByRole("heading").first(),
        caption:
          "A real basket: quantities per guest, her contract prices, Friday stock",
        zoom: 1.35,
        hold: 3200,
      },
      {
        do: "focus",
        target: (p) =>
          p
            .locator(".chat")
            .getByText(/calls to Valio/)
            .first(),
        caption:
          "It queried only these products, in a handful of calls. Never the whole catalogue",
        zoom: 2,
        hold: 3200,
        optional: true,
      },
      {
        do: "click",
        target: (p) =>
          p
            .locator(".chat")
            .getByRole("button", { name: /^(Use |Order |Keep )/ })
            .first(),
        caption:
          "Something can't arrive Friday? It proposes a swap. Anna decides",
        zoom: 1.8,
        hold: 2500,
        optional: true,
      },
      {
        do: "click",
        target: (p) =>
          p
            .locator(".chat")
            .getByRole("button", { name: /^(Use |Order |Keep )/ })
            .first(),
        zoom: 1.8,
        hold: 1500,
        optional: true,
      },
      {
        do: "click",
        target: (p) => p.getByRole("button", { name: /Review and confirm/ }),
        caption: "Inside her €500 mandate, so she can place it herself",
        zoom: 1.5,
        hold: 1800,
      },
      {
        do: "focus",
        target: (p) => p.getByRole("button", { name: /Place order/ }),
        caption:
          "Fixed prices, held until the cut-off. Nothing is ordered until she confirms",
        zoom: 1.5,
        hold: 2600,
      },
    ],
  },
  {
    id: "gateway",
    kind: "diagram",
    title: "One open gateway. The rules live in code, not in the prompt",
    seconds: 11,
  },
  {
    id: "agent",
    kind: "terminal",
    title: "An outside agent, same gateway, same rules",
    script: "record/agent-milk.ts",
    caption:
      "A hotel chain's agent orders 1,000 L of lactose-free milk over MCP. Over the mandate, so a human signs off",
  },
  {
    id: "outro",
    kind: "title",
    title: "Request → Lookup → Order → Approval",
    subtitle:
      "Open MCP + REST gateway · mandates enforced in code · a readable audit trail",
    seconds: 4,
  },
];
