import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import browserEcho from '@browser-echo/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), browserEcho({ stackMode: 'condensed' })],
})