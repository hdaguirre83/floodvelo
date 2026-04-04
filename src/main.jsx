import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Admin from './Admin.jsx'
import MapaEventos from './MapaEventos.jsx'

const path = window.location.pathname

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {path === '/admin' ? <Admin /> : path === '/mapa' ? <MapaEventos /> : <App />}
  </React.StrictMode>
)