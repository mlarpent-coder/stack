import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base: './' keeps asset paths relative so it works on GitHub Pages subpaths
// and Netlify alike without reconfiguration.
// (Vitest picks up this config automatically and runs in its default node env,
//  which is all the pure-function engine tests need.)
export default defineConfig({
  // Served from a GitHub Pages project site at /stack/. If you move to a root
  // domain (Netlify, custom domain), change this back to '/'.
  base: '/stack/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Stack — honest supplement advice',
        short_name: 'Stack',
        description: 'An unbiased, personalised read on which vitamins and supplements actually make sense for you.',
        theme_color: '#fff6e9',
        background_color: '#fff6e9',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
