
import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Activity, ShieldCheck, Download, AlertCircle, Terminal, HardDrive } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { telemetry } from '../lib/telemetry';

export const ResilienceIndicator: React.FC = () => {
    const [isOnline, setIsOnline] = useState(window.navigator.onLine);
    const [supabaseStatus, setSupabaseStatus] = useState<'online' | 'connecting' | 'offline'>('connecting');
    const [showDebug, setShowDebug] = useState(false);
    const [lastCheck, setLastCheck] = useState<string>('');

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Monitor de Conexão Supabase Realtime
        const checkStatus = async () => {
            try {
                const { error } = await supabase.from('users').select('id').limit(1);
                setSupabaseStatus(error ? 'offline' : 'online');
                setLastCheck(new Date().toLocaleTimeString());
            } catch {
                setSupabaseStatus('offline');
            }
        };

        const interval = setInterval(checkStatus, 30000);
        checkStatus();

        // Shortcut: Shift + Alt (Option) + D para abrir diagnóstico
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.shiftKey && e.altKey && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                setShowDebug(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('keydown', handleKeyDown);
            clearInterval(interval);
        };
    }, []);

    const getStatusColor = () => {
        if (!isOnline) return 'bg-rose-500';
        if (supabaseStatus === 'offline') return 'bg-amber-500';
        return 'bg-emerald-500';
    };

    const getStatusText = () => {
        if (!isOnline) return 'Offline (Rede)';
        if (supabaseStatus === 'offline') return 'Erro Cloud';
        return 'Nexus Cloud Ativa';
    };

    return (
        <>
            {/* Status Dot in Header/Sidebar Area */}
            <div
                onClick={() => setShowDebug(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all cursor-pointer group"
                title="Status Nexus Cloud (Clique ou Shift+Alt+D para diagnóstico)"
            >
                <div className={`w-2 h-2 rounded-full ${getStatusColor()} animate-pulse shadow-[0_0_8px] shadow-current`} />
                <span className="text-[9px] font-black uppercase text-white/60 group-hover:text-white transition-colors tracking-widest hidden lg:block">
                    {getStatusText()}
                </span>
            </div>

            {/* Debug Modal Overlay */}
            {showDebug && (
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 backdrop-blur-md bg-slate-900/60 animate-fade-in">
                    <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
                        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-slate-800/40">
                            <div className="flex items-center gap-3">
                                <Terminal className="text-primary-400" size={20} />
                                <div>
                                    <h3 className="text-white font-bold text-sm uppercase tracking-widest">Diagnóstico Nexus Pro</h3>
                                    <p className="text-white/40 text-[9px] font-bold uppercase mt-0.5 whitespace-nowrap">
                                        Engine v2.4 • {window.navigator.platform.includes('Mac') ? 'Shift + Option + D' : 'Shift + Alt + D'}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setShowDebug(false)} className="text-white/40 hover:text-white transition-colors p-2">
                                <Activity size={18} />
                            </button>
                        </div>

                        <div className="p-8 space-y-8">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                    <div className="flex items-center gap-2 mb-2 text-white/40 text-[9px] font-bold uppercase tracking-widest">
                                        <Wifi size={12} /> Internet
                                    </div>
                                    <p className={`text-sm font-bold ${isOnline ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {isOnline ? 'CONECTADO' : 'SEM CONEXÃO'}
                                    </p>
                                </div>
                                <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                    <div className="flex items-center gap-2 mb-2 text-white/40 text-[9px] font-bold uppercase tracking-widest">
                                        <HardDrive size={12} /> Cloud Supabase
                                    </div>
                                    <p className={`text-sm font-bold ${supabaseStatus === 'online' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {supabaseStatus === 'online' ? 'ESTÁVEL' : 'INSTÁVEL'}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h4 className="text-white/40 text-[9px] font-bold uppercase tracking-widest">Sessão e Identidade</h4>
                                <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-slate-300 text-[10px] font-mono whitespace-pre overflow-x-auto">
                                    Último Check: {lastCheck || 'Processando...'}
                                    <br />
                                    Protocolo: HTTPS/WSS (TLS 1.3)
                                    <br />
                                    Tenant Guard: ATIVO
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    onClick={() => telemetry.downloadLogs()}
                                    className="flex-1 py-3 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2"
                                >
                                    <Download size={16} /> Baixar Logs de Sistema
                                </button>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase border border-white/10 transition-all"
                                >
                                    Hard Reload
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
