import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Main and preload use electron-vite's conventions (src/main/index.ts, src/preload/index.ts).
// The renderer has three separate pages, one per window.
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          bubble: resolve('src/renderer/bubble.html'),
          stage: resolve('src/renderer/stage.html'),
          overlay: resolve('src/renderer/overlay.html')
        }
      }
    }
  }
})
