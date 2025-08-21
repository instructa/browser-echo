# React + Vite + Browser Echo

This example demonstrates using **browser-echo** with a React + Vite application.

Browser Echo streams browser console logs to your Vite dev server terminal with colors, stack traces, and real-time updates.

## Features Demonstrated

- ✨ Real-time console log streaming to terminal
- 🎨 Colored output with proper log level indicators
- 📚 Stack traces for errors
- 🔄 Works with async operations
- 📦 Grouped console logs
- 🚀 React 19 with latest Vite

## Getting Started

1. Install Browser Echo for Vite:
   ```bash
   npm install -D @browser-echo/vite
   # or
   pnpm add -D @browser-echo/vite
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open the application in your browser and interact with the demo buttons

5. Watch your terminal to see browser console logs streamed in real-time!

## What to Expect

When you click the demo buttons, you'll see:
- Colored console output in your terminal
- Proper log level indicators (info, warn, error)
- Stack traces for errors
- Grouped console messages
- Real-time streaming as you interact with the app

## Configuration

The browser-echo plugin is configured in `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import browserEcho from 'browser-echo'

export default defineConfig({
  plugins: [react(), browserEcho()],
})
```

## Learn More

- [Browser Echo Documentation](../../README.md)
- [React Documentation](https://react.dev)
- [Vite Documentation](https://vite.dev)