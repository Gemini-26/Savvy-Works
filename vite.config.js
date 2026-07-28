import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),   // ← this is what was missing; processes all Tailwind classes
  ],
  optimizeDeps: {
    // Pre-bundle at server start so adding a new dep (e.g. jspdf) never triggers
    // a surprise full-page reload mid-session when it's first hit by a click.
    include: ['jspdf'],
  },
})
