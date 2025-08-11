import { defineEventHandler, readBody, setResponseStatus } from 'h3';

const handler = defineEventHandler(async (event) => {
  let payload = null;
  try {
    payload = await readBody(event);
  } catch {
    setResponseStatus(event, 400);
    return "invalid JSON";
  }
  if (!payload || !Array.isArray(payload.entries)) {
    setResponseStatus(event, 400);
    return "invalid payload";
  }
  const sid = (payload.sessionId ?? "anon").slice(0, 8);
  for (const entry of payload.entries) {
    const level = norm(entry.level);
    let line = `[browser] [${sid}] ${level.toUpperCase()}: ${entry.text}`;
    if (entry.source)
      line += ` (${entry.source})`;
    print(level, color(level, line));
    if (entry.stack)
      print(level, dim(indent(entry.stack, "    ")));
  }
  setResponseStatus(event, 204);
  return "";
});
function norm(l) {
  if (l === "warning")
    return "warn";
  if (l === "verbose")
    return "debug";
  return ["log", "info", "warn", "error", "debug"].includes(l) ? l : "log";
}
function print(level, msg) {
  switch (level) {
    case "error":
      console.error(msg);
      break;
    case "warn":
      console.warn(msg);
      break;
    default:
      console.log(msg);
  }
}
function indent(s, prefix = "  ") {
  return String(s).split(/\r?\n/g).map((l) => l.length ? prefix + l : l).join("\n");
}
const c = { reset: "\x1B[0m", red: "\x1B[31m", yellow: "\x1B[33m", magenta: "\x1B[35m", cyan: "\x1B[36m", white: "\x1B[37m", dim: "\x1B[2m" };
function color(level, msg) {
  switch (level) {
    case "error":
      return c.red + msg + c.reset;
    case "warn":
      return c.yellow + msg + c.reset;
    case "debug":
      return c.magenta + msg + c.reset;
    case "info":
      return c.cyan + msg + c.reset;
    default:
      return c.white + msg + c.reset;
  }
}
function dim(s) {
  return c.dim + s + c.reset;
}

export { handler as default };
