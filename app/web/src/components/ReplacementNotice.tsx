import { useEffect, useState } from 'react';
import type { BasketLine } from '../api';
import { niceName } from '../format';
import { Icon } from '../icons';
import { TextLink } from '../ui';
import { useProductImage } from './OrderPanel';
import './replacement-notice.css';

type Props = { lines: BasketLine[]; date: string; onReview: (lineId: string) => void; busy: boolean };

function IssuePhoto({ line }: { line: BasketLine }) {
  const cached = useProductImage(line.sku);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [line.sku]);
  const source = cached ?? line.image;
  return <span className="replacement-notice__photo">{source && !failed ? <img src={source} alt="" loading="lazy" onError={() => setFailed(true)} /> : <Icon name="package" className="i-22" />}</span>;
}

// Compact issue summary in chat. Removing an unavailable item happens in the cart (inline, no pop-up, S51);
// here it only offers replacements when there are any. Short stock opens the shared dialog ("keep what's available").
export function ReplacementNotice({ lines, onReview, busy }: Props) {
  if (!lines.length) return null;
  return <section className="replacement-notice enter" aria-label="Product issues">
    <div className="replacement-notice__heading"><span className="replacement-notice__attention" aria-hidden="true"><Icon name="triangle-alert" className="i-18" /></span><p>{lines.length === 1 ? 'One product needs your review' : `${lines.length} products need your review`}</p></div>
    <ul className="replacement-notice__items">{lines.map(line => {
      const short = line.issue?.kind === 'short';
      const reason = line.issue?.kind === 'cutoff' ? 'Order cut-off passed' : short ? 'Not enough stock for your order' : 'Not available for this delivery';
      const copy = <><IssuePhoto line={line} /><span className="replacement-notice__copy"><strong>{niceName(line.name)}</strong><span className="replacement-notice__problem">{reason}</span>{short && <span className="replacement-notice__action">Review options <Icon name="arrow-right" className="i-14" /></span>}{!short && (line.issue?.options.length ?? 0) > 0 && <TextLink className="replacement-notice__replacements" disabled={busy} onClick={() => onReview(line.id)}>See replacements</TextLink>}</span></>;
      return <li key={line.id}>{short
        ? <button className="replacement-notice__row" disabled={busy} onClick={() => onReview(line.id)} aria-label={`Review options for ${niceName(line.name)}`}>{copy}</button>
        : <div className="replacement-notice__row replacement-notice__row--static">{copy}</div>}
      </li>;
    })}</ul>
  </section>;
}
