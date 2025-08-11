import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import browserEcho from 'browser-echo'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), browserEcho()],
})