import { defineConfig } from 'vite'

export default defineConfig({
  // Allow access through an HTTPS tunnel (ngrok, cloudflared, ...)
  server: { port: 30142, allowedHosts: true },
  preview: { port: 30142, allowedHosts: true }
})
