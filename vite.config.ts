// Kept for editor tooling; electron-vite uses electron.vite.config.ts for actual builds.
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()]
})

