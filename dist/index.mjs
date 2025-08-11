import ansis from 'ansis';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const DEFAULTS = {
  enabled: true,
  route: "/__client-logs",
  include: ["log", "info", "warn", "error", "debug"],
  preserveConsole: true,
  tag: "[browser]",
  showStack: true,
  stackMode: "full",
  showSource: true,
  colors: true,
  injectHtml: true,
  batch: { size: 20, interval: 300 },
  truncate: 1e4,
  fileLog: { enabled: false, dir: "logs/frontend" }
};
function browserLogsToTerminal(opts = {}) {
  const options = {
    ...DEFAULTS,
    ...opts,
    batch: { ...DEFAULTS.batch, ...opts.batch },
    // Derive stackMode from legacy showStack if not explicitly set
    stackMode: opts.stackMode ?? (opts.showStack === false ? "none" : "full"),
    fileLog: { ...DEFAULTS.fileLog, ...opts.fileLog }
  };
  const VIRTUAL_ID = "\0virtual:browser-logs-to-terminal";
  const PUBLIC_ID = "virtual:browser-logs-to-terminal";
  return {
    name: "vite-browser-logs-to-terminal",
    apply: "serve",
    // dev only
    enforce: "pre",
    resolveId(id) {
      if (id === PUBLIC_ID) return VIRTUAL_ID;
      return null;
    },
    load(id) {
      if (id !== VIRTUAL_ID) return null;
      return makeClientModule(options);
    },
    transformIndexHtml(html, _ctx) {
      if (!options.enabled || !options.injectHtml) return;
      const DEV_RESOLVED_SRC = `/@id/${PUBLIC_ID}`;
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: { type: "module", src: DEV_RESOLVED_SRC },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      if (!options.enabled) return;
      attachMiddleware(server, options);
    }
  };
}
async function attachMiddleware(server, options) {
  const route = options.route;
  const sessionStamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const logDir = options.fileLog.dir;
  const logFilePath = join(logDir, `dev-${sessionStamp}.log`);
  if (options.fileLog.enabled) {
    try {
      mkdirSync(dirname(logFilePath), { recursive: true });
    } catch {
    }
  }
  server.middlewares.use(route, (req, res, next) => {
    if (req.method !== "POST") return next();
    collectRequestBody(req).then((raw) => {
      let payload = null;
      try {
        payload = JSON.parse(raw.toString("utf-8"));
      } catch {
        res.statusCode = 400;
        res.end("invalid JSON");
        return;
      }
      if (!payload || !Array.isArray(payload.entries)) {
        res.statusCode = 400;
        res.end("invalid payload");
        return;
      }
      const logger = server.config.logger;
      const sid = (payload.sessionId ?? "anon").slice(0, 8);
      for (const entry of payload.entries) {
        const level = normalizeLevel(entry.level);
        const truncated = typeof entry.text === "string" && entry.text.length > options.truncate ? entry.text.slice(0, options.truncate) + "\u2026 (truncated)" : entry.text;
        let line = `${options.tag} [${sid}] ${level.toUpperCase()}: ${truncated}`;
        if (options.showSource && entry.source) {
          line += ` (${entry.source})`;
        }
        const colored = options.colors ? colorize(level, line) : line;
        print(logger, level, colored);
        if (entry.stack && options.stackMode !== "none") {
          if (options.stackMode === "full") {
            const indented = indent(entry.stack, "    ");
            print(logger, level, options.colors ? ansis.dim(indented) : indented);
          } else if (options.stackMode === "condensed") {
            const lines = String(entry.stack).split(/\r?\n/g);
            const firstFrame = lines.find((l) => /^(\s*)at\s+/.test(l)) || lines.find((l) => /:\d+:\d+/.test(l)) || lines.find((l) => l.trim().length > 0) || "";
            if (firstFrame) {
              const shortLine = `    ${firstFrame.trim()}`;
              print(logger, level, options.colors ? ansis.dim(shortLine) : shortLine);
            }
          }
        }
        if (options.fileLog.enabled) {
          const time = (/* @__PURE__ */ new Date()).toISOString();
          const linesToWrite = [];
          linesToWrite.push(`[${time}] ${line}`);
          if (entry.stack && options.stackMode !== "none") {
            if (options.stackMode === "full") {
              linesToWrite.push(indent(entry.stack, "    "));
            } else if (options.stackMode === "condensed") {
              const first = String(entry.stack).split(/\r?\n/g).find((l) => l.trim().length > 0) || "";
              if (first) linesToWrite.push(`    ${first.trim()}`);
            }
          }
          try {
            appendFileSync(logFilePath, linesToWrite.join("\n") + "\n");
          } catch {
          }
        }
      }
      res.statusCode = 204;
      res.end();
    }).catch((err) => {
      server.config.logger.error(`${options.tag} middleware error: ${err?.message || err}`);
      res.statusCode = 500;
      res.end("error");
    });
  });
}
function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
function print(logger, level, msg) {
  switch (level) {
    case "error":
      logger.error(msg);
      break;
    case "warn":
      logger.warn(msg);
      break;
    case "info":
    case "debug":
    case "log":
    default:
      logger.info(msg);
  }
}
function indent(s, prefix = "  ") {
  return s.split(/\r?\n/g).map((l) => l.length ? prefix + l : l).join("\n");
}
function normalizeLevel(l) {
  if (l === "warning") return "warn";
  if (l === "verbose") return "debug";
  return ["log", "info", "warn", "error", "debug"].includes(l) ? l : "log";
}
function colorize(level, message) {
  switch (level) {
    case "error":
      return ansis.red(message);
    case "warn":
      return ansis.yellow(message);
    case "debug":
      return ansis.magenta(message);
    case "info":
      return ansis.cyan(message);
    case "log":
    default:
      return ansis.white(message);
  }
}
function makeClientModule(options) {
  const include = JSON.stringify(options.include);
  const preserve = JSON.stringify(options.preserveConsole);
  const route = JSON.stringify(options.route);
  const tag = JSON.stringify(options.tag);
  const batchSize = String(options.batch.size);
  const batchInterval = String(options.batch.interval);
  return `
const __INSTALLED_KEY = '__vite_browser_logs_to_terminal_installed__';
if (!window[__INSTALLED_KEY]) {
  window[__INSTALLED_KEY] = true;

  const INCLUDE = ${include};
  const PRESERVE = ${preserve};
  const ROUTE = ${route};
  const TAG = ${tag};
  const BATCH_SIZE = ${batchSize} | 0;
  const BATCH_INTERVAL = ${batchInterval} | 0;

  const SESSION = cryptoRandomId();

  const queue = [];
  let timer = null;

  function enqueue(entry) {
    queue.push(entry);
    if (queue.length >= BATCH_SIZE) {
      flush();
    } else if (!timer) {
      timer = setTimeout(flush, BATCH_INTERVAL);
    }
  }

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!queue.length) return;

    const entries = queue.splice(0, queue.length);
    const payload = JSON.stringify({ sessionId: SESSION, entries });

    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(ROUTE, blob);
      } else {
        // sendBeacon is more resilient during unload; fetch as a fallback
        fetch(ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: payload,
          credentials: 'omit',
          keepalive: true,
          cache: 'no-store'
        }).catch(() => void 0);
      }
    } catch (_) {
      // ignore
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  addEventListener('pagehide', flush);
  addEventListener('beforeunload', flush);

  const ORIGINAL = {};
  for (const level of INCLUDE) {
    const orig = console[level] ? console[level].bind(console) : console.log.bind(console);
    ORIGINAL[level] = orig;
    console[level] = (...args) => {
      const { text, stack, source } = formatForWire(level, args);
      enqueue({ level, text, time: Date.now(), stack, source });
      if (PRESERVE) {
        try { orig(...args); } catch {}
      }
    };
  }

  function formatForWire(level, args) {
    const text = args.map(safeFormat).join(' ');
    const stack = captureStack();
    const source = parseSource(stack);
    return { text, stack, source };
  }

  function safeFormat(val) {
    // Strings: as-is (to preserve formatting)
    if (typeof val === 'string') return val;
    // Errors: show Name: message
    if (val instanceof Error) return (val.name || 'Error') + ': ' + (val.message || '');
    // Everything else: JSON (with cycle-safe replacer), else String()
    try {
      const seen = new WeakSet();
      return JSON.stringify(val, (k, v) => {
        if (typeof v === 'bigint') return String(v) + 'n';
        if (typeof v === 'function') return '[Function ' + (v.name || 'anonymous') + ']';
        if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
        if (typeof v === 'symbol') return v.toString();
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
        }
        return v;
      });
    } catch {
      try { return String(val); } catch { return '[Unserializable]'; }
    }
  }

  function captureStack() {
    try {
      const e = new Error();
      const raw = e.stack || '';
      // Drop the first "Error" line for cleaner output
      const lines = raw.split('\\n').slice(1);
      const isInternal = (l) =>
        l.includes('virtual:browser-logs-to-terminal') ||
        l.includes('/@id/__x00__virtual:browser-logs-to-terminal') ||
        l.includes('/@id/virtual:browser-logs-to-terminal') ||
        /formatForWire|safeFormat|captureStack|enqueue|flush/.test(l);
      return lines.filter((l) => !isInternal(l)).join('\\n');
    } catch { return ''; }
  }

  function parseSource(stack) {
    if (!stack) return '';
    // Crude file:line:col matcher for (chrome, firefox, safari, vite paths)
    const m = stack.match(/\\(?((?:file:\\/\\/|https?:\\/\\/|\\/)[^)\\s]+):(\\d+):(\\d+)\\)?/);
    if (!m) return '';
    return m[1] + ':' + m[2] + ':' + m[3];
  }

  function cryptoRandomId() {
    try {
      const arr = new Uint8Array(8);
      crypto.getRandomValues(arr);
      return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return String(Math.random()).slice(2, 10);
    }
  }

  // Helpful banner in the browser console so you know it's active
  try {
    ORIGINAL['info']?.(${tag} + ' forwarding console logs to dev server at ' + ROUTE + ' (session ' + SESSION + ')');
  } catch {}
}
`;
}

export { browserLogsToTerminal as default };
