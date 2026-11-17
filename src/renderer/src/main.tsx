import './assets/app.css'
// 図 (TikZ → SVG) の数式フォント
import 'node-tikzjax/css/fonts.css'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(<App />)
