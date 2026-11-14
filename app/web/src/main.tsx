import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./theme.css";
import "./app.css";
import App from "./App.tsx";
import { BrandGuide } from "./ui/BrandGuide.tsx";

// ?view=brand is the living brand guideline (app/web/src/ui); everything else is the webshop.
const brand = new URLSearchParams(location.search).get("view") === "brand";

createRoot(document.getElementById("root")!).render(
  <StrictMode>{brand ? <BrandGuide /> : <App />}</StrictMode>,
);
