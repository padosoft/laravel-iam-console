import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The admin console SPA is built into the Laravel app's public/console directory and served, behind
// Fortify auth, by the catch-all `/console/{any?}` web route. In dev, `npm run dev` runs a Vite server
// and proxies same-origin API + auth calls to `php artisan serve` on :8000 so cookies/XSRF work.
export default defineConfig({
  base: '/console/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../../public/console',
    emptyOutDir: true,
    manifest: false,
  },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false },
      '/login': { target: 'http://127.0.0.1:8000', changeOrigin: false },
      '/logout': { target: 'http://127.0.0.1:8000', changeOrigin: false },
      '/sanctum': { target: 'http://127.0.0.1:8000', changeOrigin: false },
    },
  },
})
