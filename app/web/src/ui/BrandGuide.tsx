/*
 * Brand guideline page (?view=brand): colours, type, spacing, motion, icons and every kit component in
 * its states, rendered from the real tokens and components so it cannot drift from the app.
 */
import { useEffect, useState, type ReactNode } from "react";
import type { Basket, BasketLine, StockLine } from "../api";
import { LineRow, type OrderProps } from "../components/OrderPanel";
import { ICON_NAMES } from "../icons";
import {
  AimoLogo,
  AssistantBadge,
  AssistantGlyph,
  Avatar,
  Button,
  Card,
  Checkbox,
  Chip,
  Cta,
  Dialog,
  Eyebrow,
  Icon,
  IconButton,
  Notice,
  Pill,
  ProductTile,
  Segmented,
  StatusDisc,
  Stepper,
  Tag,
  TextLink,
  ThinkingMark,
} from "./index";
import "./brand-guide.css";

/* ---------- colour roles (values are read live from tokens.css) ---------- */
type Swatch = { token: string; name: string; use: string; flag?: boolean };
const COLOURS: { group: string; lead: string; items: Swatch[] }[] = [
  {
    group: "Brand",
    lead: "Teal carries the brand: titles, primary actions, links, icons, focus and selection. Lime is reserved for the one commit action on a screen.",
    items: [
      {
        token: "teal",
        name: "Teal",
        use: "Primary buttons, titles, links, icons, focus ring, selected state.",
      },
      {
        token: "teal-deep",
        name: "Teal deep",
        use: "Hover of teal; total chip inside the CTA; text on lime.",
      },
      {
        token: "lime",
        name: "Lime",
        use: "Only the single commit action per screen (Review and confirm, Place order, Approve).",
      },
      {
        token: "lime-hover",
        name: "Lime hover",
        use: "Hover of lime actions only.",
      },
    ],
  },
  {
    group: "Assistant",
    lead: "Lavender means the assistant is speaking. Use it in the chat column and for the approver, never for products or prices.",
    items: [
      {
        token: "blueberry-light",
        name: "Blueberry light",
        use: "Assistant column background, notes from people.",
      },
      {
        token: "blueberry",
        name: "Blueberry",
        use: "Borders of chips, composer and ghost buttons in the assistant column; approver avatar.",
      },
      {
        token: "plum",
        name: "Plum",
        use: "Approver (Mikko) accents and the quiet attention dot.",
      },
    ],
  },
  {
    group: "Neutrals",
    lead: "Text is ink; everything secondary is text-2. Grey surface for controls, light blue for hover and product tiles.",
    items: [
      { token: "ink", name: "Ink", use: "Body text." },
      {
        token: "text-2",
        name: "Text 2",
        use: "Secondary text, meta, disabled labels.",
      },
      {
        token: "muted",
        name: "Muted",
        use: "Tertiary text inside dialogs (product facts, notes).",
      },
      { token: "white", name: "White", use: "Main surfaces, cards, dialogs." },
      {
        token: "surface",
        name: "Surface",
        use: "Grey control background: pills, stepper, segmented, disabled CTA.",
      },
      {
        token: "light-blue",
        name: "Light blue",
        use: "Hover of outline buttons and chips; product tile; selected option.",
      },
      {
        token: "petrol-15",
        name: "Petrol 15",
        use: "Outline-button border, pressed chip, hover of grey controls.",
      },
      { token: "hair", name: "Hair", use: "Dividers and card borders (1px)." },
      { token: "scrim", name: "Scrim", use: "Backdrop behind dialogs." },
    ],
  },
  {
    group: "Status",
    lead: "Status colours describe a product or order state. Always pair them with an icon or words, never colour alone.",
    items: [
      {
        token: "green",
        name: "Green",
        use: "Placed, available, done (icon and text).",
      },
      {
        token: "green-bg",
        name: "Green bg",
        use: "Success notice background.",
      },
      {
        token: "issue-yellow",
        name: "Attention yellow",
        use: "Every attention marker and fill: StatusDisc, amber Notice, approval reason, open-issue marker, issues CTA. Icons and text on it are ink.",
      },
      {
        token: "amber",
        name: "Amber",
        use: "Attention as text only, on white (e.g. the problem line in a replacement option).",
      },
      {
        token: "red-ink",
        name: "Red ink",
        use: "Blocked or unavailable reason text.",
      },
      {
        token: "red-light",
        name: "Red light",
        use: "Background of the blocked status disc.",
      },
      {
        token: "issue-yellow-hover",
        name: "Attention yellow hover",
        use: "Hover of the issues CTA.",
      },
      {
        token: "issue-bg",
        name: "Attention tint",
        use: "Hover background of an open issue row.",
      },
    ],
  },
  {
    group: "Defined but unused: do not use",
    lead: "These tokens exist in tokens.css but nothing uses them. Using one counts as introducing a new colour: ask first.",
    items: [
      {
        token: "amber-bg",
        name: "Amber bg (retired)",
        use: "Replaced by attention yellow everywhere (14 Nov). Do not use.",
        flag: true,
      },
      { token: "brand-dark", name: "Brand dark", use: "Unused.", flag: true },
      { token: "lime-light", name: "Lime light", use: "Unused.", flag: true },
      {
        token: "red",
        name: "Red",
        use: "Unused (use red-ink for text).",
        flag: true,
      },
      { token: "line", name: "Line", use: "Unused (use hair).", flag: true },
    ],
  },
];

