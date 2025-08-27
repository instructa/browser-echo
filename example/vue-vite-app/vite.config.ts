import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import browserEcho from '@browser-echo/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), browserEcho(
    {
      stackMode: 'condensed',
      network: { enabled: true }
    },
  )],
})