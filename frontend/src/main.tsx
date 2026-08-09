import { StrictMode } from 'react'; import { createRoot } from 'react-dom/client'; import App from './App'; import './styles.css'; import './dashboard.css'; import './inventory-dashboard.css'; import './category-dashboard.css'; import './category-print.css';
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