function useTokenValue(token: string) {
  const [v, setV] = useState("");
  useEffect(() => {
    setV(
      getComputedStyle(document.documentElement)
        .getPropertyValue(`--${token}`)
        .trim(),
    );
  }, [token]);
  return v;
}

function SwatchCard({ s }: { s: Swatch }) {
  const value = useTokenValue(s.token);
  return (
    <div className={"swatch" + (s.flag ? " swatch--flag" : "")}>
      <div
        className="swatch__chip"
        style={{ background: `var(--${s.token})` }}
      />
      <div className="swatch__body">
        <div className="swatch__name">
          {s.name}
          <code>{value}</code>
        </div>
        <code className="swatch__use">--{s.token}</code>
        <div className="swatch__use">{s.use}</div>
      </div>
    </div>
  );
}

/* ---------- type ---------- */
const TYPE: { role: string; token: string; el: ReactNode }[] = [
  {
    role: "Page title",
    token: "fs-40 · bold · teal",
    el: (
      <span
        style={{
          fontSize: "var(--fs-40)",
          fontWeight: "var(--w-bold)",
          color: "var(--teal)",
          lineHeight: "var(--lh-tight)",
          letterSpacing: "var(--tracking-display)",
        }}
      >
        Catering for 50
      </span>
    ),
  },
  {
    role: "Dialog title",
    token: "fs-28 · teal",
    el: (
      <span style={{ fontSize: "var(--fs-28)", color: "var(--teal)" }}>
        Choose a replacement
      </span>
    ),
  },
  {
    role: "Section / card title",
    token: "fs-22 · bold",
    el: (
      <span
        style={{
          fontSize: "var(--fs-22)",
          fontWeight: "var(--w-bold)",
          letterSpacing: "var(--tracking-display)",
        }}
      >
        Filled mini croissants
      </span>
    ),
  },
  {
    role: "CTA label",
    token: "fs-18 · bold",
    el: (
      <span style={{ fontSize: "var(--fs-18)", fontWeight: "var(--w-bold)" }}>
        Review and confirm
      </span>
    ),
  },
  {
    role: "Product name",
    token: "fs-15 · bold",
    el: (
      <span style={{ fontSize: "var(--fs-15)", fontWeight: "var(--w-bold)" }}>
        Valio butter 500 g unsalted
      </span>
    ),
  },
  {
    role: "Body / chat",
    token: "fs-15 · lh-chat",
    el: (
      <span style={{ fontSize: "var(--fs-15)", lineHeight: "var(--lh-chat)" }}>
        I planned 5 dishes for 50. Prices are your Hotelli Kaleva prices.
      </span>
    ),
  },
  {
    role: "UI default",
    token: "fs-14",
    el: <span style={{ fontSize: "var(--fs-14)" }}>Delivery Nov 20, 6–8</span>,
  },
  {
    role: "Secondary",
    token: "fs-13 · text-2",
    el: (
      <span style={{ fontSize: "var(--fs-13)", color: "var(--text-2)" }}>
        Checked 59 products only · 4 calls to Valio Aimo
      </span>
    ),
  },
  {
    role: "Meta",
    token: "fs-12 · text-2",
    el: (
      <span style={{ fontSize: "var(--fs-12)", color: "var(--text-2)" }}>
        Prices exclude VAT.
      </span>
    ),
  },
  {
    role: "Eyebrow",
    token: "fs-12 · bold · uppercase",
    el: <Eyebrow glyph>Order draft · built from your request</Eyebrow>,
  },
  { role: "Micro / tag", token: "fs-11", el: <Tag>Swapped</Tag> },
];

