import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('./dashboard', import.meta.url))
const outDir = resolve(root, '..', 'dist', 'dashboard')

export default defineConfig({
  root,
  base: './',
  publicDir: false,
  build: {
    outDir,
    emptyOutDir: true,
  }
})
