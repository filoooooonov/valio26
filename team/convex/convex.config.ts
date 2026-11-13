import { defineApp } from "convex/server";
import { v } from "convex/values";

// TEAM_TOKEN: shared secret every agent sends. Set with
//   npx convex env set TEAM_TOKEN <value>
const app = defineApp({
  env: { TEAM_TOKEN: v.optional(v.string()) },
});

export default app;
