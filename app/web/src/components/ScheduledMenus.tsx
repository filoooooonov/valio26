import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { dayLabel, money } from "../format";
import {
  Button,
  Card,
  Checkbox,
  Dialog,
  Icon,
  Notice,
  Segmented,
  Tag,
  TextLink,
} from "../ui";
import {
  DAYS,
  monthlyProjection,
  occurrences,
  shiftDate,
  todayHelsinki,
  validSchedule,
  type Schedule,
} from "../recurring";
import {
  DELIVERY_PLACES,
  DELIVERY_TIMES,
  RESTAURANT_DELIVERY,
  type DeliveryChoice,
} from "./DeliveryPicker";
import { ScheduleDate, ScheduleTime } from "./ScheduleDateTime";
import "./scheduled-menus.css";

export type ScheduleSeed = {
  name: string;
  dishes: string[];
  people: number;
  dietary: string;
  estimate: number | null;
  delivery?: DeliveryChoice;
};
export function newSchedule(
  seed?: ScheduleSeed,
  delivery?: DeliveryChoice | null,
): Schedule {
  return {
    id: crypto.randomUUID(),
    name: seed?.name ?? "",
    dishes: seed?.dishes ?? [],
    people: seed?.people ?? 50,
    dietary: seed?.dietary ?? "",
    estimate: seed?.estimate ?? null,
    delivery: seed?.delivery ??
      delivery ?? {
        ...RESTAURANT_DELIVERY,
        date: todayHelsinki(),
        time: "8\u201310",
      },
    weekdays: [1],
    purchaseTime: "09:00",
    leadDays: 2,
    startDate: todayHelsinki(),
    limit: 500,
    paused: false,
    skipped: [],
  };
}

