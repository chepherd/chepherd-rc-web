// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

// Mirror the chepherd palette canon — see the chepherd repo's
// internal/style/palette.go for the source-of-truth hex values.
export default defineConfig({
  integrations: [svelte()],
  site: 'https://chepherd.org',
  base: '/app',
  build: {
    inlineStylesheets: 'auto',
    assets: '_assets',
  },
  vite: {
    server: {
      // Useful for testing against a local chepherd-relay instance.
      proxy: {
        '/v1': {
          target: 'http://localhost:9889',
          changeOrigin: true,
          ws: true,
        },
      },
    },
  },
  // The single-page app is mostly client-rendered Svelte islands; static
  // shell minimises JS on first paint.
  output: 'static',
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
});
