import React from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

interface ConnectivityBannerProps {
    isOnline: boolean;
    isSessionValid: boolean;
    isSyncing: boolean;
    lastSync: string | null;
}

export const ConnectivityBanner: React.FC<ConnectivityBannerProps> = ({
    isOnline,
    isSessionValid,
    isSyncing,
    lastSync
}) => {
    // Se offline ou sessão inválida, mostrar banner de aviso
    if (!isOnline || !isSessionValid) {
        return (
            <div className={`
                fixed top-0 left-0 right-0 z-[9999]
                ${!isOnline ? 'bg-amber-50 border-b border-amber-200' : 'bg-rose-50 border-b border-rose-200'}
                px-4 py-2 flex items-center justify-center gap-2
                animate-fade-in
            `}>
                {!isOnline ? (
                    <>
                        <WifiOff size={14} className="text-amber-600" />
                        <span className="text-xs font-semibold text-amber-800">
                            Sem conexão • Usando dados em cache
                        </span>
                    </>
                ) : (
                    <>
                        <XCircle size={14} className="text-rose-600" />
                        <span className="text-xs font-semibold text-rose-800">
                            Sessão expirada • Faça login novamente
                        </span>
                    </>
                )}
            </div>
        );
    }

    // Se está sincronizando, mostrar indicador discreto
    if (isSyncing) {
        return (
            <div className="fixed top-4 right-4 z-[9999]">
                <div className="bg-white/95 backdrop-blur-sm border border-slate-200 shadow-lg rounded-full px-3 py-1.5 flex items-center gap-2 animate-fade-in">
                    <RefreshCw size={12} className="text-indigo-600 animate-spin" />
                    <span className="text-[10px] font-semibold text-slate-700 uppercase tracking-wide">
                        Sincronizando
                    </span>
                </div>
            </div>
        );
    }

    // Indicador sutil de última sincronização (apenas se sincronizou recentemente)
    if (lastSync) {
        const syncDate = new Date(lastSync);
        const now = new Date();
        const diffMinutes = Math.floor((now.getTime() - syncDate.getTime()) / 60000);

        // Só mostra se sincronizou nos últimos 2 minutos
        if (diffMinutes < 2) {
            return (
                <div className="fixed top-4 right-4 z-[9999] animate-fade-in">
                    <div className="bg-emerald-50/95 backdrop-blur-sm border border-emerald-200 shadow-lg rounded-full px-3 py-1.5 flex items-center gap-2">
                        <CheckCircle2 size={12} className="text-emerald-600" />
                        <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">
                            Sincronizado
                        </span>
                    </div>
                </div>
            );
        }
    }

    return null;
};
