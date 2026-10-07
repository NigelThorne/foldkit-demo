import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), foldkit({ devToolsMcpPort: false })],
  optimizeDeps: {
    entries: ['src/entry.ts'],
  },
})
