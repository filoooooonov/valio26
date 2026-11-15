# Aimo UI kit and brand rules

Live guideline: **http://localhost:5173/?view=brand** (source: `BrandGuide.tsx`). Components: `index.tsx`.
Colours, type, spacing, radii and motion: `../tokens.css`, the only file that may contain raw values.

## Rules for every person and agent working in `app/web`

1. **Build new UI only from this kit** (`import { Button, Cta, Dialog, … } from "./ui"`) and `tokens.css` values.
2. **A new component needs a heads-up.** If nothing here fits, stop and tell aleksei in plain words,
   *"I am creating a new component: <name>, because <reason>"*, before writing it. Then:
   add it to `index.tsx`, show it with all its states in `BrandGuide.tsx`, and add the file to the
   registry below. Don't make a local variant of an existing component.
3. **No raw colours.** No hex, `rgb()` or named colours outside `tokens.css`. Use the colour *role* from the
   brand page (teal = brand and primary, lime = the single commit action, lavender = the assistant,
   status colours always with an icon or words).
4. **Don't restyle kit components locally.** `className` on a kit component is for layout only (margin, grid area).
   To change how a component looks, change the kit and the brand page, and say so.
5. **Design every state:** default, hover, focus-visible, pressed, disabled, loading, empty, error.
6. **One lime action per screen.** Everything else primary is teal.
7. Product lists use the cart's `LineRow`. Modals use `Dialog`. Prices, dates and quantities use
   `money()`, `dayLabel()`/`slotLabel()` and `qtyLabel()` from `format.ts`.

`app/server/src/web-brand.test.ts` (fast suite, runs on every agent stop) fails when a raw colour appears outside
`tokens.css` or a component file is added without being registered below.

## Component registry

Every `.tsx` file in `components/` and `ui/` must be listed here. Adding a line is the
"I am creating a new component" moment: tell aleksei.

Kit (`ui/`):
- `index.tsx`: Button, TextLink, Cta, IconButton, Chip, Pill, Segmented, Stepper, Checkbox, Eyebrow, Tag, Notice,
  StatusDisc, Avatar, Card, ProductTile, Dialog, Popover (small anchored pop-up, scales from its trigger,
  closes on Escape/outside click; `icon` = assistant-glyph trigger on a product photo that shows the reasoning on click (`hover` also opens on hover/focus)), ReasonList (grey round check bullets); re-exports Icon, AimoLogo, AssistantBadge, AssistantGlyph, ThinkingMark
- `PurchaseOptions.tsx`: single-product comparison built from the replacement-card pattern (`.replacement-option*` in `components/replacement-dialog.css`): radio, availability chip, photo, name, brand · SKU, pack maths + unit price to 3 decimals, order total + difference, one-line note; up to three orderable products and the cards replace the cart row; unavailable ones are listed only in the dialog. Header with "Decided by you" badge; "How we chose" opens the shared Dialog.
- `DecisionSummary.tsx`: exception-first order summary above the cart: three counts ("N usual · N adjusted · N need you", derived from `basket.summary`) and one quiet row per exception (amber for attention, surface for adjusted); a row can jump to its cart line. Routine lines get no row.
- `BrandGuide.tsx`: the brand guideline page

Screens and feature components (`components/`), built before the kit; new code inside them uses the kit:
- `AlternativeDraftReview.tsx`
- `OrderHistory.tsx`: order-history pop-up (kit Dialog): one row per past order (date, product count, total), lines folded inside; synthetic history clearly labelled
- `AppleDeliveryMap.tsx`
- `Chat.tsx`
- `DeliveryPicker.tsx`
- `EventRequirements.tsx`
- `Header.tsx`
- `Mark.tsx`
- `MenuProposal.tsx`: minimal inline menu review in the order panel (title, guests Stepper, dishes with Edit/Remove, add, compact diet + allergy toggles, one "Find ingredients" Button); no prices, stock or delivery
- `Mikko.tsx`
- `MinunAimo.tsx`
- `OrderPanel.tsx`
- `RecipeDialog.tsx`
- `ReplacementNotice.tsx`
- `Sheets.tsx`
- `States.tsx`

## Known inconsistencies to migrate (14 Nov audit)

The kit wraps what already ships; these places still use their own variants. Migrate them when you touch
the file (the file owner on the team board does it).

| Where | Today | Use |
|---|---|---|
| `MenuProposal.tsx` `.menu-proposal__approve` / `.menu-edit-dialog__save`, `Sheets.tsx` `.replacement-dialog__use`, `OrderPanel.tsx` `.order-done__view` | one-off button styles | `Button` |
| `.cta-block` (full-width teal) | second primary button style | `Button` (primary, lg) |
| `.loglink` | link with icon | `TextLink` |
| `.ans` / `.ans--primary` (chat answers), `.opt`, `.swapbtn`, `.tool`, `.send` | chat-only button styles | keep for now; new answers use `Button`/`Chip` |
| Separate `<dialog>` setups (AlternativeDraftReview, DeliveryPicker, RecipeDialog, SwapSheet, menu edit) and legacy `.scrim/.sheet` | each wires showModal, Escape and close motion itself | `Dialog` |
| `.btn--lg` defined twice in `app.css` (l. 1278 and l. 1801) | conflicting padding | one rule |
| `.cta--issues` colour scoped to `.order` in `order-polish.css` | the issues CTA is grey outside the cart | move into the Cta styles |
| Attention colour | decided 14 Nov: bright `--issue-yellow` (ink icons) for every attention marker and fill; `--amber-bg` (#fff4de) retired | `StatusDisc tone="amber"`, `Notice tone="amber"` |
| Unused tokens `--amber-bg`, `--brand-dark`, `--lime-light`, `--red`, `--line` | defined, never used | don't use; remove later |
| Type: self-hosted Geist | the official Aimo webfonts are National 2 Compressed + Matter | open decision for aleksei |

