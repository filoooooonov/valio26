/*
 * Aimo UI kit: the ONLY building blocks for new UI in app/web.
 * Every component here wraps the existing, already-shipped styles in app.css / tokens.css, so using it
 * changes nothing visually. Live catalogue: http://localhost:5173/?view=brand. Rules: ./README.md.
 *
 * Need something that is not here? Stop and tell aleksei you are creating a NEW component, add it to this
 * file, show it on the brand page (BrandGuide.tsx) and list it in README.md. Never restyle a kit component
 * locally; `className` is for layout (margin, grid placement) only.
 */
import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "../icons";
import { closePopup } from "../components/popupMotion";
import "../components/replacement-dialog.css";
import "./ui.css";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

type Btn = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  children?: ReactNode;
};

/* ---------- actions ---------- */

/**
 * Button: every ordinary action.
 * - primary (teal): the main action in a card, dialog or form.
 * - accent (lime): the ONE commit action on a screen (order, approve). Never two on one screen.
 * - secondary (white + petrol outline): alternatives next to a primary.
 * - ghost (blueberry outline): low-emphasis actions inside the assistant column (e.g. New request).
 */
export function Button({
  variant = "primary",
  size = "md",
  icon,
  loading,
  className,
  children,
  type = "button",
  ...rest
}: Btn & {
  variant?: "primary" | "accent" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  loading?: boolean;
}) {
  const base =
    variant === "ghost"
      ? "btn-ghost"
      : cx(
          "btn",
          variant === "primary" && "btn--teal",
          variant === "accent" && "btn--lime",
          variant === "secondary" && "btn--outline",
          size === "sm" && "btn--sm",
          size === "lg" && "btn--lg",
        );
  return (
    <button
      type={type}
      className={cx(base, className)}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Icon name="loader" className="i-16 spin" />
      ) : (
        icon && <Icon name={icon} className="i-16" />
      )}
      {children}
    </button>
  );
}

/** TextLink: inline teal text action ("Review options", "See all"). 44px tall hit area. */
export function TextLink({
  className,
  children,
  type = "button",
  ...rest
}: Btn) {
  return (
    <button type={type} className={cx("link", className)} {...rest}>
      {children}
    </button>
  );
}

/**
 * Cta: the full-width footer action of the order panel, optionally carrying the order total.
 * lime = commit (Review and confirm, Place order); teal = done/view; outline = secondary (Remind);
 * issues = unresolved product issues (attention colour, see brand page "Colour").
 */
export function Cta({
  tone = "lime",
  icon,
  label,
  total,
  loading,
  className,
  type = "button",
  ...rest
}: Omit<Btn, "children"> & {
  tone?: "lime" | "teal" | "outline" | "issues";
  icon?: IconName;
  label: ReactNode;
  total?: ReactNode;
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      className={cx("cta", `cta--${tone}`, className)}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Icon name="loader" className="i-18 spin" />
      ) : (
        icon && <Icon name={icon} className="i-18" />
      )}
      <span className="cta__label">{label}</span>
      {total != null && (
        <>
          <span className="grow" />
          <span className="cta__total">{total}</span>
        </>
      )}
    </button>
  );
}

/** IconButton: 44px round icon-only action (close, guests -/+). Always pass `label` (aria-label). */
export function IconButton({
  icon,
  label,
  plain,
  className,
  type = "button",
  ...rest
}: Omit<Btn, "children"> & { icon: IconName; label: string; plain?: boolean }) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cx("round", plain && "round--plain", className)}
      {...rest}
    >
      <Icon name={icon} className="i-18" />
    </button>
  );
}

/** Chip: a suggestion the assistant offers ("Make it 60 guests"). `example` = quieter starter prompt. */
export function Chip({
  icon,
  example,
  className,
  children,
  type = "button",
  ...rest
}: Btn & { icon?: IconName; example?: boolean }) {
  return (
    <button
      type={type}
      className={cx("chip", example && "chip--example", className)}
      {...rest}
    >
      {icon && <Icon name={icon} className="i-16" />}
      {children}
    </button>
  );
}

/** Pill: a grey 52px control in the order header (Recipe, Repeat). `plain` = read-only value. */
export function Pill({
  icon,
  plain,
  className,
  children,
  type = "button",
  ...rest
}: Btn & { icon?: IconName; plain?: boolean }) {
  const inner = (
    <>
      {icon && <Icon name={icon} className="i-16" />}
      {children}
    </>
  );
  if (plain)
    return <span className={cx("pill pill--plain", className)}>{inner}</span>;
  return (
    <button type={type} className={cx("pill", className)} {...rest}>
      {inner}
    </button>
  );
}

/* ---------- inputs ---------- */

