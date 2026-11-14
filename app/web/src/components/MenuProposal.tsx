import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type { MenuCategory, MenuDraft } from "../menu";
import { addCategory, menuTitle } from "../menu";
import {
  ALLERGY_EXCLUSIONS,
  DIET_PREFERENCES,
  hardAllergen,
} from "../requirements";
import { Button, IconButton, Stepper } from "../ui";
import { Icon } from "../icons";
import { closePopup } from "./popupMotion";
import "./menu-proposal.css";
import "./event-requirements.css";

function MenuEditor({
  item,
  onSave,
  onCancel,
}: {
  item: MenuCategory;
  onSave: (next: MenuCategory) => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(item.title);
  const [note, setNote] = useState(item.description);
  useLayoutEffect(() => {
    dialog.current?.showModal();
    nameInput.current?.focus();
    nameInput.current?.select();
    return () => {
      dialog.current?.close();
    };
  }, []);
  const cancel = () =>
    closePopup(dialog.current, () => {
      dialog.current?.close();
      onCancel();
    });
  function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      nameInput.current?.focus();
      return;
    }
    closePopup(dialog.current, () => {
      dialog.current?.close();
      onSave({ ...item, title: name.trim(), description: note.trim() });
    });
  }
  return (
    <dialog
      ref={dialog}
      className="menu-edit-dialog"
      aria-labelledby="menu-edit-heading"
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        )
          cancel();
      }}
    >
      <form onSubmit={save}>
        <h3 id="menu-edit-heading">Edit dish</h3>
        <label htmlFor="menu-edit-name">Name</label>
        <input
          ref={nameInput}
          id="menu-edit-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <label htmlFor="menu-edit-note">Note for the chef (optional)</label>
        <textarea
          id="menu-edit-note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="menu-edit-dialog__actions">
          <Button variant="secondary" onClick={cancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </form>
    </dialog>
  );
}

function MenuRow({
  item,
  busy,
  onChange,
  onRemove,
}: {
  item: MenuCategory;
  busy: boolean;
  onChange: (next: MenuCategory) => void;
  onRemove: () => void;
}) {
  const editButton = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const finish = () => {
    setEditing(false);
    requestAnimationFrame(() => editButton.current?.focus());
  };
  return (
    <li className="menu-dish">
      <Icon name="utensils" className="i-16 menu-dish__icon" />
      <span className="menu-dish__name">{item.title}</span>
      <button
        ref={editButton}
        type="button"
        className="menu-item__edit"
        disabled={busy}
        aria-label={"Edit " + item.title}
        onClick={() => setEditing(true)}
      >
        Edit
      </button>
      <IconButton
        icon="x"
        plain
        label={"Remove " + item.title}
        disabled={busy}
        onClick={onRemove}
      />
      {editing && (
        <MenuEditor
          item={item}
          onCancel={finish}
          onSave={(next) => {
            onChange(next);
            finish();
          }}
        />
      )}
    </li>
  );
}

