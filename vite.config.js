import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'cazacrecidas-192.png', 'cazacrecidas-512.png'],
      manifest: {
        name: 'Cazadores de Crecidas Tucumán',
        short_name: 'CazaCrecidas',
        description: 'Plataforma de ciencia ciudadana para medición de velocidad de flujos de inundación en Tucumán',
        theme_color: '#0A0E1A',
        background_color: '#0A0E1A',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'cazacrecidas-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'cazacrecidas-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})