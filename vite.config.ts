import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'child_process'

function killPortPlugin(port: number) {
  return {
    name: 'kill-port',
    configureServer() {
      try {
        if (process.platform === 'win32') {
          const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' })
          const lines = result.split('\n').filter(Boolean)
          for (const line of lines) {
            const match = line.match(/\s+(\d+)\s*$/)
            if (match && match[1]) {
              const pid = match[1]
              if (pid !== '0') {
                console.log(`Killing process ${pid} on port ${port}...`)
                execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf-8' })
              }
            }
          }
        }
      } catch {}
    },
  }
}

function hmrFullReloadPlugin() {
  let server
  return {
    name: 'hmr-full-reload',
    configureServer(s) { server = s },
    handleHotUpdate() {
      server.ws.send({ type: 'full-reload' })
      return []
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), killPortPlugin(3000), hmrFullReloadPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './'),
      },
    },
    define: {
      'import.meta.env.VITE_ONLYOFFICE_URL': JSON.stringify(env.VITE_ONLYOFFICE_URL || 'http://localhost:8080'),
      'import.meta.env.VITE_PUBLIC_API_URL': JSON.stringify(env.VITE_PUBLIC_API_URL || 'http://host.docker.internal:5000/api'),
    },
    optimizeDeps: {
      include: ['react-pdf', '@xyflow/react'],
    },
    server: {
      port: 3000,
      strictPort: true,
      open: true,
      fs: {
        strict: false,
      },
    },
  }
})
