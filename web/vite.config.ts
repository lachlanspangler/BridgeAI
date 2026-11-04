import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev server is 127.0.0.1 only and proxies the API to the Bridge server (7411).
export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  server: {
    host: '127.0.0.1',
    port: 7412,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:7411', '/oauth': 'http://127.0.0.1:7411' },
  },
});
