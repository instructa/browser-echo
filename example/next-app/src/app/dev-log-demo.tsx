"use client";

import { useCallback, useEffect } from "react";

export default function DevLogDemo() {
  const emitAll = useCallback(() => {
    console.log("log:", "Hello from Next app");
    console.info("info:", { msg: "Structured info", time: new Date().toISOString() });
    console.warn("warn:", "This is a warning with number", 123);
    console.debug("debug:", "Some debug details", { feature: "logging" });

    const circular: any = { name: "circular" };
    circular.self = circular;
    const big = 42n;
    const fn = function sampleFn() {};
    const sym = Symbol("demo");
    console.log("objects:", { circular, big, fn, sym });
  }, []);

  const emitError = useCallback(() => {
    console.error(new Error("Boom from Next!"));
  }, []);

  useEffect(() => {
    emitAll();
    emitError();
  }, [emitAll, emitError]);

  return (
    <div style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button
        onClick={emitAll}
        style={{ padding: "6px 10px", border: "1px solid #999", borderRadius: 6 }}
      >
        Emit All Logs
      </button>
      <button
        onClick={emitError}
        style={{ padding: "6px 10px", border: "1px solid #999", borderRadius: 6 }}
      >
        Emit Error
      </button>
    </div>
  );
}
