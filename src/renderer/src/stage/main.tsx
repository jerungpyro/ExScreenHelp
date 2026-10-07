import { createRoot } from 'react-dom/client'
import '../styles/tokens.css'
import './stage.css'
import './markdown.css'
import { Stage } from './Stage'

createRoot(document.getElementById('root')!).render(<Stage />)
