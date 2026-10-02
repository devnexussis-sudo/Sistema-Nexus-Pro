import React, { useState, useEffect } from 'react';
import { WifiOff, Loader2 } from 'lucide-react';
import { safeCreatePortal } from '../../utils/portal';

export const NetworkStatusIndicator: React.FC = () => {
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [isVisible, setIsVisible] = useState(!navigator.onLine);
    const offlineTimeoutRef = React.useRef<NodeJS.Timeout>();
    const hideTimeoutRef = React.useRef<NodeJS.Timeout>();

    useEffect(() => {
        const handleOffline = () => {
            // Se cair a internet, cancela o hide se ele estiver ativo
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
            
            // Aguarda 3 segundos para confirmar que a queda é real (evitar oscilações)
            offlineTimeoutRef.current = setTimeout(() => {
                setIsOffline(true);
                setIsVisible(true);
            }, 3000);
        };

        const handleOnline = () => {
            // Se a internet voltou antes dos 3 segundos, cancela o timeout de queda
            if (offlineTimeoutRef.current) clearTimeout(offlineTimeoutRef.current);
            
            // Se já estávamos exibindo o modal offline, mudamos para "Voltando..." e sumimos suavemente
            setIsOffline(prevIsOffline => {
                if (prevIsOffline) {
                    setIsVisible(true);
                    hideTimeoutRef.current = setTimeout(() => {
                        setIsVisible(false);
                    }, 2500);
                }
                return false;
            });
        };

        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);

        return () => {
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
            if (offlineTimeoutRef.current) clearTimeout(offlineTimeoutRef.current);
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        };
    }, []);

    if (!isVisible) return null;

    return safeCreatePortal(
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-500 ease-out transform ${isVisible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-8 opacity-0 scale-95'}`}>
            <div className={`px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 border ${isOffline ? 'bg-rose-50 border-rose-200 text-rose-700 shadow-rose-900/10' : 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-emerald-900/10'}`}>
                {isOffline ? (
                    <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center shrink-0">
                        <WifiOff size={20} className="text-rose-600 animate-pulse" />
                    </div>
                ) : (
                    <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                        <Loader2 size={20} className="text-emerald-600 animate-spin" />
                    </div>
                )}
                
                <div>
                    <h3 className={`text-[13px] font-black uppercase tracking-widest ${isOffline ? 'text-rose-800' : 'text-emerald-800'}`}>
                        {isOffline ? 'Sem Conexão' : 'Conexão Restabelecida'}
                    </h3>
                    <p className={`text-[11px] font-medium mt-0.5 ${isOffline ? 'text-rose-600/80' : 'text-emerald-600/80'}`}>
                        {isOffline ? 'Você está operando em modo offline.' : 'Sincronizando dados pendentes...'}
                    </p>
                </div>
            </div>
        </div>
    );
};
