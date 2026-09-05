
import '../css/main.css'
import '../css/registration.css'
import '../css/CreateNote.css'
import '../css/TreeNote.css'


import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import MiniApp from './miniApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MiniApp />
  </StrictMode>,
)