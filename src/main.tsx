import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

function App() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        background: '#0b1210',
        color: '#e6edf3',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div>AramHexQuickSearch</div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
