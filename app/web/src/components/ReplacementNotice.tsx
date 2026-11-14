import { useEffect, useState } from 'react';
import type { BasketLine } from '../api';
import { dayLabel, niceName } from '../format';
import { Icon } from '../icons';
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

// Only a compact issue summary lives in chat; the shared dialog owns decisions.
export function ReplacementNotice({ lines, date, onReview, busy }: Props) {
  if (!lines.length) return null;
  return <section className="replacement-notice enter" aria-label="Product issues">
    <div className="replacement-notice__heading"><span className="replacement-notice__attention" aria-hidden="true"><Icon name="triangle-alert" className="i-18" /></span><p>{lines.length === 1 ? 'One product needs your review' : `${lines.length} products need your review`}</p></div>
    <p className="replacement-notice__date"><Icon name="truck" className="i-14" />Delivery {dayLabel(date)}</p>
    <ul className="replacement-notice__items">{lines.map(line => {
      const reason = line.issue?.kind === 'cutoff' ? 'Order cut-off passed' : line.issue?.kind === 'short' ? 'Not enough stock for your order' : 'Not available for this delivery';
      return <li key={line.id}><button disabled={busy} onClick={() => onReview(line.id)} aria-label={`Review replacement options for ${niceName(line.name)}`}>
        <IssuePhoto line={line} />
        <span className="replacement-notice__copy"><strong>{niceName(line.name)}</strong><span className="replacement-notice__problem">{reason}</span><span className="replacement-notice__action">Review options <Icon name="arrow-right" className="i-14" /></span></span>
      </button></li>;
    })}</ul>
  </section>;
}
