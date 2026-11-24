/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const POLICY = [
  "default-src 'self'",
  "connect-src 'self' https://api.ebird.org",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'"
].join('; ');

// GitHub Pages cannot send headers, so the policy is a <meta> tag. Build only: the dev server injects inline scripts.
const csp = (): Plugin => ({
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', injectTo: 'head-prepend', attrs: { 'http-equiv': 'Content-Security-Policy', content: POLICY } }]
});

export default defineConfig({
  base: './',
  plugins: [
    react(),
    csp(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'BirdTally',
        short_name: 'BirdTally',
        description: 'Offline bird notebook for photographers',
        theme_color: '#0f1a14',
        background_color: '#0f1a14',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // Taxonomy is stored in IndexedDB, never fetched at runtime by the service worker.
        navigateFallback: 'index.html'
      }
    })
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
