// Finds a script target the way a viewer reads the screen: role/name → label → placeholder → text, exact first.
// Shared by the recorder and --inspect so suggestions always match what recording will click.
export const ROLES = [
  "button",
  "link",
  "tab",
  "checkbox",
  "radio",
  "switch",
  "menuitem",
  "option",
  "textbox",
  "searchbox",
  "combobox",
  "heading",
  "dialog",
];

export function createTargets(page) {
  // ---- target resolution: role/name → label → placeholder → text; exact first, then substring ----
  async function regionScope(region) {
    for (const role of [
      "dialog",
      "region",
      "form",
      "navigation",
      "complementary",
      "group",
      "article",
    ]) {
      const l = page
        .getByRole(role, { name: region })
        .filter({ visible: true });
      if (await l.count()) return l.first();
    }
    const l = page
      .locator(
        "section,article,aside,form,fieldset,li,[role=dialog],[role=region],[role=group]",
      )
      .filter({ hasText: region, visible: true });
    let best = null,
      area = Infinity;
    for (let i = 0, n = Math.min(await l.count(), 40); i < n; i++) {
      const b = await l.nth(i).boundingBox();
      if (b && b.width * b.height < area) {
        area = b.width * b.height;
        best = l.nth(i);
      }
    }
    return best;
  }
  // "A" or "B": the first alternative that is on screen wins
  async function find(t) {
    let last;
    for (const text of t.alts ?? [t.text]) {
      last = await findOne({ ...t, text });
      if (last.loc || last.ambiguous) return last;
    }
    return last;
  }
  async function findOne(t) {
    const scope = t.region ? await regionScope(t.region) : page;
    if (!scope) return { error: `region "${t.region}" not found` };
    for (const exact of [true, false]) {
      const strategies = [
        ...ROLES.map((role) => scope.getByRole(role, { name: t.text, exact })),
        scope.getByLabel(t.text, { exact }),
        scope.getByPlaceholder(t.text, { exact }),
        scope.getByText(t.text, { exact }),
      ];
      for (const s of strategies) {
        const v = s.filter({ visible: true }),
          n = await v.count();
        if (!n) continue;
        if (t.nth)
          return n >= t.nth
            ? { loc: v.nth(t.nth - 1) }
            : { error: `only ${n} matches, #${t.nth} requested` };
        if (n > 1)
          return {
            error: `${n} visible matches; add #1…#${n} or in "<region>"`,
            ambiguous: true,
          };
        return { loc: v.first() };
      }
    }
    return { error: "no visible match" };
  }
  async function similar(text) {
    const words = text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2);
    const names = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          "button,a,[role=button],input,textarea,select,h1,h2,h3,h4,[role=tab],label,[role=checkbox]",
        ),
      ]
        .filter(
          (e) =>
            e.getClientRects().length &&
            getComputedStyle(e).visibility !== "hidden",
        )
        .map((e) =>
          (
            e.getAttribute("aria-label") ||
            e.getAttribute("placeholder") ||
            e.innerText ||
            e.value ||
            ""
          )
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 70),
        )
        .filter(Boolean),
    );
    const uniq = [...new Set(names)];
    const close = uniq.filter((n) =>
      words.some((w) => n.toLowerCase().includes(w)),
    );
    return (close.length ? close : uniq).slice(0, 12);
  }
  return { find, findOne, similar, regionScope };
}
