import { qtyLabel } from "../format";

// "3 × 1 l" with the × drawn from a system font (Matter's × reads like ¤ at small sizes).
export function QtyText({ qty, pack }: { qty: number; pack: string }) {
  const [n, size] = qtyLabel(qty, pack).split(" × ");
  if (size == null) return <>{n}</>;
  return <>{n} <span className="times">×</span> {size}</>;
}