/* ---------- product-row fixtures (sample data, not gateway data) ---------- */
const noop = () => undefined;
const stock = (o: Partial<StockLine> = {}): StockLine => ({
  sku: "464411",
  price: 3.3,
  priceWithTax: 3.75,
  taxRate: 0.135,
  customerPrice: true,
  comparisonPrice: 6.6,
  comparisonUnit: "KG",
  available: 40,
  cutoffPassed: false,
  deliverable: true,
  salesUnit: "ST",
  ...o,
});
const line = (o: Partial<BasketLine>): BasketLine => ({
  id: "b1",
  dishId: "d",
  needIds: [],
  sku: "464411",
  name: "Valio butter 500 g unsalted",
  brand: "Valio",
  qty: 2,
  pack: "500 g",
  why: "50 × 5 g = 250 g → 1 × 500 g",
  stock: stock(),
  total: 6.6,
  contains: ["milk"],
  claims: [],
  ...o,
});
const ROWS: { label: string; l: BasketLine; placed?: boolean }[] = [
  { label: "Default", l: line({}) },
  {
    label: "Swapped by the gateway",
    l: line({
      id: "b2",
      sku: "463971",
      name: "Arla Pro 1 kg Cheddar cheese slices",
      qty: 1,
      pack: "1 kg",
      total: 19.96,
      stock: stock({ sku: "463971", price: 19.96 }),
      replaced: { sku: "467966", name: "Valio cheese slices e800 g" },
      issue: {
        kind: "cutoff",
        text: "Ordering closed",
        options: [],
        decided: "463971",
        decidedBy: "gateway (same-use rule)",
      },
    } as Partial<BasketLine>),
  },
  {
    label: "Open issue",
    l: line({
      id: "b3",
      sku: "465285",
      name: "Reuter & Stolt Croissant vegan 56 pcs, deep frozen",
      qty: 1,
      pack: "4.48 kg",
      total: 33.28,
      stock: stock({
        sku: "465285",
        price: 33.28,
        deliverable: false,
        cutoffPassed: true,
      }),
      issue: {
        kind: "cutoff",
        text: "Ordering is closed for Fri, 20 Nov",
        options: [],
      },
    } as Partial<BasketLine>),
  },
  { label: "Left out", l: line({ id: "b4", qty: 0, total: 0 }) },
  { label: "Placed (read-only)", l: line({ id: "b5" }), placed: true },
];
const basket = {
  id: "brand-sample",
  date: "2026-11-20",
  people: 50,
  lines: ROWS.map((r) => r.l),
  dishes: [],
  total: 66.44,
  totalIfAccepted: 66.44,
  rules: {
    customer: "123",
    maxOrderEur: 500,
    maxDailyEur: 1500,
    swapsNeedOk: true,
    approver: "Mikko L.",
  },
} as unknown as Basket;
const orderProps = {
  busy: false,
  busyLine: null,
  onToggle: noop,
  onQty: noop,
  onSwap: noop,
} as unknown as OrderProps;

