import { useEffect, useState } from "react";

// Approval console + audit log (owner: aleksei). API shapes in /CONTRACT.md.
// Brand: valioaimo.fi 1:1 (theme.css, docs/design/valio-inspo.md). Page layouts come later (T7).
const LOGO = "https://cdn-wp.valio.fi/valio-wp-network/sites/2/2025/06/Valio_Aimo_logo_petrooli_RGB-1.svg";

export default function App() {
  const [health, setHealth] = useState<"checking" | "ok" | "error">("checking");
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setHealth(j.ok ? "ok" : "error"))
      .catch(() => setHealth("error"));
  }, []);
  const pill = { checking: "pill--pending", ok: "pill--ok", error: "pill--denied" }[health];
  return (
    <>
      <header className="site-header">
        <div className="site-header__top-nav">
          <div className="container">
            <a className="top-nav__tab is-active" href="#">Trade Agents</a>
            <a className="top-nav__tab" href="#">Audit log</a>
            <span className="top-nav__extras">
              <span className={`pill ${pill}`} data-testid="health">Gateway {health}</span>
            </span>
          </div>
        </div>
        <div className="site-header__bar">
          <div className="container">
            <span />
            <a className="logo logo--header" href="/" title="Valio Aimo">
              <img src={LOGO} alt="Valio Aimo" />
            </a>
            <span />
          </div>
        </div>
      </header>
      <main className="section section--blueberry">
        <div className="container">
          <h1>Hyväksynnät</h1>
          <p>Orders outside an agent's mandate land here for a human decision.</p>
        </div>
      </main>
    </>
  );
}
