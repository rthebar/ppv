import { defineConfig } from 'vite';
import ppvProxyPlugin from './ppv-proxy-plugin.mjs';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 3001,
    open: true,
  },
  plugins: [ppvProxyPlugin()],
});
