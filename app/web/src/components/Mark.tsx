import badge from "../assets/assistant-badge.svg";
import logo from "../assets/aimo-logo.svg";
import { useId } from "react";
import './aimo-thinking.css';

// The assistant mark is the "A" from the Aimo logo (pen components OkAkC badge / gCwTW glyph, exported as SVG).
export const AssistantBadge = () => <img className="badge" src={badge} alt="" aria-hidden="true" />;
// Reveal the unchanged official asset through one continuous brush mask. No full-image fade or edge swap.
export function ThinkingMark({ small = false }: { small?: boolean }) {
  const maskId = 'aimo-draw-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return <svg className={'badge aimo-thinking' + (small ? ' aimo-thinking--small' : '')} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32" style={{ maskType: 'luminance' }}>
      <path className="aimo-thinking__pen" transform="translate(6 7)" fill="none" stroke="white" strokeWidth="5.4" strokeLinecap="round" strokeLinejoin="round" pathLength="1" d="M3.8 16.4 C5.5 11 10 1.3 15.1 1.3 C19.7 1.3 17.2 10.9 13.2 16.5 C14.8 13.8 17 9.3 18 7.9 C14 8.1 5.6 11 .7 8.4" />
    </mask></defs>
    <circle cx="16" cy="16" r="16" fill="currentColor" />
    <image className="aimo-thinking__reveal" href={badge} width="32" height="32" mask={`url(#${maskId})`} />
  </svg>;
}
// Glyph is a CSS mask so it takes currentColor (teal on white, white on the teal phone tab).
export const AssistantGlyph = () => <span className="glyph" aria-hidden="true" />;
export const AimoLogo = () => <img className="logo" src={logo} alt="Valio Aimo" />;

