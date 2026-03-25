import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7842',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/tasks': {
        target: 'http://127.0.0.1:7842',
        changeOrigin: true,
        bypass: (req) => {
          // Browser page loads include text/html in Accept; API fetch() calls use */*.
          // Return index.html so the SPA router handles /tasks client-side.
          if (req.headers['accept']?.includes('text/html')) return '/index.html';
        },
      },
      '/pool': { target: 'http://127.0.0.1:7842', changeOrigin: true },
      '/config': { target: 'http://127.0.0.1:7842', changeOrigin: true },
      '/prompts': { target: 'http://127.0.0.1:7842', changeOrigin: true },
      '/meta': { target: 'http://127.0.0.1:7842', changeOrigin: true },
      '/workflows': { target: 'http://127.0.0.1:7842', changeOrigin: true },
      '/commands': { target: 'http://127.0.0.1:7842', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:7842', changeOrigin: true },
      '/session': { target: 'http://127.0.0.1:7842', changeOrigin: true },
      '/fs': { target: 'http://127.0.0.1:7842', changeOrigin: true },
      '/events': {
        target: 'ws://127.0.0.1:7842',
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', () => { /* suppress ECONNREFUSED / EPIPE on ws proxy */ });
        },
      },
    },
  },
  build: {
    outDir: '../orchestrator/public',
    emptyOutDir: true,
  },
});
