import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the dashboard proxies /api to the backend so no CORS setup is needed.
const target = process.env.RESCUEMESH_API ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': target } },
  preview: { port: 4173, proxy: { '/api': target } },
  build: { chunkSizeWarningLimit: 1200 },
});
