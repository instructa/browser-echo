function initBrowserEcho(opts = {}) {
  if (typeof window === "undefined")
    return;
  const w = window;
  if (w.__browser_echo_installed__)
    return;
  w.__browser_echo_installed__ = true;
  const route = opts.route ?? "/__client-logs";
  const include = opts.include ?? ["log", "info", "warn", "error", "debug"];
  const preserveConsole = opts.preserveConsole ?? true;
  const tag = opts.tag ?? "[browser]";
  const batchSize = opts.batch?.size ?? 20;
  const batchInterval = opts.batch?.interval ?? 300;
  const session = randomId();
  const queue = [];
  let timer = null;
  const ORIGINAL = {};
  for (const level of include) {
    const orig = console[level] ? console[level].bind(console) : console.log.bind(console);
    ORIGINAL[level] = orig;
    console[level] = (...args) => {
      const { text, stack, source } = formatForWire(level, args);
      enqueue({ level, text, time: Date.now(), stack, source });
      if (preserveConsole) {
        try {
          orig(...args);
        } catch {
        }
      }
    };
  }
  try {
    ORIGINAL["info"]?.(`${tag} forwarding console logs to ${route} (session ${session})`);
  } catch {
  }
  function enqueue(entry) {
    queue.push(entry);
    if (queue.length >= batchSize)
      flush();
    else if (!timer)
      timer = setTimeout(flush, batchInterval);
  }
  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!queue.length)
      return;
    const entries = queue.splice(0, queue.length);
    const payload = JSON.stringify({ sessionId: session, entries });
    try {
      if ("sendBeacon" in navigator) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(route, blob);
      } else {
        fetch(route, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
          credentials: "omit",
          keepalive: true,
          cache: "no-store"
        }).catch(() => void 0);
      }
    } catch {
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden")
      flush();
  });
  addEventListener("pagehide", flush);
  addEventListener("beforeunload", flush);
  function formatForWire(_level, args) {
    const text = args.map(safeFormat).join(" ");
    const stack = captureStack(opts.stackMode ?? "condensed");
    const source = parseSource(stack);
    return { text, stack, source };
  }
  function safeFormat(val) {
    if (typeof val === "string")
      return val;
    if (val instanceof Error)
      return `${val.name || "Error"}: ${val.message || ""}`;
    try {
      const seen = /* @__PURE__ */ new WeakSet();
      return JSON.stringify(val, (k, v) => {
        if (typeof v === "bigint")
          return String(v) + "n";
        if (typeof v === "function")
          return `[Function ${v.name || "anonymous"}]`;
        if (v instanceof Error)
          return { name: v.name, message: v.message, stack: v.stack };
        if (typeof v === "symbol")
          return v.toString();
        if (typeof v === "object" && v !== null) {
          if (seen.has(v))
            return "[Circular]";
          seen.add(v);
        }
        return v;
      });
    } catch {
      try {
        return String(val);
      } catch {
        return "[Unserializable]";
      }
    }
  }
  function captureStack(mode) {
    if (mode === "none")
      return "";
    try {
      const e = new Error();
      const lines = (e.stack || "").split("\n").slice(1);
      const isInternal = (l) => /initBrowserEcho|browser-echo|captureStack|safeFormat|enqueue|flush/.test(l);
      const appLines = lines.filter((l) => !isInternal(l));
      if (mode === "condensed")
        return appLines[0] ? appLines[0] : "";
      return appLines.join("\n");
    } catch {
      return "";
    }
  }
  function parseSource(stack) {
    if (!stack)
      return "";
    const m = stack.match(/\(?((?:file:\/\/|https?:\/\/|\/)[^) \n]+):(\d+):(\d+)\)?/);
    return m ? `${m[1]}:${m[2]}:${m[3]}` : "";
  }
  function randomId() {
    try {
      const arr = new Uint8Array(8);
      crypto.getRandomValues(arr);
      return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return String(Math.random()).slice(2, 10);
    }
  }
}

export { initBrowserEcho };
