
import React from 'react';
import { TechProvider, useTech } from './context/TechContext';
import { TechLoginV2 } from './views/TechLoginV2';
import { TechDashboardV2 } from './views/TechDashboardV2';
import { ConnectivityBanner } from './components/ConnectivityBanner';
import './styles/tech-v2.css';

const TechAppShell: React.FC = () => {
    const { auth, connectivity, isSyncing, toast } = useTech();

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

            {/* Global Toast Layer */}
            {toast && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] w-[90%] max-w-sm animate-in fade-in zoom-in duration-300">
                    <div className={`px-6 py-4 rounded-3xl shadow-2xl border flex items-center justify-center gap-3 backdrop-blur-2xl ${toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                        }`}>
                        <div className={`w-2 h-2 rounded-full animate-pulse ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <span className="text-[10px] font-black uppercase tracking-widest">{toast.message}</span>
                    </div>
                </div>
            )}
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
