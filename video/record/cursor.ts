// Injected into every recorded page: a visible macOS-style cursor that follows real mouse events and a click
// ripple. Headless Chromium draws no cursor, and baking it into the page keeps it in the recording.
export const cursorScript = `(() => {
  const install = () => {
    if (document.getElementById("__demo_cursor")) return;
    const c = document.createElement("div");
    c.id = "__demo_cursor";
    c.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M5 3 L5 22 L10 17.5 L13.6 25 L17 23.4 L13.5 16.2 L20 16.2 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "0", top: "0", width: "28px", height: "28px", zIndex: "2147483647",
      pointerEvents: "none", transform: "translate(-200px,-200px)", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.35))",
      transition: "scale .12s ease" });
    document.documentElement.appendChild(c);
    let x = -200, y = -200;
    window.addEventListener("mousemove", (e) => { x = e.clientX; y = e.clientY; c.style.transform = "translate(" + (x - 5) + "px," + (y - 3) + "px)"; }, true);
    window.addEventListener("mousedown", () => {
      c.style.scale = "0.85";
      const r = document.createElement("div");
      Object.assign(r.style, { position: "fixed", left: x - 22 + "px", top: y - 22 + "px", width: "44px", height: "44px",
        borderRadius: "50%", border: "3px solid rgba(192,224,33,.95)", background: "rgba(192,224,33,.25)",
        zIndex: "2147483646", pointerEvents: "none", transform: "scale(.3)", opacity: "1",
        transition: "transform .45s cubic-bezier(.2,.8,.2,1), opacity .45s ease" });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = "scale(1.4)"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 600);
    }, true);
    window.addEventListener("mouseup", () => { c.style.scale = "1"; }, true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
})();`;
