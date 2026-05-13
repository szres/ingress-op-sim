// astro.config.mjs
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import AstroPWA from '@vite-pwa/astro';

export default defineConfig({
  site: 'https://szres.github.io',
  base: '/ingress-op-sim',
  integrations: [
    svelte(),
    AstroPWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Ingress OP Sim',
        short_name: 'IngressOP',
        description: 'Astro + Svelte + Tailwind + DaisyUI PWA',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/ingress-op-sim/',
        icons: [
          {
            src: '/ingress-op-sim/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/ingress-op-sim/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        navigateFallback: '/ingress-op-sim/404',
        globPatterns: ['**/*.{css,js,html,svg,png,ico,txt}'],
      },
      devOptions: {
        enabled: true,
        navigateFallbackAllowlist: [/^\/ingress-op-sim\/$/],
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
