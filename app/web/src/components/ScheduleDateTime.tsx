import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons';
import { shiftDate, todayHelsinki } from '../recurring';
import './schedule-date-time.css';

export function ScheduleDate({value,onChange}:{value:string;onChange:(date:string)=>void}) {
  const [open,setOpen] = useState(false);
  const [month,setMonth] = useState(value.slice(0,7));
  const first = month + '-01';
  const offset = (new Date(first+'T12:00:00Z').getUTCDay()+6)%7;
  const today = todayHelsinki();
  const label = (date:string,options:Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB',{...options,timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
  function move(delta:number) { const d=new Date(first+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+delta);setMonth(d.toISOString().slice(0,7)); }
  return <div className="schedule-date-control"><span id="schedule-start-label">Starting from</span><button type="button" className="schedule-picker-trigger" aria-labelledby="schedule-start-label schedule-start-value" aria-expanded={open} onClick={()=>setOpen(!open)}><span id="schedule-start-value">{label(value,{day:'numeric',month:'short',year:'numeric'})}</span><Icon name="calendar" className="i-16" /></button>
    {open && <div className="schedule-calendar"><header><button type="button" className="round" aria-label="Previous month" onClick={()=>move(-1)}><Icon name="chevron-right" className="i-16 schedule-calendar__previous" /></button><strong aria-live="polite">{label(first,{month:'long',year:'numeric'})}</strong><button type="button" className="round" aria-label="Next month" onClick={()=>move(1)}><Icon name="chevron-right" className="i-16" /></button></header><div className="schedule-calendar__grid">{['M','T','W','T','F','S','S'].map((day,i)=><small key={'day'+i} aria-hidden="true">{day}</small>)}{Array.from({length:42},(_,i)=>shiftDate(first,i-offset)).map(date=><button type="button" key={date} aria-label={label(date,{weekday:'long',day:'numeric',month:'long',year:'numeric'})} aria-pressed={date===value} disabled={date<today} data-outside={!date.startsWith(month)||undefined} onClick={()=>{onChange(date);setOpen(false);}}>{Number(date.slice(-2))}</button>)}</div><button type="button" className="schedule-text" onClick={()=>{onChange(today);setMonth(today.slice(0,7));setOpen(false);}}>Start today</button></div>}
  </div>;
}
export function ScheduleTime({label,value,options,onChange}:{label:string;value:string;options:string[];onChange:(time:string)=>void}) {
  const [open,setOpen]=useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { const list=panel.current; const selected=list?.querySelector<HTMLElement>('[aria-pressed="true"]'); if(open && list && selected) list.scrollTop += selected.getBoundingClientRect().top-list.getBoundingClientRect().top-list.clientHeight/2+selected.clientHeight/2; },[open]);
  return <div className="schedule-time-control"><span>{label}</span><button type="button" className="schedule-picker-trigger" aria-label={`${label}: ${value}`} aria-expanded={open} onClick={()=>setOpen(!open)}>{value}<Icon name="chevron-down" className="i-16" /></button>{open && <div ref={panel} className="schedule-time-options" role="group" aria-label={label}>{[...new Set([...options,value])].map(time=><button type="button" key={time} aria-pressed={time===value} onClick={()=>{onChange(time);setOpen(false);}}>{time}</button>)}</div>}</div>;
}
