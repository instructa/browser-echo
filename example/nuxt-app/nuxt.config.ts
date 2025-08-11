// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@browser-echo/nuxt'],
  browserEcho: {
    enabled: true,
    route: '/__client-logs',
    tag: '[nuxt-browser]'
  }
})
