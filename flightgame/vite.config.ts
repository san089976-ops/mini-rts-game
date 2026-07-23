import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  server: {
    host: true, // listen 0.0.0.0 + localhost so 127.0.0.1 works
    port: 5173,
    strictPort: true,
    open: false
  },
  preview: {
    host: true,
    port: 5173
  },
  build: {
    outDir: 'web',
    emptyOutDir: true,
    sourcemap: false
  }
});
