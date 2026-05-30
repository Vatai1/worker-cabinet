import { createRoot } from 'react-dom/client'
import './index.css'
import '@xyflow/react/dist/style.css'
import App from './App'

const rootEl = document.getElementById('root')!

const root = createRoot(rootEl)
root.render(<App />)

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    const observer = new MutationObserver(() => {
      if (rootEl.childElementCount === 0) {
        observer.disconnect()
        location.reload()
      }
    })
    observer.observe(rootEl, { childList: true })
    setTimeout(() => observer.disconnect(), 5000)
  })

  import.meta.hot.on('vite:error', () => {
    setTimeout(() => {
      if (rootEl.childElementCount === 0) {
        location.reload()
      }
    }, 1000)
  })
}
