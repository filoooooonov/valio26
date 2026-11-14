# Demo video from a plain-English script

Write what happens in a Markdown file. The tool drives the **real app**, records it at 2× resolution and renders a
1920×1080, 60 fps video with a smooth cursor, click ripples, eased camera zooms and dissolves between scenes. The video has
**no captions or audio**, so you can record a voiceover over it. A cue sheet tells you what to say and when.

## Quick start (30 seconds)

```powershell
bun run dev                                                     # app on :5173, gateway on :8787
node tools/demo-video/make.mjs tools/demo-video/scripts/smoke.md   # safe self-test: places no orders
```

Output in `artifacts/demo-video/<script name>/`:

| File | What |
|---|---|
| `video.mp4` | 1920×1080, 60 fps H.264, ready for a voiceover |
| `voiceover.md` | Cue sheet: each scene's start and end time, length and your `> Say:` lines |
| `captions.srt` | Scene titles and notes with timings, for an editor |
| `recording/` | Raw frames and the event log, so you can re-render without re-recording |

Requirements: Node 22.20+, FFmpeg and ffprobe on PATH, and Playwright from `video/` (`cd video; bun install; bunx playwright install chromium`).

## The edit loop

```powershell
node tools/demo-video/make.mjs tools/demo-video/scripts/pitch.md --dry           # check the script; ● = recorded, ○ = render-only
node tools/demo-video/make.mjs tools/demo-video/scripts/pitch.md --until "Agree on the menu before any lookup"   # record the first scenes only
node tools/demo-video/make.mjs tools/demo-video/scripts/pitch.md                 # record + render everything
# edit holds, zoom factors, "zoom out", ", cut", > Say lines, scene titles ...
node tools/demo-video/make.mjs tools/demo-video/scripts/pitch.md --render-only   # no browser, about real time
```

If you change what happens in the browser (a click, typed text, a URL) and use `--render-only`, the tool refuses and
names the scenes to re-record. `--captions` burns scene titles into the video as lower thirds.

## Script format

```markdown
---
title: Valio Aimo trusted purchasing
app: http://localhost:5173
viewport: 1600x900
camera: auto            # auto = zoom in while typing; manual = only your "zoom on" lines
---

# Anna asks for catering                      ← a scene = one cue in voiceover.md
open /
type "Ingredients for 50 people on Saturday" into "Message the assistant"
click "Send"
wait for "Your menu" up to 90s, cut           ← the waiting time is removed from the video
zoom on "Your menu" x1.3
hold 2s
zoom out
> Say: Nothing is looked up until Anna approves the menu.
```

| Step | Meaning | Re-render only? |
|---|---|---|
| `open /path` | Navigate (relative to `app`, or a full URL). Dissolves in. | |
| `click "Target"` | Eased cursor move, hover, click with ripple | |
| `hover "Target"` | Move the cursor there | |
| `type "text" into "Target"` | Click the field and type at a natural pace; the camera zooms in (auto mode) | |
| `press Enter` | Press a key | |
| `wait for "Target" [up to 60s] [, cut]` | Wait until it appears; `cut` removes the wait from the video | `cut`: yes |
| `zoom on "Target" [x1.4]` | Camera eases in to frame the target | factor: yes |
| `zoom out` | Camera eases back to the full screen | yes |
| `scroll to "Target"` | Eased scroll inside the right scroll container | |
| `hold 2s` | Freeze on the current frame | yes |
| `pause 2s` | Real-time wait, e.g. to let an animation play | |
| `card "Title" ["Eyebrow"]` | Full-screen brand title card (tokens.css colours, Geist) | |
| `run "command" as terminal` | Runs a real command from the repo root and types its real output into a terminal card | |
| `> Say: …` | Speaker note for the cue sheet; never rendered | yes |
| `<!-- … -->` | Comment | yes |

**Targets** are the words you see on screen. The tool tries, in order: a button, link, tab, checkbox, heading or dialog
by accessible name; then a label; a placeholder; and finally visible text. Exact matches are tried before partial ones.
- `"Approve and send" #2`: the second visible match.
- `"Use replacement" in "Delivery issue: Salmon"`: only inside that region.
- `"Place order" or "Send to Mikko for approval"`: whichever is on screen.
- `click "Review product option", optional`: skipped when it never appears. Works on click, hover, zoom on, scroll to and wait for.

If a target is missing or ambiguous, recording stops with the scene, the line number and the closest labels on screen.

## How it looks premium

- **Crisp:** frames are captured at device scale 2 (3200×1800), so a 1.5× zoom still has more source pixels than the output.
- **Smooth:** the cursor isn't recorded. Every mouse sample is logged and the cursor is drawn afterwards at 60 fps. Moves follow a slight arc with ease-in-out, settle briefly before a click and show a teal and lime ripple. Typing has natural, seeded jitter, and the cursor steps off the field so it never covers the text.
- **Camera:** quintic-eased zooms (no jerk), auto-framed to fit the target. It follows a click that would land outside a zoomed view and resets to the full screen on navigation.
- **Pacing:** loading waits marked `cut` are removed with a short dissolve. Everything else plays at real speed.

## Notes

- `pitch.md` creates a simulated local order and an approval, and runs `video/record/agent-milk.ts`. Run it on purpose. Repeated takes share today's spending in the local ledger.
- `smoke.md` never presses Send and places nothing.
- Generated files live in `artifacts/` and are not committed.
- Legacy: `record.mjs`, `render.mjs` and `check.mjs` drive the earlier, now outdated, hard-coded flow. They are kept for reference only.
