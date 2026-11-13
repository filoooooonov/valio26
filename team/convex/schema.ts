import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // One row per agent session (e.g. "aleksei-claude", "ayaan-codex-wt-api").
  agents: defineTable({
    agentId: v.string(),
    human: v.string(),
    tool: v.string(),
    status: v.string(), // "working" | "idle" | "blocked" | free text
    task: v.string(),
    lastSeen: v.number(),
  }).index("by_agentId", ["agentId"]),

  // File / directory claims. `path` is repo-relative POSIX; a trailing "/" claims a whole dir.
  claims: defineTable({
    path: v.string(),
    agentId: v.string(),
    reason: v.string(),
    expiresAt: v.number(),
  })
    .index("by_path", ["path"])
    .index("by_agentId", ["agentId"]),

  // `to` is an agentId, a human name (matches all of that human's agents), or "all".
  messages: defineTable({
    from: v.string(),
    to: v.string(),
    kind: v.union(v.literal("help"), v.literal("info"), v.literal("handoff"), v.literal("reply")),
    body: v.string(),
  }),

  // Per-agent read cursor into `messages` (by _creationTime).
  cursors: defineTable({
    agentId: v.string(),
    lastRead: v.number(),
  }).index("by_agentId", ["agentId"]),
});
