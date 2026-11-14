# Demo video

Working recording and rendering commands from the repository root:

```powershell
bun run dev
node --no-warnings tools/demo-video/record.mjs
node tools/demo-video/render.mjs
node tools/demo-video/check.mjs
```

Install the existing video dependencies once with `cd video; bun install`, then `bunx playwright install chromium` if Chromium is absent. Node 22.20+ (TypeScript stripping), FFmpeg and ffprobe must be on PATH. The existing `video/` dependency installation is reused; these tools do not modify its source or outputs.

The revised movie is `artifacts/demo-video/smooth/final-smooth.mp4`, 1920 x 1080, 60 fps H.264, with burned-in captions and no voiceover. The first cut stays at `artifacts/demo-video/final.mp4`. `timeline.json` contains the editable timing and captions; `evidence.json` saves the actual baskets, orders and audit records. `APP_URL` and `GATEWAY` optionally change the default localhost ports 5173 and 8787.

The recorder drives the real webshop: request, basket, every open substitution, review, order, manager approval when required, and audit trail. It then runs the existing MCP milk agent script for real, records its transcript, checks the agent's HTTP 403 self-approval rejection, and approves that exact order in Mikko's view. Current daily spending can route the buyer order to approval; the recorder follows either branch. It never resets shared state or mocks API responses.

Orders are local, in-memory prototype records. There is no sponsor order endpoint, and the movie labels that limitation. The existing UI's wording about sending to Valio is part of the prototype and does not prove sponsor order submission. Planner waits are compressed in the edit; all resulting data and actions come from the live gateway.

Recording fails on a missing UI target or unresolved issue. Rendering and checking reject a cut over two minutes; the checker also validates resolution, codec, audit evidence and successful manager approval. Raw browser captures and clip intermediates are kept for review. Do not commit generated artifacts or customer evidence. Re-running recording creates new local orders and can increase daily spending.

The older `video/package.json` Remotion commands refer to incomplete files from another claimed session. Use the complete commands above for this cut. These complementary tools were added without changing that session's claimed WIP.

## Smooth motion revision

The default output folder for recording, rendering and checking is `artifacts/demo-video/smooth`. Set `DEMO_VIDEO_OUT` consistently for all three commands to choose another folder.

The recorder shows a 50px cursor with a lime halo, eased cursor travel and scrolling, deliberate hover/click pauses, a 650ms expanding click ring, and paced typing. It records focus/click events beside each clip. Actual actions retain their timing; only the planner loading wait is compressed.

The compositor uses quintic easing for camera pans and zooms, a 60fps camera pass, supersampling to reduce pixel stepping, and soft crossfades between scenes. Captions are added after the camera transform so they remain readable. The checker validates the live evidence, duration, camera events, 60fps output and preservation of action timing.

To try the app yourself, open http://localhost:5173, start a new request and enter: **Ingredients for a catering event for 50 people on Saturday, one vegan option**. Resolve the assistant's choices, then review and confirm. If approval is needed, approve the matching order at http://localhost:5173/?view=mikko and return to the buyer's **View order** button. Start both servers with `bun run dev` if needed. Repeated runs share the daily limit; orders remain local to the prototype.
User requested no further recording after the UI/menu-first changes. Existing cuts are preserved; they show the earlier flow. The current app requires selecting/adding categories in chat and pressing **Find products for this menu** before basket creation. See DEMO.md for the current hands-on walkthrough.
