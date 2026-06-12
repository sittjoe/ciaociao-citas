import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    // Mirror tsconfig "paths": tests can follow the same @/ imports the app uses
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
