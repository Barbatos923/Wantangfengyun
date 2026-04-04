import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/Wantangfengyun/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': '/src',
      '@engine': '/src/engine',
      '@data': '/src/data',
      '@ui': '/src/ui',
    },
  },
})
