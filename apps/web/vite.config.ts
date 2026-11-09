import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In dev, forward /api to `wrangler dev` (apps/api). In production the Pages Function does this.
    proxy: { '/api': 'http://localhost:8787' },
  },
});
