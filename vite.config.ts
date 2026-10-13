import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/poker-trainer/',
  plugins: [
    react(),
    VitePWA({
      // The app asks before activating a new version, so training is never reloaded mid-spot.
      registerType: 'prompt',
      manifest: {
        name: 'Poker-Trainer',
        short_name: 'Poker',
        description: 'Push/Fold-Trainer für Texas-Hold’em-Turniere',
        lang: 'de',
        start_url: '/poker-trainer/',
        scope: '/poker-trainer/',
        display: 'standalone',
        background_color: '#0E4D2E',
        theme_color: '#0E4D2E',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1200 },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
});
