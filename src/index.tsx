import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/admin.css';
import 'leaflet/dist/leaflet.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './lib/telemetry'; // 📡 Initialize global logging system
import './lib/idleLogout'; // Timer de inatividade (12h)

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
