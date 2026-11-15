import { useEffect, useState } from 'react';
import type { BasketLine } from '../api';
import { niceName } from '../format';
import { Icon } from '../icons';
import { Button, TextLink } from '../ui';
import { useProductImage } from './OrderPanel';
import './replacement-notice.css';

type Props = { lines: BasketLine[]; date: string; onReview: (lineId: string) => void; onRemove: (lineId: string) => void; busy: boolean };

function IssuePhoto({ line }: { line: BasketLine }) {
  const cached = useProductImage(line.sku);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [line.sku]);
  const source = cached ?? line.image;
  return <span className="replacement-notice__photo">{source && !failed ? <img src={source} alt="" loading="lazy" onError={() => setFailed(true)} /> : <Icon name="package" className="i-22" />}</span>;
}

// Compact issue summary in chat. Unavailable items are decided right here (remove, no pop-up, S51);
// short stock still opens the shared dialog, where "keep what's available" lives.
export function ReplacementNotice({ lines, onReview, onRemove, busy }: Props) {
  if (!lines.length) return null;
  return <section className="replacement-notice enter" aria-label="Product issues">
    <div className="replacement-notice__heading"><span className="replacement-notice__attention" aria-hidden="true"><Icon name="triangle-alert" className="i-18" /></span><p>{lines.length === 1 ? 'One product needs your review' : `${lines.length} products need your review`}</p></div>
    <ul className="replacement-notice__items">{lines.map(line => {
      const short = line.issue?.kind === 'short';
      const reason = line.issue?.kind === 'cutoff' ? 'Order cut-off passed' : short ? 'Not enough stock for your order' : 'Not available for this delivery';
      const copy = <><IssuePhoto line={line} /><span className="replacement-notice__copy"><strong>{niceName(line.name)}</strong><span className="replacement-notice__problem">{reason}</span>{short && <span className="replacement-notice__action">Review options <Icon name="arrow-right" className="i-14" /></span>}</span></>;
      return <li key={line.id}>{short
        ? <button className="replacement-notice__row" disabled={busy} onClick={() => onReview(line.id)} aria-label={`Review options for ${niceName(line.name)}`}>{copy}</button>
        : <div className="replacement-notice__row replacement-notice__row--static">{copy}<span className="replacement-notice__decide">
            <Button size="sm" variant="secondary" icon="x" disabled={busy} onClick={() => onRemove(line.id)} aria-label={`Remove ${niceName(line.name)}`}>Remove</Button>
            {(line.issue?.options.length ?? 0) > 0 && <TextLink disabled={busy} onClick={() => onReview(line.id)}>See replacements</TextLink>}
          </span></div>}
      </li>;
    })}</ul>
  </section>;
}
