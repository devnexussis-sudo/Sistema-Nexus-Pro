
import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tech.css';
import 'leaflet/dist/leaflet.css';
import { TechAppV2 } from './apps/tech/v2/TechAppV2';
import ErrorBoundary from './components/ErrorBoundary';
import './lib/idleLogout'; // Timer de inatividade (12h)

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
    <React.StrictMode>
        <ErrorBoundary>
            <TechAppV2 />
        </ErrorBoundary>
    </React.StrictMode>
);
