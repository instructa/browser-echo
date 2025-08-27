"use client";
import { useState } from "react";

export default function DevLogDemo() {
  const [count, setCount] = useState(0);

  const handleLogDemo = () => {
    console.log("📊 Regular log message from React component");
    console.warn("⚠️ Warning message with count:", count);
    console.error("❌ Error message for testing");
    console.info("ℹ️ Info message with object:", { count, timestamp: new Date() });

    try {
      throw new Error("Demo error with stack trace");
    } catch (error) {
      console.error("🔥 Caught error:", error);
    }
  };

  const handleAsyncError = async () => {
    console.log("🔄 Starting async operation...");

    try {
      await new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Async operation failed")), 100);
      });
    } catch (error) {
      console.error("💥 Async error caught:", error);
    }
  };

  const handleNetworkTest = async () => {
    console.log("🌐 Testing network requests...");

    try {
      // Test successful fetch
      await fetch("https://jsonplaceholder.typicode.com/posts/1");
      console.log("✅ Successful fetch completed");

      // Test POST request
      await fetch("https://jsonplaceholder.typicode.com/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test", body: "Test body" })
      });
      console.log("✅ POST request completed");

      // Test 404 error
      await fetch("https://jsonplaceholder.typicode.com/posts/999999");
      console.log("⚠️ 404 request completed");

    } catch (error) {
      console.error("🌐 Network test error:", error);
    }
  };

  return (
    <div className="p-6 my-8 bg-gray-50 dark:bg-gray-900 rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Browser Echo Demo</h2>
      <p className="mb-6">
        Open your terminal running <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">pnpm dev</code> to see logs streamed in
        real-time!
      </p>

      <div className="flex flex-wrap gap-4 mb-6">
        <button 
          onClick={handleLogDemo}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Trigger Console Logs
        </button>

        <button 
          onClick={handleAsyncError}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
        >
          Test Async Error
        </button>

        <button 
          onClick={handleNetworkTest}
          className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition-colors"
        >
          Test Network Requests
        </button>

        <button
          onClick={() => {
            console.group("📂 Grouped logs");
            console.log("Message 1 in group");
            console.warn("Message 2 in group");
            console.error("Message 3 in group");
            console.groupEnd();
          }}
          className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
        >
          Test Grouped Logs
        </button>
      </div>

      <div className="p-4 bg-white dark:bg-gray-800 rounded">
        <p className="mb-2">Count: {count}</p>
        <button
          onClick={() => {
            const newCount = count + 1;
            setCount(newCount);
            console.log(`🔢 Counter updated to: ${newCount}`);
          }}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
        >
          Increment (+Log)
        </button>
      </div>
    </div>
  );
}
