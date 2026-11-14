// Small inline line icons (24px grid, stroke = currentColor). No icon library.
const P: Record<string, string> = {
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  cart: "M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2M10 21h.01M18 21h.01",
  box: "M21 8 12 3 3 8v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z",
  sparkle:
    "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8zM5 15l.6 1.4L7 17l-1.4.6L5 19l-.6-1.4L3 17l1.4-.6z",
  camera:
    "M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  truck:
    "M1 4h13v12H1zM14 9h4l3 3v4h-7M5.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  alarm: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2 2M5 3 2 6M22 6l-3-3",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
  check: "M20 6 9 17l-5-5",
  checkCircle: "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3",
  warn: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
  chevron: "M9 18l6-6-6-6",
  chevronDown: "M6 9l6 6 6-6",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  chef: "M6 13.9A4 4 0 0 1 7 6a5 5 0 0 1 10 0 4 4 0 0 1 1 7.9V21H6zM6 17h12",
  bot: "M12 8V4H8M4 8h16v12H4zM2 14h2M20 14h2M9 13v2M15 13v2",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  plug: "M12 22v-5M9 8V2M15 8V2M18 8v5a6 6 0 0 1-12 0V8z",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
  x: "M18 6 6 18M6 6l12 12",
  fish: "M6.5 12c3-5 9-6 13-3l2-2v10l-2-2c-4 3-10 2-13-3zM2 12l4.5 0M16 11h.01",
  leaf: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6",
  bottle: "M10 2h4v3l2 3v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8l2-3z",
  wheat:
    "M2 22 16 8M12 4l2 2-2 2-2-2zM16 8l2 2-2 2-2-2zM8 8l2 2-2 2-2-2zM12 12l2 2-2 2-2-2z",
  berry:
    "M12 22a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM7 13a4 4 0 1 0-4-4M17 13a4 4 0 1 1 4-4M12 12V6l3-3",
  egg: "M12 22c4 0 7-3 7-7.5S16 2 12 2 5 10 5 14.5 8 22 12 22z",
  carrot:
    "M2.3 21.7S10 19 15 14a4 4 0 0 0-5-5c-5 5-7.7 12.7-7.7 12.7zM15 9l5-5M15 4l2 2M20 9l-2-2",
};

export function Icon({
  name,
  size = 20,
  className,
}: {
  name: keyof typeof P | string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={P[name] ?? P.box} />
    </svg>
  );
}

// Pick a product tile icon from the name / allergens.
export function productIcon(name: string, contains: string[] = []): string {
  const n = name.toLowerCase();
  if (contains.includes("fish") || /salmon|trout|lohi|fish|kala/.test(n))
    return "fish";
  if (/berry|mustikka|blueberr/.test(n)) return "berry";
  if (/egg|muna/.test(n)) return "egg";
  if (/carrot|potato|leek|onion|dill|peruna|porkkana/.test(n)) return "carrot";
  if (/bread|pastry|flour|leipä|rye/.test(n)) return "wheat";
  if (
    contains.includes("milk") ||
    /milk|cream|sauce|butter|cheese|edam|maito/.test(n)
  )
    return "bottle";
  return "leaf";
}
