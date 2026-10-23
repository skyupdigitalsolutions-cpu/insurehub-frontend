import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev proxy: the browser talks to the Vite origin, Vite forwards /v1 and /health to the API.
// This mirrors production, where Nginx fronts the API on the same origin path.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/v1': { target: process.env.API_URL ?? 'http://localhost:4000', changeOrigin: false },
      '/health': { target: process.env.API_URL ?? 'http://localhost:4000', changeOrigin: false },
    },
  },
});