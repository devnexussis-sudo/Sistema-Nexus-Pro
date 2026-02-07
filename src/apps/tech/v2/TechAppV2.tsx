
import React from 'react';
import { TechProvider, useTech } from './context/TechContext';
import { TechLoginV2 } from './views/TechLoginV2';
import { TechDashboardV2 } from './views/TechDashboardV2';
import { ConnectivityBanner } from './components/ConnectivityBanner';
import './styles/tech-v2.css';

const TechAppShell: React.FC = () => {
    const { auth, connectivity, isSyncing } = useTech();

    React.useEffect(() => {
        // Sinaliza ao HTML que o app está pronto
        window.dispatchEvent(new CustomEvent('nexus-ready'));
    }, []);

    return (
        <>
            {/* 🛡️ Big Tech Connectivity Indicator */}
            <ConnectivityBanner
                isOnline={connectivity.isOnline}
                isSessionValid={connectivity.isSessionValid}
                isSyncing={isSyncing}
                lastSync={connectivity.lastSync}
            />

            {auth.isAuthenticated ? <TechDashboardV2 /> : <TechLoginV2 />}
        </>
    );
};

export const TechAppV2: React.FC = () => {
    return (
        <TechProvider>
            <TechAppShell />
        </TechProvider>
    );
};
