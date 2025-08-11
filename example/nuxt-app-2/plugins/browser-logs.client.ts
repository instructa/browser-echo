export default defineNuxtPlugin(async () => {
  if (!import.meta.dev) return
  if (typeof window === 'undefined') return
  await import('virtual:browser-logs-to-terminal')
})


