// https://nuxt.com/docs/api/configuration/nuxt-config
import browserLogsToTerminal from 'vite-browser-logs'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  vite: {
    plugins: [
      browserLogsToTerminal({
        injectHtml: false,
      }),
    ],
  },
})
