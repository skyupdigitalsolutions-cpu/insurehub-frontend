import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { PublicQuotationPage } from './modules/quotations/PublicQuotationPage';
import { PublicComparisonPage } from './modules/quotations/PublicComparisonPage';
import './styles.css';

// The customer's quotation link (/q/<token>) needs no sign-in (P-28).
const q = /^\/q\/([A-Za-z0-9_-]{40,60})$/.exec(window.location.pathname);
const c = /^\/c\/([A-Za-z0-9_-]{40,60})$/.exec(window.location.pathname);
createRoot(document.getElementById('root')!).render(<StrictMode>{q ? <PublicQuotationPage token={q[1]!} /> : c ? <PublicComparisonPage token={c[1]!} /> : <App />}</StrictMode>);