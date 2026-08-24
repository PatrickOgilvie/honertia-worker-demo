import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

import { readViteDevServerConfiguration } from './scripts/dev-environment'

const devServer = readViteDevServerConfiguration()

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '~': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: devServer.port,
    strictPort: true,
    cors: { origin: devServer.workerOrigin },
    origin: devServer.viteOrigin,
  },
  build: {
    manifest: 'manifest.json',
    outDir: 'dist',
    rollupOptions: {
      input: 'src/main.tsx',
    },
  },
})