/** Segmented: 2–3 mutually exclusive options (Delivery / Pickup). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="seg"
      role="radiogroup"
      aria-label={label}
      data-disabled={disabled || undefined}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className="seg__opt"
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Stepper: quantity in packs. Show the human quantity ("2 × 3 kg"), never a bare number. */
export function Stepper({
  value,
  onLess,
  onMore,
  lessDisabled,
  moreDisabled,
  busy,
  white,
}: {
  value: ReactNode;
  onLess: () => void;
  onMore: () => void;
  lessDisabled?: boolean;
  moreDisabled?: boolean;
  busy?: boolean;
  white?: boolean;
}) {
  return (
    <div className={cx("stepper", white && "stepper--white")}>
      <button
        type="button"
        className="stepper__btn"
        aria-label="Less"
        disabled={lessDisabled || busy}
        onClick={onLess}
      >
        <Icon name="minus" className="i-16" />
      </button>
      <span className="stepper__value" aria-live="polite">
        {busy ? <Icon name="loader" className="i-14 spin" /> : value}
      </span>
      <button
        type="button"
        className="stepper__btn"
        aria-label="More"
        disabled={moreDisabled || busy}
        onClick={onMore}
      >
        <Icon name="plus" className="i-16" />
      </button>
    </div>
  );
}

/** Checkbox: the 44px include/exclude toggle on a product row. */
export function Checkbox({
  checked,
  label,
  onChange,
  disabled,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="check"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="check__box">
        {checked && <Icon name="check" className="i-14" />}
      </span>
    </button>
  );
}

/* ---------- display ---------- */

/** Eyebrow: small uppercase teal label above a page title. */
export function Eyebrow({
  children,
  glyph,
}: {
  children: ReactNode;
  glyph?: boolean;
}) {
  return (
    <div className="eyebrow">
      {glyph && <span className="glyph" aria-hidden="true" />}
      {children}
    </div>
  );
}

/** Tag: tiny inline status next to a product name ("Swapped", "Chosen by you", "Left out"). */
export function Tag({
  tone = "teal",
  children,
}: {
  tone?: "teal" | "grey";
  children: ReactNode;
}) {
  return (
    <span className={cx("tag", tone === "grey" && "tag--grey")}>
      {children}
    </span>
  );
}

/** Notice: an inline message block. neutral = info, amber = needs attention, green = done/success. */
export function Notice({
  tone = "neutral",
  icon,
  title,
  children,
}: {
  tone?: "neutral" | "amber" | "green";
  icon?: IconName;
  title?: ReactNode;
  children?: ReactNode;
}) {
  const fallback: IconName =
    tone === "green"
      ? "circle-check"
      : tone === "amber"
        ? "triangle-alert"
        : "circle-alert";
  return (
    <div className={cx("notice", tone !== "neutral" && `notice--${tone}`)}>
      <Icon name={icon ?? fallback} className="i-16 notice__icon" />
      <div>
        {title && <b className="notice__title">{title}</b>}
        {children && <p className="notice__text">{children}</p>}
      </div>
    </div>
  );
}

/** StatusDisc: round icon badge for a state (amber = attention in bright issue yellow, red = blocked). */
export function StatusDisc({
  tone,
  icon,
  large,
}: {
  tone: "amber" | "red";
  icon: IconName;
  large?: boolean;
}) {
  return (
    <span
      className={cx("disc", `disc--${tone}`, large && "disc--32")}
      aria-hidden="true"
    >
      <Icon name={icon} className="i-16" />
    </span>
  );
}

/** Avatar: initials of a person. teal = buyer (Anna), berry = approver (Mikko). */
export function Avatar({
  initials,
  tone = "teal",
}: {
  initials: string;
  tone?: "teal" | "berry";
}) {
  return (
    <span className={cx("avatar", `avatar--${tone}`)} aria-hidden="true">
      {initials}
    </span>
  );
}

/** Card: white surface with optional title; used on lavender/grey backgrounds. */
export function Card({
  title,
  icon,
  children,
  className,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("card", className)}>
      {(title || icon) && (
        <div className="card__head">
          {icon}
          {title && <h3 className="card__title">{title}</h3>}
        </div>
      )}
      {children}
    </section>
  );
}

/** ProductTile: 52px product image with an icon fallback when no sponsor image exists. */
export function ProductTile({
  src,
  icon = "package",
}: {
  src?: string | null;
  icon?: IconName;
}) {
  return (
    <span className="tile">
      {src ? (
        <img src={src} alt="" loading="lazy" />
      ) : (
        <Icon name={icon} className="i-22" />
      )}
    </span>
  );
}

/* ---------- overlay ---------- */

/**
 * Dialog: the one modal. Native <dialog> (focus trap, Escape) with the shared enter/exit motion.
 * Render it only while open; `onClose` runs after the exit animation.
 */
export function Dialog({
  title,
  eyebrow,
  onClose,
  children,
  footer,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const close = () => closePopup(ref.current, onClose);
  return (
    <dialog
      ref={ref}
      className={cx("replacement-dialog", className)}
      aria-label={typeof title === "string" ? title : undefined}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <header className="replacement-dialog__head">
        <div>
          {eyebrow && <p className="replacement-dialog__eyebrow">{eyebrow}</p>}
          <h2>{title}</h2>
        </div>
        <IconButton icon="x" label="Close" onClick={close} />
      </header>
      {children}
      {footer && <footer className="ui-dialog__foot">{footer}</footer>}
    </dialog>
  );
}

/* ---------- brand marks (re-exported so everything comes from one place) ---------- */
export { Icon, type IconName } from "../icons";
export {
  AimoLogo,
  AssistantBadge,
  AssistantGlyph,
  ThinkingMark,
} from "../components/Mark";
