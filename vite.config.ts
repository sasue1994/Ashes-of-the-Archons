import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// หลายหน้า: / = landing (ไทย), /en/ = landing (อังกฤษ), /play/ = ตัวเกม
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rolldownOptions: {
      input: {
        landing: resolve(import.meta.dirname, 'index.html'),
        landingEn: resolve(import.meta.dirname, 'en/index.html'),
        play: resolve(import.meta.dirname, 'play/index.html'),
      },
    },
  },
  server: { host: true },
});
