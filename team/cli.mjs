#!/usr/bin/env node
// Human-facing CLI for the team board.
//   node team/cli.mjs board                  who's doing what + claims
//   node team/cli.mjs inbox                  unread messages for this checkout's agent id
//   node team/cli.mjs send <to> <message>    to = agent id, human name, or "all"
//   node team/cli.mjs release [path...]      drop this agent's claims (all if no paths)
//   node team/cli.mjs whoami
if (!process.env.CLAUDECODE && !process.env.TEAM_TOOL) process.env.TEAM_TOOL = "human";
const { client, board, agentIdentity, fmtOverview, relPath } = await import("./lib.mjs");

const [cmd = "board", ...rest] = process.argv.slice(2);
const { agentId, tool } = agentIdentity();
const cl = client();
if (!cl && cmd !== "whoami") {
  console.error("No TEAM_BOARD_URL / TEAM_TOKEN in .env — see team/README.md");
  process.exit(1);
}

switch (cmd) {
  case "whoami":
    console.log(agentId);
    break;
  case "board": {
    const o = await cl.c.query(board.overview, { token: cl.token, now: Date.now() });
    console.log(fmtOverview(o, agentId));
    break;
  }
  case "inbox": {
    const msgs = await cl.c.mutation(board.inbox, { token: cl.token, agentId, tool });
    if (!msgs.length) console.log("(no unread messages)");
    for (const m of msgs) console.log(`${m.from} -> ${m.to} [${m.kind}]: ${m.body}`);
    break;
  }
  case "send": {
    const [to, ...words] = rest;
    if (!to || !words.length) throw new Error("usage: send <to> <message>");
    await cl.c.mutation(board.send, { token: cl.token, from: agentId, to, kind: "info", body: words.join(" ") });
    console.log("sent");
    break;
  }
  case "release": {
    const r = await cl.c.mutation(board.release, {
      token: cl.token,
      agentId,
      paths: rest.length ? rest.map((p) => relPath(p)) : undefined,
    });
    console.log(`released ${r.released}`);
    break;
  }
  default:
    console.error(`unknown command: ${cmd}`);
    process.exit(1);
}
