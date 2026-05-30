import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@xyflow/react/dist/style.css'
import App from './App'

const rootEl = document.getElementById('root')!

let bootAttempted = false

function boot() {
  bootAttempted = true
  const root = createRoot(rootEl)
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

window.addEventListener('error', () => {
  if (bootAttempted && rootEl.childElementCount === 0) {
    location.reload()
  }
})

boot()
