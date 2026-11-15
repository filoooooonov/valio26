import { useEffect, useState } from 'react';
import type { BasketLine } from '../api';
import { niceName } from '../format';
import { Icon } from '../icons';
import { TextLink } from '../ui';
import { useProductImage } from './OrderPanel';
import './replacement-notice.css';

type Props = { lines: BasketLine[]; reasons?: Map<string, string>; date: string; onReview: (lineId: string) => void; busy: boolean };

function IssuePhoto({ line }: { line: BasketLine }) {
  const cached = useProductImage(line.sku);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [line.sku]);
  const source = cached ?? line.image;
  return <span className="replacement-notice__photo">{source && !failed ? <img src={source} alt="" loading="lazy" onError={() => setFailed(true)} /> : <Icon name="package" className="i-22" />}</span>;
}

// Compact issue summary in chat. Removing an unavailable item happens in the cart (inline, no pop-up, S51);
// here it only offers replacements when there are any. Short stock opens the shared dialog ("keep what's available").
// An accordion: the heading (same count as "need you") toggles the list.
export function ReplacementNotice({ lines, reasons, onReview, busy }: Props) {
  if (!lines.length) return null;
  return <details className="replacement-notice enter" aria-label="Product issues">
    <summary className="replacement-notice__heading"><span className="replacement-notice__attention" aria-hidden="true"><Icon name="triangle-alert" className="i-18" /></span><p>{lines.length === 1 ? 'One product needs your review' : `${lines.length} products need your review`}</p><Icon name="chevron-down" className="i-16 replacement-notice__chevron" /></summary>
    <ul className="replacement-notice__items">{lines.map(line => {
      const short = line.issue?.kind === 'short';
      const issue = !!line.issue && !line.issue.decided;
      // Lines blocked by a check (no contract price, unverified diet …) show the gateway's reason without the product name.
      const reason = !issue ? (reasons?.get(line.id) ?? 'Needs review').replace(line.name + ': ', '') : line.issue?.kind === 'cutoff' ? 'Order cut-off passed' : short ? 'Not enough stock for your order' : 'Not available for this delivery';
      const copy = <><IssuePhoto line={line} /><span className="replacement-notice__copy"><strong>{niceName(line.name)}</strong><span className="replacement-notice__problem">{reason}</span>{short && <span className="replacement-notice__action">Review options <Icon name="arrow-right" className="i-14" /></span>}{issue && !short && (line.issue?.options.length ?? 0) > 0 && <TextLink className="replacement-notice__replacements" disabled={busy} onClick={() => onReview(line.id)}>See replacements</TextLink>}</span></>;
      return <li key={line.id}>{issue && short
        ? <button className="replacement-notice__row" disabled={busy} onClick={() => onReview(line.id)} aria-label={`Review options for ${niceName(line.name)}`}>{copy}</button>
        : <div className="replacement-notice__row replacement-notice__row--static">{copy}</div>}
      </li>;
    })}</ul>
  </details>;
}
