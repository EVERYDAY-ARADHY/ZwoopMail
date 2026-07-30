import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const azureApiKey = env.VITE_AZURE_PHI4_API_KEY || ''

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: {
          enabled: true
        },
        manifest: {
          name: 'ZwoopMail — Email, Reimagined',
          short_name: 'ZwoopMail',
          description: 'A modern, calm, AI-powered email client forked from legacy webmail chaos.',
          theme_color: '#fc5000',
          background_color: '#e2e2df',
          display: 'standalone',
          orientation: 'portrait-primary',
          icons: [
            {
              src: '/favicon.svg',
              sizes: '192x192 512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    server: {
      port: 5173,
      open: true,
      host: true,
      cors: true,
      allowedHosts: true,
      proxy: {
        '/api/ai': {
          target: 'https://main-phi-4-resource-gro-resource.openai.azure.com',
          changeOrigin: true,
          secure: true,
          rewrite: () => '/openai/deployments/phi-4/chat/completions?api-version=2024-12-01-preview',
          headers: {
            'api-key': azureApiKey,
          },
        },
      },
    },
  }
})
