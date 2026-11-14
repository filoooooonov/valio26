import badge from "../assets/assistant-badge.svg";
import logo from "../assets/aimo-logo.svg";

// The assistant mark is the "A" from the Aimo logo (pen components OkAkC badge / gCwTW glyph, exported as SVG).
export const AssistantBadge = () => <img className="badge" src={badge} alt="" aria-hidden="true" />;
// Glyph is a CSS mask so it takes currentColor (teal on white, white on the teal phone tab).
export const AssistantGlyph = () => <span className="glyph" aria-hidden="true" />;
export const AimoLogo = () => <img className="logo" src={logo} alt="Valio Aimo" />;
