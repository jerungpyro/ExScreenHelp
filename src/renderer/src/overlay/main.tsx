import { createRoot } from 'react-dom/client'
import '../styles/tokens.css'
import './overlay.css'
import { SelectionOverlay } from './SelectionOverlay'

createRoot(document.getElementById('root')!).render(<SelectionOverlay />)