/* ---------- page helpers ---------- */
function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section className="brand__section" id={id}>
      <h2>{title}</h2>
      {lead && <p className="brand__lead">{lead}</p>}
      {children}
    </section>
  );
}
function Comp({
  name,
  code,
  use,
  children,
  chat,
}: {
  name: string;
  code: string;
  use: string;
  children: ReactNode;
  chat?: boolean;
}) {
  return (
    <div className="brand__comp">
      <div className="brand__comp-head">
        <h3>{name}</h3>
        <code>{code}</code>
      </div>
      <p className="brand__comp-use">{use}</p>
      <div className={chat ? "brand__panel brand__panel--chat" : undefined}>
        <div className="brand__states">{children}</div>
      </div>
    </div>
  );
}
const State = ({
  label,
  children,
  wide,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) => (
  <div className={"brand__state" + (wide ? " brand__wide" : "")}>
    <span className="brand__state-label">{label}</span>
    {children}
  </div>
);

const NAV = [
  ["rules", "Rules"],
  ["colour", "Colour"],
  ["type", "Type"],
  ["space", "Space & shape"],
  ["motion", "Motion"],
  ["marks", "Logo & marks"],
  ["icons", "Icons"],
  ["actions", "Actions"],
  ["inputs", "Inputs"],
  ["display", "Display"],
  ["overlay", "Dialog"],
  ["patterns", "Product row"],
  ["copy", "Words"],
];

export function BrandGuide() {
  const [seg, setSeg] = useState<"delivery" | "pickup">("delivery");
  const [qty, setQty] = useState(2);
  const [checked, setChecked] = useState(true);
  const [dialog, setDialog] = useState(false);

  return (
    <div className="brand">
      <header className="brand__top">
        <AimoLogo />
        <nav className="brand__nav" aria-label="Brand guide sections">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
      </header>
      <main className="brand__main">
        <div className="brand__intro">
          <Eyebrow glyph>Aimo assistant · brand guideline</Eyebrow>
          <h1>One look across the assistant, cart and approvals</h1>
          <p>
            Everything here is the real code: colours are read from{" "}
            <code>tokens.css</code> and every component is imported from{" "}
            <code>app/web/src/ui</code>. If it is not on this page, it is not
            part of the platform yet.
          </p>
        </div>

        <Section id="rules" title="Rules for people and agents">
          <ol className="brand__rules">
            <li>
              Build new UI only from <code>app/web/src/ui</code> components and{" "}
              <code>tokens.css</code> values.
            </li>
            <li>
              Need something that is not here? Say “I am creating a new
              component: …” to aleksei first, then add it to the kit, to this
              page and to <code>ui/README.md</code>.
            </li>
            <li>
              No raw colours, font sizes or radii outside{" "}
              <code>tokens.css</code>. A test fails if a hex colour appears
              anywhere else.
            </li>
            <li>
              Never restyle a kit component locally. <code>className</code> is
              for layout only (margin, grid placement).
            </li>
            <li>
              One lime action per screen. Teal for everything else that is
              primary.
            </li>
            <li>
              Every state is designed: default, hover, focus, pressed, disabled,
              loading, empty, error.
            </li>
          </ol>
        </Section>

        <Section
          id="colour"
          title="Colour"
          lead="Role first, value second. Pick the role that matches what you are showing; never pick a colour because it looks right."
        >
          {COLOURS.map((g) => (
            <div className="brand__group" key={g.group}>
              <h3>{g.group}</h3>
              <p className="brand__lead">{g.lead}</p>
              <div className="brand__swatches">
                {g.items.map((s) => (
                  <SwatchCard key={s.token} s={s} />
                ))}
              </div>
            </div>
          ))}
        </Section>

        <Section
          id="type"
          title="Type"
          lead="Geist, self-hosted (public/fonts, OFL). Weights 400, 500 and 700. Sizes come only from the --fs-* tokens."
        >
          <div className="brand__panel brand__type">
            {TYPE.map((t) => (
              <div className="brand__type-row" key={t.role}>
                <div>
                  <b style={{ fontSize: "var(--fs-13)" }}>{t.role}</b>
                  <br />
                  <code>{t.token}</code>
                </div>
                <div>{t.el}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          id="space"
          title="Space & shape"
          lead="4px grid. Controls are 44px tall at minimum (touch target), 52px for header controls, 60px for the cart CTA."
        >
          <div className="brand__panel">
            <dl className="brand__spec">
              <dt>
                Spacing<code>--s-*</code>
              </dt>
              <dd className="brand__scale">
                {[4, 8, 12, 16, 20, 24, 32, 40].map((n) => (
                  <div className="brand__scale-item" key={n}>
                    <div
                      className="brand__space"
                      style={{ height: `var(--s-${n})` }}
                    />
                    {n}
                  </div>
                ))}
              </dd>
              <dt>
                Radius<code>--r-*</code>
              </dt>
              <dd className="brand__scale">
                {[
                  ["6", "checkbox"],
                  ["10", "tile"],
                  ["12", "card, notice, dialog"],
                  ["16", "sheet, panel"],
                  ["20", "composer"],
                  ["pill", "buttons, chips, pills"],
                ].map(([r, use]) => (
                  <div className="brand__scale-item" key={r}>
                    <div
                      className="brand__radius"
                      style={{ borderRadius: `var(--r-${r})` }}
                    />
                    {r} · {use}
                  </div>
                ))}
              </dd>
              <dt>Heights</dt>
              <dd style={{ fontSize: "var(--fs-13)" }}>
                --hit 44 (every button) · --btn-h 40 (small button) ·
                --stepper-h 48 · --control-h 52 (pill, segmented) · --cta-h 60
                (cart CTA)
              </dd>
              <dt>Elevation</dt>
              <dd style={{ fontSize: "var(--fs-13)" }}>
                --shadow-card for cards on grey · --shadow-sheet for dialogs.
                Nothing else casts a shadow.
              </dd>
            </dl>
          </div>
        </Section>

        <Section
          id="motion"
          title="Motion"
          lead="Animate transform and opacity only. Ease-out for entering, nothing waits longer than 300 ms, and prefers-reduced-motion turns movement into a fade."
        >
          <div className="brand__panel">
            <dl className="brand__spec">
              <dt>
                Press<code>--dur-press 160ms · scale .97</code>
              </dt>
              <dd style={{ fontSize: "var(--fs-13)" }}>
                Every button shrinks slightly on press (global rule in app.css).
              </dd>
              <dt>
                Hover<code>--dur-hover 150ms</code>
              </dt>
              <dd style={{ fontSize: "var(--fs-13)" }}>
                Colour change only, pointer devices only.
              </dd>
              <dt>
                Enter<code>--dur-enter 220ms · --ease-out</code>
              </dt>
              <dd style={{ fontSize: "var(--fs-13)" }}>
                New chat turns and rows rise 6px and fade in (
                <code>.enter</code>).
              </dd>
              <dt>
                Dialog<code>180ms in · 200ms out</code>
              </dt>
              <dd style={{ fontSize: "var(--fs-13)" }}>
                Use <code>Dialog</code>; it owns the enter and exit
                (closePopup).
              </dd>
              <dt>Thinking</dt>
              <dd>
                <ThinkingMark />{" "}
                <span style={{ fontSize: "var(--fs-13)" }}>
                  The only looping animation: the assistant is working.
                </span>
              </dd>
            </dl>
          </div>
        </Section>

        <Section
          id="marks"
          title="Logo & marks"
          lead="Official Aimo logo and the assistant “A”. Never recolour, stretch or recreate them."
        >
          <div className="brand__panel">
            <dl className="brand__spec">
              <dt>
                Logo<code>AimoLogo</code>
              </dt>
              <dd>
                <AimoLogo />{" "}
                <span
                  style={{ fontSize: "var(--fs-13)", color: "var(--text-2)" }}
                >
                  Header only, 90 × 30.
                </span>
              </dd>
              <dt>
                Assistant badge<code>AssistantBadge</code>
              </dt>
              <dd>
                <AssistantBadge />{" "}
                <span
                  style={{ fontSize: "var(--fs-13)", color: "var(--text-2)" }}
                >
                  Next to every assistant message.
                </span>
              </dd>
              <dt>
                Assistant glyph<code>AssistantGlyph</code>
              </dt>
              <dd style={{ color: "var(--teal)" }}>
                <AssistantGlyph />{" "}
                <span
                  style={{ fontSize: "var(--fs-13)", color: "var(--text-2)" }}
                >
                  Inline, takes the text colour (eyebrows, tabs).
                </span>
              </dd>
            </dl>
          </div>
        </Section>

        <Section
          id="icons"
          title="Icons"
          lead="Lucide line icons, 2px stroke, currentColor. Sizes: i-13, i-14, i-16 (default), i-18 (CTA), i-20, i-22 (tiles). Use only these names."
        >
          <div className="brand__icons">
            {ICON_NAMES.map((n) => (
              <div className="brand__icon" key={n}>
                <Icon name={n} className="i-22" />
                <span>{n}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="actions" title="Actions">
          <div className="brand__panel">
            <Comp
              name="Button"
              code="<Button variant size icon loading>"
              use="Every ordinary action. primary = teal main action in a card or dialog; accent = the one commit action; secondary = alternative next to a primary; ghost = low-emphasis action in the assistant column."
            >
              <State label="Primary">
                <Button>Approve and send</Button>
              </State>
              <State label="Accent">
                <Button variant="accent">Place order</Button>
              </State>
              <State label="Secondary">
                <Button variant="secondary">Send back</Button>
              </State>
              <State label="Small">
                <Button variant="secondary" size="sm">
                  Edit
                </Button>
              </State>
              <State label="With icon">
                <Button variant="secondary" icon="repeat">
                  Repeat order
                </Button>
              </State>
              <State label="Loading">
                <Button loading>Checking prices</Button>
              </State>
              <State label="Disabled">
                <Button disabled>Approve and send</Button>
              </State>
              <State label="Hover (accent)">
                <button type="button" className="btn btn--lime is-hover">
                  Place order
                </button>
              </State>
              <State label="Focus">
                <button type="button" className="btn btn--teal is-focus">
                  Approve and send
                </button>
              </State>
            </Comp>
            <Comp
              chat
              name="Button · ghost"
              code={'<Button variant="ghost">'}
              use="Quiet action on the lavender assistant column, e.g. New request."
            >
              <State label="Default">
                <Button variant="ghost" icon="plus">
                  New request
                </Button>
              </State>
            </Comp>
            <Comp
              name="Cta"
              code="<Cta tone label total icon loading>"
              use="The full-width footer action of the cart. Carries the order total on the right. One per panel."
            >
              <State wide label="Lime · commit">
                <Cta label="Review and confirm" total="186,07 €" />
              </State>
              <State wide label="Teal · done">
                <Cta
                  tone="teal"
                  icon="file-text"
                  label="View order"
                  total="186,07 €"
                />
              </State>
              <State wide label="Outline · secondary">
                <Cta tone="outline" icon="bell" label="Remind Mikko" />
              </State>
              <State wide label="Issues · unresolved products">
                {/* the issue colour is scoped to the order panel (.order) in order-polish.css */}
                <div className="order">
                  <Cta
                    tone="issues"
                    icon="circle-alert"
                    label="Resolve 3 product issues"
                    total="186,07 €"
                  />
                </div>
              </State>
              <State wide label="Loading">
                <Cta label="Placing order" loading total="186,07 €" />
              </State>
              <State wide label="Disabled">
                <Cta label="Review and confirm" total="0,00 €" disabled />
              </State>
            </Comp>
            <Comp
              name="IconButton"
              code="<IconButton icon label plain>"
              use="44px round icon-only action: close, guests −/+. Always has an aria-label."
            >
              <State label="Default">
                <IconButton icon="x" label="Close" />
              </State>
              <State label="Plain">
                <IconButton icon="x" label="Close" plain />
              </State>
              <State label="Disabled">
                <IconButton icon="minus" label="Fewer guests" disabled />
              </State>
            </Comp>
            <Comp
              name="TextLink"
              code="<TextLink>"
              use="Inline teal action inside text or a row: Review options, See all. Underline on hover."
            >
              <State label="Default">
                <TextLink>Review options</TextLink>
              </State>
            </Comp>
            <Comp
              chat
              name="Chip"
              code="<Chip icon example>"
              use="Suggestions the assistant offers. example = quieter starter prompt on the empty screen."
            >
              <State label="Suggestion">
                <Chip>Make it 60 guests</Chip>
              </State>
              <State label="Starter">
                <Chip example icon="corner-down-right">
                  Catering for 50 on Saturday
                </Chip>
              </State>
              <State label="Hover">
                <button type="button" className="chip is-hover">
                  Deliver Thursday
                </button>
              </State>
              <State label="Pressed">
                <button type="button" className="chip is-pressed">
                  Deliver Thursday
                </button>
              </State>
              <State label="Disabled">
                <Chip disabled>Add a vegan main</Chip>
              </State>
            </Comp>
            <Comp
              name="Pill"
              code="<Pill icon plain>"
              use="Grey 52px control in the order header (Recipe, Repeat). plain = read-only value."
            >
              <State label="Action">
                <Pill icon="utensils">Recipe</Pill>
              </State>
              <State label="Read-only">
                <Pill plain icon="users">
                  <b>50 guests</b>
                </Pill>
              </State>
            </Comp>
          </div>
        </Section>

        <Section id="inputs" title="Inputs">
          <div className="brand__panel">
            <Comp
              name="Segmented"
              code="<Segmented label options value onChange>"
              use="Two or three mutually exclusive options (Delivery / Pickup)."
            >
              <State label="Default">
                <Segmented
                  label="Delivery or pickup"
                  value={seg}
                  onChange={setSeg}
                  options={[
                    { value: "delivery", label: "Delivery" },
                    { value: "pickup", label: "Pickup" },
                  ]}
                />
              </State>
              <State label="Disabled">
                <Segmented
                  label="Delivery or pickup"
                  value="delivery"
                  onChange={noop}
                  disabled
                  options={[
                    { value: "delivery", label: "Delivery" },
                    { value: "pickup", label: "Pickup" },
                  ]}
                />
              </State>
            </Comp>
            <Comp
              name="Stepper"
              code="<Stepper value onLess onMore>"
              use="Quantity in sales packs. Show the human quantity (2 × 500 g), never a bare number. Disable − at 1 and + at the stock limit."
            >
              <State label="Default">
                <Stepper
                  value={`${qty} × 500 g`}
                  lessDisabled={qty <= 1}
                  onLess={() => setQty(qty - 1)}
                  onMore={() => setQty(qty + 1)}
                />
              </State>
              <State label="At stock limit">
                <Stepper
                  value="14 × 1 l"
                  moreDisabled
                  onLess={noop}
                  onMore={noop}
                />
              </State>
              <State label="Busy">
                <Stepper value="2 × 500 g" busy onLess={noop} onMore={noop} />
              </State>
              <State label="On white">
                <Stepper
                  white
                  value="1 × 1 kg"
                  lessDisabled
                  onLess={noop}
                  onMore={noop}
                />
              </State>
            </Comp>
            <Comp
              name="Checkbox"
              code="<Checkbox checked label onChange>"
              use="Include or leave out a product row."
            >
              <State label="Toggle">
                <Checkbox
                  checked={checked}
                  label="Include butter"
                  onChange={setChecked}
                />
              </State>
              <State label="Off">
                <Checkbox
                  checked={false}
                  label="Include butter"
                  onChange={noop}
                />
              </State>
              <State label="Disabled">
                <Checkbox
                  checked
                  label="Include butter"
                  onChange={noop}
                  disabled
                />
              </State>
            </Comp>
          </div>
        </Section>

        <Section id="display" title="Display">
          <div className="brand__panel">
            <Comp
              name="Eyebrow"
              code="<Eyebrow glyph>"
              use="Small uppercase label above a page title."
            >
              <State label="With glyph">
                <Eyebrow glyph>Order draft · built from your request</Eyebrow>
              </State>
            </Comp>
            <Comp
              name="Tag"
              code="<Tag tone>"
              use="Tiny status after a product name. teal for what happened, grey for what is not ordered."
            >
              <State label="Teal">
                <Tag>Swapped</Tag>
              </State>
              <State label="Teal">
                <Tag>Chosen by you</Tag>
              </State>
              <State label="Grey">
                <Tag tone="grey">Left out</Tag>
              </State>
            </Comp>
            <Comp
              chat
              name="Notice"
              code="<Notice tone icon title>"
              use="Inline message. neutral = information, amber = needs attention (bright yellow), green = done."
            >
              <State wide label="Neutral">
                <Notice title="Under your 500 € order limit">
                  The daily limit is checked when you send.
                </Notice>
              </State>
              <State wide label="Amber">
                <Notice tone="amber" title="Cut-off soon">
                  Order by Nov 15, 17:00 for Friday delivery.
                </Notice>
              </State>
              <State wide label="Green">
                <Notice tone="green" title="Order placed">
                  Mikko approved at 15:23.
                </Notice>
              </State>
            </Comp>
            <Comp
              name="StatusDisc"
              code="<StatusDisc tone icon large>"
              use="Round state badge at the start of a card. amber = attention (bright yellow, ink icon), red = blocked."
            >
              <State label="Amber">
                <StatusDisc tone="amber" icon="triangle-alert" />
              </State>
              <State label="Red">
                <StatusDisc tone="red" icon="circle-x" />
              </State>
              <State label="Large">
                <StatusDisc tone="amber" icon="triangle-alert" large />
              </State>
            </Comp>
            <Comp
              name="Avatar"
              code="<Avatar initials tone>"
              use="A person in the approval route. teal = buyer, berry = approver."
            >
              <State label="Buyer">
                <Avatar initials="AK" />
              </State>
              <State label="Approver">
                <Avatar initials="ML" tone="berry" />
              </State>
            </Comp>
            <Comp
              name="ProductTile"
              code="<ProductTile src icon>"
              use="52px product image; falls back to a product icon when the sponsor has no image."
            >
              <State label="Image">
                <ProductTile src="https://www.valio.fi/cdn-cgi/image/format=auto/https://cdn-wp.valio.fi/valio-wp-network/sites/2/2026/06/valio-voi-suolaamaton-3002-500x500.png" />
              </State>
              <State label="Fallback">
                <ProductTile icon="milk" />
              </State>
            </Comp>
            <Comp
              chat
              name="Card"
              code="<Card title icon>"
              use="White surface for grouped content on a lavender or grey background."
            >
              <State wide label="Default">
                <Card
                  title="Mikko sent it back"
                  icon={<StatusDisc tone="amber" icon="undo-2" />}
                >
                  <p className="card__text">
                    Please use the trout instead of salmon.
                  </p>
                </Card>
              </State>
            </Comp>
          </div>
        </Section>

        <Section
          id="overlay"
          title="Dialog"
          lead="The one modal. Native dialog: focus trap, Escape and backdrop click close it, with the shared enter and exit motion. Do not build sheets or popovers by hand."
        >
          <div className="brand__panel">
            <div className="brand__states">
              <Button variant="secondary" onClick={() => setDialog(true)}>
                Open example dialog
              </Button>
            </div>
          </div>
          {dialog && (
            <Dialog
              eyebrow="Delivery Nov 20"
              title="Choose a replacement"
              onClose={() => setDialog(false)}
              footer={
                <>
                  <Button variant="secondary" onClick={() => setDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => setDialog(false)}>
                    Use this product
                  </Button>
                </>
              }
            >
              <Notice tone="amber" title="Ordering is closed for Fri, 20 Nov">
                Choose another product or leave it out.
              </Notice>
            </Dialog>
          )}
        </Section>

        <Section
          id="patterns"
          title="Product row"
          lead="The cart's product row (LineRow from OrderPanel) in each state. Any list of products uses this row; do not build another one."
        >
          <div className="brand__panel brand__rows order">
            {ROWS.map((r) => (
              <div
                key={r.l.id}
                className="brand__state"
                style={{ width: "100%" }}
              >
                <span className="brand__state-label">{r.label}</span>
                <div style={{ width: "100%" }}>
                  <LineRow
                    l={r.l}
                    b={basket}
                    p={orderProps}
                    frozen={!!r.placed}
                    placed={!!r.placed}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="brand__lead">
            Full chat and order flow states:{" "}
            <a href="?view=states">?view=states</a>.
          </p>
        </Section>

        <Section
          id="copy"
          title="Words"
          lead="Plain, specific, honest. The assistant prepares; people decide."
        >
          <div className="brand__panel brand__table-wrap">
            <table className="brand__table">
              <thead>
                <tr>
                  <th>Write</th>
                  <th>Not</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Order recorded, waiting for Mikko</td>
                  <td>Sent to Valio Aimo</td>
                  <td>
                    The prototype has no order API; orders are local records.
                  </td>
                </tr>
                <tr>
                  <td>
                    Order cut-off Nov 15, 17:00 · prices re-checked at approval
                  </td>
                  <td>Prices and stock are held until…</td>
                  <td>Nothing is reserved.</td>
                </tr>
                <tr>
                  <td>186,07 € · excl. VAT</td>
                  <td>€186.07 / 186.07</td>
                  <td>
                    Use <code>money()</code> from format.ts; Finnish format.
                  </td>
                </tr>
                <tr>
                  <td>Nov 20, 6–8</td>
                  <td>20.11.2026 06:00–08:00</td>
                  <td>
                    Use <code>dayLabel()</code> / <code>slotLabel()</code>.
                  </td>
                </tr>
                <tr>
                  <td>2 × 500 g</td>
                  <td>2</td>
                  <td>
                    Use <code>qtyLabel()</code>; quantities are packs.
                  </td>
                </tr>
                <tr>
                  <td>Valio butter 500 g unsalted</td>
                  <td>VALIO BUTTER 500G UNSALTED</td>
                  <td>
                    Use <code>niceName()</code> for catalogue names.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      </main>
    </div>
  );
}
