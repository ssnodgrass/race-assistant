import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// In Wails v3, we don't need to manually connect if the server is enabled,
// but we ensure the app is mounted only once.
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
