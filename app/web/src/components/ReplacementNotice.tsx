import type { BasketLine } from '../api';
import { dayLabel, niceName } from '../format';
import { Icon } from '../icons';
import './replacement-notice.css';

type Props = {
  lines: BasketLine[];
  date: string;
  onReview: (lineId: string) => void;
  busy: boolean;
};

// Chat only announces the exception. The shared product dialog owns replacement decisions.
export function ReplacementNotice({ lines, date, onReview, busy }: Props) {
  if (!lines.length) return null;
  const single = lines.length === 1;
  return <section className="replacement-notice enter" aria-label="Delivery issues">
    <div className="replacement-notice__heading">
      <Icon name="circle-alert" className="i-16" />
      <p>{single ? `${niceName(lines[0].name)} can't arrive on time` : `${lines.length} items can't arrive by ${dayLabel(date)}`}</p>
    </div>
    {single ? <>
      <p className="replacement-notice__date"><Icon name="truck" className="i-14" />Delivery {dayLabel(date)}</p>
      <button className="replacement-notice__review" disabled={busy} onClick={() => onReview(lines[0].id)} aria-label={`Review replacement options for ${niceName(lines[0].name)}`}>Review options<Icon name="arrow-right" className="i-14" /></button>
    </> : <ul className="replacement-notice__items">
      {lines.map(line => <li key={line.id}><button disabled={busy} onClick={() => onReview(line.id)} aria-label={`Review replacement options for ${niceName(line.name)}`}><span>{niceName(line.name)}</span><Icon name="chevron-right" className="i-14" /></button></li>)}
    </ul>}
  </section>;
}
