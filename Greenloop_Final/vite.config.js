import { defineConfig } from 'vite';

// In development the browser talks to Vite (5173) and Vite forwards /api/* to the Node backend.
// That means no CORS setup is needed locally. Change the target if your API runs elsewhere.
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
