
import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tech.css';
import 'leaflet/dist/leaflet.css';
import { TechAppShell } from './apps/tech/TechAppShell';
import ErrorBoundary from './components/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
    <React.StrictMode>
        <ErrorBoundary>
            <TechAppShell />
        </ErrorBoundary>
    </React.StrictMode>
);
