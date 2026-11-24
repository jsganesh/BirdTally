import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { settleStalePositions } from './store';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './styles.css';

void settleStalePositions();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
