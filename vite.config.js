import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    // Proxy /api/* requests to the FastAPI backend so the React app never has to
    // think about CORS or cross-origin URLs. If the backend isn't running, these
    // requests will fail with a network error — the UI handles that gracefully.
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  // pdfjs-dist ships its worker as a separate file; Vite handles it via ?url import
  optimizeDeps: {
    include: ['pdfjs-dist/build/pdf', 'pdfjs-dist/build/pdf.worker.min.js'],
  },
});
