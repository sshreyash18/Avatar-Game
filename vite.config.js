import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // kalidokit is CJS — force-include so Vite pre-bundles it for the browser
    include: ['kalidokit'],
  },
})
