import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    strictPort: false,
    host: true,
  },
  build: {
    rollupOptions: {
      input: {
        // Main entry: the LittleWarCraft2but RTS (menu → skirmish vs AI).
        main: resolve(__dirname, 'index.html'),
        // Side entry: the Kingdom OS 2000 idle-RTS revival experiment.
        kingdom: resolve(__dirname, 'kingdom.html'),
      },
    },
  },
});
