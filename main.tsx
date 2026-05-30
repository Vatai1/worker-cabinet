import { createRoot } from 'react-dom/client'
import './index.css'
import '@xyflow/react/dist/style.css'
import App from './App'

const root = createRoot(document.getElementById('root')!)
root.render(<App />)

if (import.meta.hot) {
  import.meta.hot.on('vite:error', () => {
    setTimeout(() => location.reload(), 500)
  })
  import.meta.hot.on('vite:beforeUpdate', () => {
    const check = setInterval(() => {
      const el = document.getElementById('root')
      if (el && el.innerHTML === '') {
        clearInterval(check)
        location.reload()
      }
    }, 300)
    setTimeout(() => clearInterval(check), 5000)
  })
}