export function ScheduledMenus({
  schedules,
  editor,
  onEdit,
  onSave,
  onDelete,
  onPrepare,
  onBack,
  delivery,
  notice,
}: {
  schedules: Schedule[];
  editor: Schedule | null;
  onEdit: (s: Schedule | null) => void;
  onSave: (s: Schedule) => boolean;
  onDelete: (id: string) => void;
  onPrepare: (s: Schedule, date: string) => void;
  onBack: () => void;
  delivery: DeliveryChoice | null;
  notice: string;
}) {
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");
  const [source, setSource] = useState<"saved" | "previous" | null>(null);
  const [previous, setPrevious] = useState<ScheduleSeed[]>([]);
  const [loading, setLoading] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [month, setMonth] = useState(todayHelsinki().slice(0, 7));
  useEffect(() => {
    if (source !== "previous") return;
    let active = true;
    setLoading(true);
    setSourceError("");
    void (async () => {
      try {
        const orders = (await api.orders()).filter(
          (o) => o.status === "placed",
        );
        const seeds = await Promise.all(
          orders.slice(0, 10).map(async (o) => {
            const b = await api.basket(o.basketId);
            return {
              name: b.dishes.map((d) => d.name).join(", "),
              dishes: b.dishes.map((d) => d.name),
              people: b.people,
              dietary: [...new Set(b.dishes.flatMap((d) => d.diet))].join(", "),
              estimate: b.total,
            };
          }),
        );
        if (active) setPrevious(seeds);
      } catch {
        if (active)
          setSourceError(
            "Could not load previous orders. Close this window and try again, or create a menu from scratch.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [source]);

  const projections = schedules.map((s) => ({
    schedule: s,
    ...monthlyProjection(s, month),
  }));
  const total = projections.reduce((sum, p) => sum + (p.total ?? 0), 0);
  const deliveryCount = projections.reduce((sum, p) => sum + p.count, 0);
  const unknown = projections.some((p) => p.count > 0 && p.total === null);
  const upcoming = schedules
    .flatMap((s) =>
      occurrences(s)
        .slice(0, 1)
        .map((date) => ({ s, date, purchase: shiftDate(date, -s.leadDays) })),
    )
    .sort((a, b) =>
      (a.purchase + a.s.purchaseTime).localeCompare(
        b.purchase + b.s.purchaseTime,
      ),
    );
  const activeCount = schedules.filter((s) => !s.paused).length;
  const visible = schedules.filter(
    (s) => filter === "all" || (filter === "paused" ? s.paused : !s.paused),
  );
  const sourceMenus = source === "previous" ? previous : schedules;

  return (
    <main className="schedules">
      <div className="schedules__shell">
        <header className="schedules__heading">
          <div>
            <h1>Scheduled menus</h1>
            <p>Keep your regular menus and weekly deliveries in one place.</p>
          </div>
          <div className="schedules__heading-actions">
            <Button
              variant="secondary"
              icon="repeat"
              onClick={() => setSource("previous")}
            >
              Use a previous order
            </Button>
            <Button
              icon="plus"
              onClick={() => onEdit(newSchedule(undefined, delivery))}
            >
              Create scheduled menu
            </Button>
          </div>
        </header>
        {notice && (
          <div className="schedules__notice" role="status">
            <Notice
              tone={notice.startsWith("Could not") ? "amber" : "neutral"}
              icon={
                notice.startsWith("Could not")
                  ? "triangle-alert"
                  : "circle-check"
              }
            >
              {notice}
            </Notice>
          </div>
        )}

        <div className="schedules__layout">
          <section
            className="schedules__list"
            aria-label="Your scheduled menus"
          >
            <div className="schedules__toolbar">
              <Segmented
                label="Filter schedules"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: `All (${schedules.length})` },
                  { value: "active", label: `Active (${activeCount})` },
                  {
                    value: "paused",
                    label: `Paused (${schedules.length - activeCount})`,
                  },
                ]}
              />
              <TextLink onClick={() => setSource("saved")}>
                Reuse a saved menu
              </TextLink>
            </div>

            {!visible.length && (
              <Card className="schedule-empty">
                <div className="schedule-empty__body">
                  <div className="schedule-empty__symbol">
                    <Icon name="repeat" />
                  </div>
                  <h2>
                    {schedules.length
                      ? "No menus in this view"
                      : "Plan your first weekly menu"}
                  </h2>
                  <p>
                    {schedules.length
                      ? "Try another filter to find your scheduled menus."
                      : "Save the dishes you serve each week, choose your delivery days, and prepare each order when you are ready."}
                  </p>
                  {!schedules.length ? (
                    <div className="schedule-empty__actions">
                      <Button
                        icon="plus"
                        onClick={() => onEdit(newSchedule(undefined, delivery))}
                      >
                        Create your first schedule
                      </Button>
                      <TextLink onClick={onBack}>
                        Start with the shopping assistant
                      </TextLink>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => setFilter("all")}
                    >
                      Show all menus
                    </Button>
                  )}
                </div>
                {!schedules.length && (
                  <div
                    className="schedule-empty__steps"
                    aria-label="How scheduling works"
                  >
                    <span>
                      <Icon name="utensils" className="i-18" />
                      Save your menu
                    </span>
                    <span>
                      <Icon name="calendar" className="i-18" />
                      Choose delivery days
                    </span>
                    <span>
                      <Icon name="shield-check" className="i-18" />
                      Review each order
                    </span>
                  </div>
                )}
              </Card>
            )}

            <div className="schedule-cards">
              {visible.map((s) => {
                const next = occurrences(s)[0];
                const days = [1, 2, 3, 4, 5, 6, 0]
                  .filter((d) => s.weekdays.includes(d))
                  .map((d) => DAYS[d])
                  .join(", ");
                return (
                  <Card key={s.id} className="schedule-card">
                    <header className="schedule-card__head">
                      <div className="schedule-card__identity">
                        <div className="schedule-card__status">
                          <Tag tone={s.paused ? "grey" : "teal"}>
                            {s.paused ? "Paused" : "Active"}
                          </Tag>
                          <span>Every {days}</span>
                        </div>
                        <h2>{s.name}</h2>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`Edit ${s.name}`}
                        onClick={() => onEdit(s)}
                      >
                        Edit menu
                      </Button>
                    </header>
                    <p className="schedule-card__dishes">
                      {s.dishes.join(", ")}
                    </p>
                    <div className="schedule-card__facts">
                      <span>
                        <Icon name="users" className="i-16" />
                        {s.people} guests
                      </span>
                      <span>
                        <Icon name="truck" className="i-16" />
                        {s.delivery.placeName}
                      </span>
                    </div>
                    {next ? (
                      <div className="schedule-itinerary">
                        <div>
                          <span className="schedule-itinerary__label">
                            <Icon name="calendar" className="i-16" />
                            Prepare order
                          </span>
                          <strong>
                            {dayLabel(shiftDate(next, -s.leadDays))}
                            <span>{s.purchaseTime}</span>
                          </strong>
                        </div>
                        <Icon name="arrow-right" className="i-18" />
                        <div>
                          <span className="schedule-itinerary__label">
                            <Icon name="truck" className="i-16" />
                            Delivery
                          </span>
                          <strong>
                            {dayLabel(next)}
                            <span>{s.delivery.time}</span>
                          </strong>
                        </div>
                        <div className="schedule-itinerary__estimate">
                          <span className="schedule-itinerary__label">
                            Estimate per delivery
                          </span>
                          <strong>
                            {s.estimate === null
                              ? "Not priced yet"
                              : money(s.estimate)}
                          </strong>
                        </div>
                      </div>
                    ) : (
                      <div className="schedule-card__inactive">
                        <Icon
                          name={s.paused ? "clock" : "calendar"}
                          className="i-18"
                        />
                        <p>
                          {s.paused
                            ? "Your menu is saved. Resume whenever you are ready."
                            : "No upcoming delivery in the next 62 days. Check the start date."}
                        </p>
                      </div>
                    )}
                    <footer className="schedule-card__actions">
                      <TextLink
                        onClick={() => onSave({ ...s, paused: !s.paused })}
                      >
                        {s.paused ? "Resume schedule" : "Pause schedule"}
                      </TextLink>
                      {next && (
                        <>
                          <TextLink
                            onClick={() =>
                              onSave({ ...s, skipped: [...s.skipped, next] })
                            }
                          >
                            Skip {dayLabel(next)}
                          </TextLink>
                          <Button
                            className="schedule-card__prepare"
                            onClick={() => onPrepare(s, next)}
                          >
                            Prepare next order
                            <Icon name="arrow-right" className="i-16" />
                          </Button>
                        </>
                      )}
                    </footer>
                  </Card>
                );
              })}
            </div>
            <div className="schedules__control-note">
              <Notice icon="shield-check" title="You review every order">
                Schedules are saved on this device. Prepare and approve each
                order yourself; automatic ordering and notifications are not
                enabled.
              </Notice>
            </div>
          </section>

          <aside className="schedule-aside" aria-label="Schedule planning">
            <Card
              title="Your month ahead"
              icon={<Icon name="calendar" className="i-18" />}
            >
              <label className="schedule-month-field">
                Delivery month
                <input
                  type="month"
                  aria-label="Projection month"
                  min={todayHelsinki().slice(0, 7)}
                  value={month}
                  onChange={(e) =>
                    setMonth(e.target.value || todayHelsinki().slice(0, 7))
                  }
                />
              </label>
              <div className="schedule-month__estimate">
                <span>Estimated ingredients</span>
                <strong>{schedules.length ? money(total) : "\u2014"}</strong>
                <p>
                  {unknown
                    ? "Priced so far; some menus need an estimate."
                    : "Excl. VAT, based on your saved estimates."}
                </p>
              </div>
              <div className="schedule-month__deliveries">
                <span>Planned deliveries</span>
                <strong>{deliveryCount}</strong>
              </div>
              {!!deliveryCount && (
                <ul className="schedule-month__breakdown">
                  {projections
                    .filter((p) => p.count > 0)
                    .map((p) => (
                      <li key={p.schedule.id}>
                        <span>{p.schedule.name}</span>
                        <strong>{p.count}</strong>
                      </li>
                    ))}
                </ul>
              )}
              <p className="schedule-fine-print">
                {schedules.length
                  ? "Remaining deliveries only. Paused menus and skipped dates are excluded. Prices and stock are checked when you prepare an order."
                  : "Add a menu to see your upcoming deliveries and estimated ingredient costs."}
              </p>
            </Card>
            {upcoming[0] && (
              <Card
                title="Next to prepare"
                icon={<Icon name="clock" className="i-18" />}
              >
                <div className="schedule-next">
                  <strong>
                    {dayLabel(upcoming[0].purchase)},{" "}
                    {upcoming[0].s.purchaseTime}
                  </strong>
                  <p>{upcoming[0].s.name}</p>
                  <span>Helsinki time</span>
                </div>
                <TextLink onClick={() => onEdit(upcoming[0].s)}>
                  View schedule
                  <Icon name="arrow-right" className="i-16" />
                </TextLink>
              </Card>
            )}
            <div className="schedule-template">
              <Icon name="utensils" className="i-22" />
              <h2>A familiar place to start</h2>
              <p>Salmon soup and rye bread, ready to make your own.</p>
              <TextLink
                onClick={() =>
                  onEdit(
                    newSchedule(
                      {
                        name: "Weekly soup lunch",
                        dishes: ["Creamy salmon soup", "Rye bread"],
                        people: 50,
                        dietary: "Lactose-free options",
                        estimate: null,
                      },
                      delivery,
                    ),
                  )
                }
              >
                Use soup lunch menu
                <Icon name="plus" className="i-16" />
              </TextLink>
            </div>
          </aside>
        </div>
      </div>

      {editor && (
        <ScheduleEditor
          key={editor.id}
          existing={schedules.some((s) => s.id === editor.id)}
          initial={editor}
          onSave={onSave}
          onCancel={() => onEdit(null)}
          onDelete={onDelete}
          notice={notice}
        />
      )}
      {source && (
        <Dialog
          title={
            source === "previous"
              ? "Choose a previous order"
              : "Choose a saved menu"
          }
          onClose={() => setSource(null)}
          footer={
            <Button variant="secondary" onClick={() => setSource(null)}>
              Close
            </Button>
          }
        >
          <div className="schedule-sources">
            <p>
              {source === "previous"
                ? "Reuse the dishes from an order. Prices and availability will be checked again when you prepare it."
                : "Start a new schedule with dishes you have already saved."}
            </p>
            {loading && source === "previous" && (
              <p role="status">Loading previous orders...</p>
            )}
            {sourceError && source === "previous" && (
              <div role="alert">
                <Notice tone="amber">{sourceError}</Notice>
              </div>
            )}
            {!(source === "previous" && (loading || sourceError)) &&
              !sourceMenus.length && (
                <Notice>
                  {source === "previous"
                    ? "No previous orders yet. Create a menu from scratch to get started."
                    : "No saved menus yet. Create your first scheduled menu to save your regular dishes."}
                </Notice>
              )}
            <ul className="schedule-source-list">
              {sourceMenus.map((s, i) => (
                <li key={i}>
                  <div>
                    <h3>{s.name}</h3>
                    <p>
                      {s.people} guests, {s.dishes.length}{" "}
                      {s.dishes.length === 1 ? "dish" : "dishes"}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="plus"
                    aria-label={`Use ${s.name}`}
                    onClick={() => {
                      onEdit(newSchedule(s, delivery));
                      setSource(null);
                    }}
                  >
                    Use menu
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </Dialog>
      )}
    </main>
  );
}

export function ScheduleEditor({
  initial,
  existing,
  onSave,
  onCancel,
  onDelete,
  notice,
}: {
  initial: Schedule;
  existing: boolean;
  onSave: (s: Schedule) => boolean;
  onCancel: () => void;
  onDelete: (id: string) => void;
  notice: string;
}) {
  const nameInput = useRef<HTMLInputElement>(null);
  const [s, set] = useState(initial);
  const [dishes, setDishes] = useState(initial.dishes.join("\n"));
  const [placeOpen, setPlaceOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = (patch: Partial<Schedule>) => set((s) => ({ ...s, ...patch }));
  const candidate = {
    ...s,
    name: s.name.trim(),
    dishes: dishes
      .split("\n")
      .map((d) => d.trim())
      .filter(Boolean),
  };
  const valid = validSchedule(candidate);
  const next = valid
    ? occurrences({ ...candidate, paused: false })[0]
    : undefined;
  useEffect(() => {
    nameInput.current?.focus({ preventScroll: true });
  }, []);

  return (
    <Dialog
      className="schedule-editor"
      title={existing ? "Edit scheduled menu" : "Create scheduled menu"}
      onClose={onCancel}
      footer={
        <div className="schedule-editor__actions">
          <div className="schedule-editor__delete">
            {confirmDelete ? (
              <>
                <TextLink onClick={() => onDelete(s.id)}>
                  Confirm delete
                </TextLink>
                <TextLink onClick={() => setConfirmDelete(false)}>
                  Keep schedule
                </TextLink>
              </>
            ) : (
              existing && (
                <TextLink onClick={() => setConfirmDelete(true)}>
                  Delete schedule
                </TextLink>
              )
            )}
          </div>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="accent"
            type="submit"
            form="schedule-form"
            disabled={!valid}
          >
            {existing ? "Save changes" : "Save schedule"}
          </Button>
        </div>
      }
    >
      <p className="schedule-editor__intro">
        {existing
          ? "Make this weekly plan work for your kitchen."
          : "Your menu, delivered on the days you choose."}
      </p>
      <form
        id="schedule-form"
        className="schedule-editor__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && onSave(candidate)) onCancel();
        }}
      >
        <section
          className="schedule-editor__section"
          aria-labelledby="schedule-menu-heading"
        >
          <h3 id="schedule-menu-heading">
            <Icon name="utensils" className="i-18" />
            Your menu
          </h3>
          <div className="schedule-editor__identity">
            <label>
              Menu name
              <input
                ref={nameInput}
                id="schedule-name"
                required
                maxLength={120}
                placeholder="e.g. Monday team lunch"
                value={s.name}
                onChange={(e) => update({ name: e.target.value })}
              />
            </label>
            <label>
              Guests
              <input
                aria-label="Guests per delivery"
                type="number"
                min={1}
                max={10000}
                required
                value={s.people || ""}
                onChange={(e) => update({ people: Number(e.target.value) })}
              />
            </label>
          </div>
          <details
            className="schedule-editor__menu"
            open={initial.dishes.length ? undefined : true}
          >
            <summary>
              <span>
                <strong>
                  {candidate.dishes.length
                    ? candidate.dishes.join(", ")
                    : "Add dishes or items"}
                </strong>
                <small>
                  {s.dietary || "Confirm dietary needs before ordering"}
                </small>
              </span>
              <Icon name="chevron-down" className="i-16" />
            </summary>
            <div className="schedule-editor__menu-fields">
              <label>
                Dishes or items
                <textarea
                  required
                  rows={3}
                  placeholder={"Creamy salmon soup\nRye bread"}
                  value={dishes}
                  onChange={(e) => setDishes(e.target.value)}
                />
                <small>One dish or item per line.</small>
              </label>
              <label>
                Dietary needs and allergies
                <input
                  placeholder="e.g. 3 lactose-free; no nuts"
                  value={s.dietary}
                  onChange={(e) => update({ dietary: e.target.value })}
                />
              </label>
            </div>
          </details>
        </section>

        <section
          className="schedule-editor__section"
          aria-labelledby="schedule-delivery-heading"
        >
          <h3 id="schedule-delivery-heading">
            <Icon name="truck" className="i-18" />
            Delivery
          </h3>
          <fieldset className="schedule-editor__days">
            <legend>Deliver every week on</legend>
            <div className="schedule-weekdays">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <div key={d} className="schedule-weekday">
                  <Checkbox
                    label={DAYS[d]}
                    checked={s.weekdays.includes(d)}
                    onChange={(checked) =>
                      update({
                        weekdays: checked
                          ? [...s.weekdays, d].sort((a, b) => a - b)
                          : s.weekdays.filter((v) => v !== d),
                      })
                    }
                  />
                  <span>{DAYS[d].slice(0, 3)}</span>
                </div>
              ))}
            </div>
            {!s.weekdays.length && (
              <small role="alert">Choose at least one delivery day.</small>
            )}
          </fieldset>
          <div className="schedule-field-pair">
            <ScheduleDate
              value={s.startDate}
              onChange={(startDate) => update({ startDate })}
            />
            <ScheduleTime
              label="Delivery time"
              value={s.delivery.time}
              options={DELIVERY_TIMES}
              onChange={(time) => update({ delivery: { ...s.delivery, time } })}
            />
          </div>
          <div className="schedule-editor__location">
            <Icon name="truck" className="i-18" />
            <div>
              <strong>{s.delivery.placeName}</strong>
              <small>{s.delivery.address}</small>
            </div>
            <TextLink
              aria-expanded={placeOpen}
              onClick={() => setPlaceOpen(!placeOpen)}
            >
              Change<span className="sr-only"> location</span>
            </TextLink>
          </div>
          {placeOpen && (
            <fieldset className="schedule-inline-places">
              <legend>Saved delivery locations</legend>
              {[
                s.delivery,
                ...DELIVERY_PLACES.filter(
                  (p) => p.placeId !== s.delivery.placeId,
                ),
              ].map((place) => (
                <label key={place.placeId}>
                  <input
                    type="radio"
                    name="schedule-place"
                    checked={s.delivery.placeId === place.placeId}
                    onChange={() => {
                      update({ delivery: { ...s.delivery, ...place } });
                      setPlaceOpen(false);
                    }}
                  />
                  <span>
                    {place.placeName}
                    <small>{place.address}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
        </section>

        <section
          className="schedule-editor__section"
          aria-labelledby="schedule-purchasing-heading"
        >
          <h3 id="schedule-purchasing-heading">
            <Icon name="calendar" className="i-18" />
            Order preparation
          </h3>
          <div className="schedule-field-pair">
            <label>
              Prepare order
              <select
                value={s.leadDays}
                onChange={(e) => update({ leadDays: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    {d} {d === 1 ? "day" : "days"} before delivery
                  </option>
                ))}
              </select>
            </label>
            <ScheduleTime
              label="At (Helsinki time)"
              value={s.purchaseTime}
              options={Array.from(
                { length: 48 },
                (_, i) =>
                  String(Math.floor(i / 2)).padStart(2, "0") +
                  ":" +
                  (i % 2 ? "30" : "00"),
              )}
              onChange={(purchaseTime) => update({ purchaseTime })}
            />
          </div>
          <details className="schedule-editor__costs">
            <summary>
              Cost estimate and review limit
              <Icon name="chevron-down" className="i-16" />
            </summary>
            <div className="schedule-field-pair">
              <label>
                Estimate per delivery (&euro;)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={s.estimate ?? ""}
                  placeholder="Optional"
                  onChange={(e) =>
                    update({
                      estimate:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Review threshold (&euro;)
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  required
                  value={s.limit || ""}
                  onChange={(e) => update({ limit: Number(e.target.value) })}
                />
              </label>
            </div>
            <small>
              Estimates exclude VAT. Orders above your threshold are flagged for
              review. Account approval rules still apply.
            </small>
          </details>
        </section>
        <div className="schedule-editor__preview" aria-live="polite">
          <div>
            <span>Prepare order</span>
            <strong>
              {next
                ? `${dayLabel(shiftDate(next, -s.leadDays))}, ${s.purchaseTime}`
                : "Choose your schedule"}
            </strong>
          </div>
          <Icon name="arrow-right" className="i-18" />
          <div>
            <span>Delivery</span>
            <strong>
              {next
                ? `${dayLabel(next)}, ${s.delivery.time}`
                : "No upcoming delivery"}
            </strong>
          </div>
        </div>
        <p className="schedule-editor__note">
          <Icon name="shield-check" className="i-16" />
          Saved on this device. You prepare and approve each order.
        </p>
        {s.paused && (
          <Notice>This schedule is paused. Saving keeps it paused.</Notice>
        )}
        {notice && (
          <div role="status">
            <Notice tone={notice.startsWith("Could not") ? "amber" : "neutral"}>
              {notice}
            </Notice>
          </div>
        )}
      </form>
    </Dialog>
  );
}
