"use client";

import { useEffect } from "react";

export default function DevLogs() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "development") return;

    const levels = ["log", "info", "warn", "error", "debug"] as const;
    const originals: Partial<Record<(typeof levels)[number], (...args: unknown[]) => void>> = {};

    function safeFormat(val: unknown): string {
      if (typeof val === "string") return val;
      if (val instanceof Error) return `${val.name || "Error"}: ${val.message || ""}`;
      try {
        const seen = new WeakSet<object>();
        return JSON.stringify(val, (key, value) => {
          if (typeof value === "bigint") return String(value) + "n";
          if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
          if (value instanceof Error) return { name: value.name, message: value.message };
          if (typeof value === "symbol") return String(value);
          if (value && typeof value === "object") {
            if (seen.has(value)) return "[Circular]";
            seen.add(value);
          }
          return value;
        });
      } catch {
        try {
          return String(val);
        } catch {
          return "[Unserializable]";
        }
      }
    }

    function toText(args: unknown[]): string {
      return args.map(safeFormat).join(" ");
    }

    function post(level: string, text: string) {
      const payload = JSON.stringify({ level, text });
      try {
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: "application/json" });
          navigator.sendBeacon("/api/__client-logs", blob);
        } else {
          void fetch("/api/__client-logs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: payload,
            keepalive: true,
            cache: "no-store",
          });
        }
      } catch {
        // ignore
      }
    }

    for (const level of levels) {
      const orig = (console[level] || console.log).bind(console);
      originals[level] = orig;
      console[level] = (...args: unknown[]) => {
        post(level, toText(args));
        try {
          orig(...args);
        } catch {
          // ignore
        }
      } as any;
    }

    return () => {
      for (const level of levels) {
        if (originals[level]) console[level] = originals[level]!;
      }
    };
  }, []);

  return null;
}
