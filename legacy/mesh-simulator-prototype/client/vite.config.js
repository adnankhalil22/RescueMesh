import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = process.env.RESCUEMESH_SERVER ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': target,
      '/ws': { target, ws: true },
    },
  },
});
