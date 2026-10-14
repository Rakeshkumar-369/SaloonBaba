import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': 'http://localhost:4000', '/uploads': 'http://localhost:4000' },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      output: { manualChunks: { react: ['react', 'react-dom'] } },
    },
  },
});
