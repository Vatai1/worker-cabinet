import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './'),
      },
    },
    define: {
      'import.meta.env.VITE_ONLYOFFICE_URL': JSON.stringify(env.VITE_ONLYOFFICE_URL || 'http://localhost:8080'),
    },
    optimizeDeps: {
      include: ['react-pdf'],
    },
    server: {
      port: 3000,
      open: true,
      fs: {
        strict: false,
      },
    },
  }
})
