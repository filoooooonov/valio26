import { useEffect, useState } from "react";

// Approval console + audit log (owner: aleksei). API shapes in /CONTRACT.md.
export default function App() {
  const [health, setHealth] = useState<string>("checking…");
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setHealth(j.ok ? "gateway ok" : "gateway error"))
      .catch(() => setHealth("gateway unreachable"));
  }, []);
  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Valio Trade Agents: approval console</h1>
      <p data-testid="health">{health}</p>
    </main>
  );
}
