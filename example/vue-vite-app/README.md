# Vue + Vite + Browser Echo

This example demonstrates using **browser-echo** with a Vue + Vite application.

Browser Echo streams browser console logs to your Vite dev server terminal with colors, stack traces, and real-time updates.

## Features Demonstrated

- ✨ Real-time console log streaming to terminal
- 🎨 Colored output with proper log level indicators
- 📚 Stack traces for errors
- 🔄 Works with async operations
- 📦 Grouped console logs
- 🚀 Vue 3 Composition API with latest Vite

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open the application in your browser and interact with the demo buttons

4. Watch your terminal to see browser console logs streamed in real-time!

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
import vue from '@vitejs/plugin-vue'
import browserEcho from 'browser-echo'

export default defineConfig({
  plugins: [vue(), browserEcho()],
})
```

## Vue Integration

This example uses Vue 3 with the Composition API and demonstrates:
- Component lifecycle logging with `onMounted`
- Reactive state logging with `ref`
- Event handler logging
- Error boundary logging

## Learn More

- [Browser Echo Documentation](../../README.md)
- [Vue Documentation](https://vuejs.org)
- [Vite Documentation](https://vite.dev)