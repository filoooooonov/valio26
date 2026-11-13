import { query, mutation, internalMutation, env } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";

const MAX = 500;
const DEFAULT_TTL_MIN = 90;

function checkToken(token: string) {
  const expected = env.TEAM_TOKEN;
  if (!expected || token !== expected) throw new Error("bad team token");
}

function humanOf(agentId: string) {
  return agentId.split("-")[0];
}

function addressedTo(m: Doc<"messages">, agentId: string) {
  if (m.from === agentId) return false;
  return m.to === "all" || m.to === agentId || m.to === humanOf(agentId);
}

/** A claim on `claimPath` covers `path` if equal, or claimPath is a dir prefix ("x/"). */
function covers(claimPath: string, path: string) {
  return claimPath === path || (claimPath.endsWith("/") && path.startsWith(claimPath));
}

async function liveClaims(ctx: QueryCtx, now: number) {
  const all = await ctx.db.query("claims").take(MAX);
  return all.filter((c) => c.expiresAt > now);
}

async function upsertAgent(
  ctx: MutationCtx,
  a: { agentId: string; tool: string; status?: string; task?: string },
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("agents")
    .withIndex("by_agentId", (q) => q.eq("agentId", a.agentId))
    .unique();
  if (existing) {
    await ctx.db.patch("agents", existing._id, {
      lastSeen: now,
      ...(a.tool !== "agent" ? { tool: a.tool } : {}),
      ...(a.status !== undefined ? { status: a.status } : {}),
      ...(a.task !== undefined ? { task: a.task } : {}),
    });
  } else {
    await ctx.db.insert("agents", {
      agentId: a.agentId,
      human: humanOf(a.agentId),
      tool: a.tool,
      status: a.status ?? "idle",
      task: a.task ?? "",
      lastSeen: now,
    });
  }
}

const tokenArgs = { token: v.string() };

/** Admin: wipe the board. `npx convex run board:reset` */
export const reset = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const t of ["agents", "claims", "messages", "cursors"] as const) {
      for (const d of await ctx.db.query(t).take(1000)) await ctx.db.delete(t, d._id);
    }
    return null;
  },
});

/** Everything an agent needs to orient itself. */
export const overview = query({
  args: { ...tokenArgs, now: v.number() },
  handler: async (ctx, { token, now }) => {
    checkToken(token);
    const agents = await ctx.db.query("agents").take(100);
    const claims = await liveClaims(ctx, now);
    const recent = await ctx.db.query("messages").order("desc").take(15);
    return { agents, claims, recent: recent.reverse() };
  },
});

export const setStatus = mutation({
  args: {
    ...tokenArgs,
    agentId: v.string(),
    tool: v.string(),
    status: v.optional(v.string()),
    task: v.optional(v.string()),
  },
  handler: async (ctx, { token, ...a }) => {
    checkToken(token);
    await upsertAgent(ctx, a);
    return null;
  },
});

export const claim = mutation({
  args: {
    ...tokenArgs,
    agentId: v.string(),
    paths: v.array(v.string()),
    reason: v.string(),
    ttlMinutes: v.optional(v.number()),
  },
  handler: async (ctx, { token, agentId, paths, reason, ttlMinutes }) => {
    checkToken(token);
    const now = Date.now();
    const live = await liveClaims(ctx, now);
    const conflicts = live.filter(
      (c) => c.agentId !== agentId && paths.some((p) => covers(c.path, p) || covers(p, c.path)),
    );
    if (conflicts.length > 0) {
      return { ok: false as const, conflicts: conflicts.map(({ path, agentId, reason }) => ({ path, agentId, reason })) };
    }
    await upsertAgent(ctx, { agentId, tool: "agent", status: "working" });
    const expiresAt = now + (ttlMinutes ?? DEFAULT_TTL_MIN) * 60_000;
    for (const path of paths) {
      const mine = live.find((c) => c.path === path && c.agentId === agentId);
      if (mine) await ctx.db.patch("claims", mine._id, { expiresAt, reason });
      else await ctx.db.insert("claims", { path, agentId, reason, expiresAt });
    }
    return { ok: true as const, conflicts: [] };
  },
});

export const release = mutation({
  args: { ...tokenArgs, agentId: v.string(), paths: v.optional(v.array(v.string())) },
  handler: async (ctx, { token, agentId, paths }) => {
    checkToken(token);
    const mine = await ctx.db
      .query("claims")
      .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
      .take(MAX);
    let n = 0;
    for (const c of mine) {
      if (!paths || paths.includes(c.path)) {
        await ctx.db.delete("claims", c._id);
        n++;
      }
    }
    // Garbage-collect expired claims while we're here.
    const now = Date.now();
    for (const c of await ctx.db.query("claims").take(MAX)) {
      if (c.expiresAt <= now) await ctx.db.delete("claims", c._id);
    }
    return { released: n };
  },
});

/**
 * Called by the PreToolUse hook before every edit: blocks if another agent holds the
 * file, otherwise auto-claims it for the editor (so the next agent gets blocked).
 */
export const guardEdit = mutation({
  args: { ...tokenArgs, agentId: v.string(), tool: v.string(), path: v.string() },
  handler: async (ctx, { token, agentId, tool, path }) => {
    checkToken(token);
    const now = Date.now();
    const live = await liveClaims(ctx, now);
    const conflict = live.find((c) => c.agentId !== agentId && covers(c.path, path));
    if (conflict) {
      return { ok: false as const, holder: conflict.agentId, claimPath: conflict.path, reason: conflict.reason };
    }
    const expiresAt = now + DEFAULT_TTL_MIN * 60_000;
    const mine = live.find((c) => c.agentId === agentId && covers(c.path, path));
    if (mine) await ctx.db.patch("claims", mine._id, { expiresAt });
    else await ctx.db.insert("claims", { path, agentId, reason: "auto (edited)", expiresAt });
    await upsertAgent(ctx, { agentId, tool });
    return { ok: true as const };
  },
});

export const send = mutation({
  args: {
    ...tokenArgs,
    from: v.string(),
    to: v.string(),
    kind: v.union(v.literal("help"), v.literal("info"), v.literal("handoff"), v.literal("reply")),
    body: v.string(),
  },
  handler: async (ctx, { token, from, to, kind, body }) => {
    checkToken(token);
    const id = await ctx.db.insert("messages", { from, to: to.replace(/^@/, ""), kind, body });
    return { id };
  },
});

/** Unread messages for an agent; marks them read unless peek=true. Also heartbeats. */
export const inbox = mutation({
  args: { ...tokenArgs, agentId: v.string(), tool: v.string(), peek: v.optional(v.boolean()) },
  handler: async (ctx, { token, agentId, tool, peek }) => {
    checkToken(token);
    await upsertAgent(ctx, { agentId, tool });
    const cursor = await ctx.db
      .query("cursors")
      .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
      .unique();
    const since = cursor?.lastRead ?? 0;
    const newer = await ctx.db
      .query("messages")
      .withIndex("by_creation_time", (q) => q.gt("_creationTime", since))
      .take(MAX);
    const mine = newer.filter((m) => addressedTo(m, agentId));
    if (!peek && newer.length > 0) {
      const lastRead = newer[newer.length - 1]._creationTime;
      if (cursor) await ctx.db.patch("cursors", cursor._id, { lastRead });
      else await ctx.db.insert("cursors", { agentId, lastRead });
    }
    return mine.map(({ _creationTime, from, to, kind, body }) => ({ at: _creationTime, from, to, kind, body }));
  },
});