/** Minimal menu review (S50): "Is this what the customer wants to cook?" No products, prices, stock or delivery here. */
export function MenuProposal({
  menu,
  busy,
  onChange,
  onApprove,
  onInstruction,
}: {
  menu: MenuDraft;
  busy: boolean;
  onChange: (menu: MenuDraft) => void;
  onApprove: () => void;
  onInstruction?: (text: string) => void;
  compact?: boolean;
}) {
  const [addition, setAddition] = useState("");
  const req = menu.requirements ?? { people: 0, dietary: [], notes: "" };
  const [otherOpen, setOtherOpen] = useState(!!req.notes);
  const dishes = menu.categories.filter((item) => item.selected);
  const setReq = (next: Partial<typeof req>) =>
    onChange({ ...menu, requirements: { ...req, ...next } });
  const toggle = (label: string) =>
    setReq({
      dietary: req.dietary.includes(label)
        ? req.dietary.filter((d) => d !== label)
        : [...req.dietary, label],
    });
  // Labels detected from the request ("3 guests are lactose-free", "milk allergy") stay visible even if not a default chip.
  const diets = [
    ...DIET_PREFERENCES,
    ...req.dietary.filter(
      (d) => !hardAllergen(d) && !DIET_PREFERENCES.includes(d),
    ),
  ];
  const allergies = [
    ...ALLERGY_EXCLUSIONS,
    ...req.dietary.filter(
      (d) => hardAllergen(d) && !ALLERGY_EXCLUSIONS.includes(d),
    ),
  ];
  const hard = req.dietary.filter((d) => hardAllergen(d));
  const peopleOk =
    Number.isInteger(req.people) && req.people >= 1 && req.people <= 2000;
  const ready =
    !busy &&
    !menu.planning &&
    peopleOk &&
    dishes.length > 0 &&
    dishes.every((d) => d.title.trim());
  const chip = (label: string) => (
    <label
      key={label}
      className={
        "event-diet" +
        (req.dietary.includes(label) ? " event-diet--selected" : "")
      }
    >
      <input
        type="checkbox"
        checked={req.dietary.includes(label)}
        disabled={busy}
        onChange={() => toggle(label)}
      />
      {label}
    </label>
  );
  return (
    <section
      className="menu-review"
      aria-labelledby="menu-review-title"
      aria-busy={menu.planning || undefined}
    >
      <header className="menu-review__head">
        <h1 id="menu-review-title" className="order__title">
          {menuTitle(menu)}
        </h1>
        <div className="menu-review__guests">
          <span>Guests</span>
          <Stepper
            value={peopleOk ? req.people : "–"}
            busy={false}
            lessDisabled={busy || req.people <= 1}
            moreDisabled={busy || req.people >= 2000}
            onLess={() =>
              setReq({
                people: Math.max(1, req.people - (req.people > 20 ? 5 : 1)),
              })
            }
            onMore={() =>
              setReq({
                people: Math.min(
                  2000,
                  (req.people || 0) + (req.people >= 20 ? 5 : 1),
                ),
              })
            }
          />
        </div>
      </header>
      {menu.planning ? (
        <p className="menu-review__planning" role="status">
          <Icon name="loader" className="i-16 spin" />
          Suggesting dishes…
        </p>
      ) : (
        <>
          <ul className="menu-review__dishes" aria-label="Dishes">
            {dishes.map((item) => (
              <MenuRow
                key={item.id}
                item={item}
                busy={busy}
                onChange={(next) =>
                  onChange({
                    ...menu,
                    categories: menu.categories.map((c) =>
                      c.id === next.id ? next : c,
                    ),
                  })
                }
                onRemove={() =>
                  onChange({
                    ...menu,
                    categories: menu.categories.filter((c) => c.id !== item.id),
                  })
                }
              />
            ))}
            {!dishes.length && (
              <li className="menu-review__none">
                No dishes yet. Add one below.
              </li>
            )}
          </ul>
          <form
            className="menu-add menu-add--refined"
            onSubmit={(event) => {
              event.preventDefault();
              if (!addition.trim() || busy) return;
              if (
                onInstruction &&
                !/^[\p{L}\s'-]{1,40}$/u.test(addition.trim())
              )
                onInstruction(addition.trim());
              else onChange(addCategory(menu, addition));
              setAddition("");
            }}
          >
            <label className="sr-only" htmlFor="menu-add">
              Add a dish
            </label>
            <Icon name="plus" className="i-16" />
            <input
              id="menu-add"
              placeholder="Add a dish, e.g. green salad"
              value={addition}
              disabled={busy}
              onChange={(event) => setAddition(event.target.value)}
            />
            <button type="submit" disabled={busy || !addition.trim()}>
              Add
            </button>
          </form>
        </>
      )}
      <fieldset className="menu-review__diet" disabled={busy}>
        <legend>
          Dietary needs <small>Optional</small>
        </legend>
        <div className="event-diets">{diets.map(chip)}</div>
        <p className="menu-review__sub">Allergies: never substituted</p>
        <div className="event-diets">
          {allergies.map(chip)}
          <button
            type="button"
            className={
              "event-diet" + (otherOpen ? " event-diet--selected" : "")
            }
            aria-expanded={otherOpen}
            onClick={() => setOtherOpen((o) => !o)}
          >
            Other…
          </button>
        </div>
        {otherOpen && (
          <input
            className="menu-review__other"
            aria-label="Other restrictions"
            placeholder="e.g. no pork, halal"
            value={req.notes}
            onChange={(event) => setReq({ notes: event.target.value })}
          />
        )}
        {hard.length > 0 && (
          <p className="menu-review__hint">
            <Icon name="shield-check" className="i-14" />
            Products without catalogue proof of being{" "}
            {hard
              .map((d) => d.toLowerCase().replace(" allergy", "-free"))
              .join(", ")}{" "}
            are held for your review.
          </p>
        )}
      </fieldset>
      <div className="menu-review__foot">
        <Button
          className="menu-review__go"
          disabled={!ready}
          loading={busy && !menu.planning}
          icon={busy ? undefined : "arrow-right"}
          onClick={onApprove}
        >
          Find ingredients
        </Button>
        {!peopleOk && !menu.planning && (
          <p className="menu-review__missing" aria-live="polite">
            Set the number of guests to continue.
          </p>
        )}
      </div>
    </section>
  );
}
