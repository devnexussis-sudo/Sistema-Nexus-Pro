
import React, { useState, useEffect } from 'react';
import { supabaseDiagnostics } from '../lib/supabase';

export const ResilienceIndicator: React.FC = () => {
    const [isOnline, setIsOnline] = useState(window.navigator.onLine);
    const [supabaseStatus, setSupabaseStatus] = useState<'online' | 'connecting' | 'offline'>('connecting');

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const checkStatus = async () => {
            try {
                const res = await supabaseDiagnostics.ping();
                setSupabaseStatus(res.ok ? 'online' : 'offline');
            } catch {
                setSupabaseStatus('offline');
            }
        };

        const interval = setInterval(checkStatus, 60000); // a cada 60s
        checkStatus(); // cheque inicial

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(interval);
        };
    }, []);

    const getStatusColor = () => {
        if (!isOnline) return 'bg-rose-500 shadow-rose-500/50';
        if (supabaseStatus === 'offline') return 'bg-amber-500 shadow-amber-500/50';
        if (supabaseStatus === 'connecting') return 'bg-slate-400 shadow-slate-400/30';
        return 'bg-emerald-500 shadow-emerald-500/50';
    };

    const getStatusLabel = () => {
        if (!isOnline) return 'Internet: Offline';
        if (supabaseStatus === 'offline') return 'Cloud: Instável';
        if (supabaseStatus === 'connecting') return 'Conectando...';
        return 'Nexus Cloud: Ativa';
    };

    return (
        <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10"
            title={getStatusLabel()}
        >
            <div className={`w-2 h-2 rounded-full ${getStatusColor()} animate-pulse shadow-[0_0_8px_rgba(0,0,0,0.2)]`} />
            <span className="text-[9px] font-black uppercase text-white/60 tracking-widest hidden lg:block">
                {getStatusLabel()}
            </span>
        </div>
    );
};
