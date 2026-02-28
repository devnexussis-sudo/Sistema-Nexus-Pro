
import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Activity, ShieldCheck, Download, AlertCircle, Terminal, HardDrive, RefreshCw, Layers } from 'lucide-react';
import { supabase, supabaseDiagnostics } from '../lib/supabase';
import { telemetry } from '../lib/telemetry';

export const ResilienceIndicator: React.FC = () => {
    const [isOnline, setIsOnline] = useState(window.navigator.onLine);
    const [supabaseStatus, setSupabaseStatus] = useState<'online' | 'connecting' | 'offline'>('connecting');
    const [showDebug, setShowDebug] = useState(false);
    const [lastCheck, setLastCheck] = useState<string>('');
    const [recentLogs, setRecentLogs] = useState<any[]>([]);
    const [isPinging, setIsPinging] = useState(false);
    const [pingResult, setPingResult] = useState<string | null>(null);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const checkStatus = async () => {
            try {
                const res = await supabaseDiagnostics.ping();
                setSupabaseStatus(res.success ? 'online' : 'offline');
                setLastCheck(new Date().toLocaleTimeString());
            } catch {
                setSupabaseStatus('offline');
            }
        };

        const interval = setInterval(checkStatus, 45000);
        checkStatus();

        if (showDebug) {
            setRecentLogs(telemetry.getRecentLogs().slice(-10).reverse());
            const logInterval = setInterval(() => {
                setRecentLogs(telemetry.getRecentLogs().slice(-10).reverse());
            }, 2000);
            return () => clearInterval(logInterval);
        }

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
    }, [showDebug]);

    const runPing = async () => {
        setIsPinging(true);
        setPingResult('Testando...');
        try {
            const res = await supabaseDiagnostics.ping();
            setPingResult(`OK! Latência: ${res.latency}ms`);
            setSupabaseStatus('online');
        } catch (err: any) {
            setPingResult(`ERRO: ${err.message || 'Falha na conexão'}`);
            setSupabaseStatus('offline');
        } finally {
            setIsPinging(false);
        }
    };

    const getStatusColor = () => {
        if (!isOnline) return 'bg-rose-500 shadow-rose-500/50';
        if (supabaseStatus === 'offline') return 'bg-amber-500 shadow-amber-500/50';
        return 'bg-emerald-500 shadow-emerald-500/50';
    };

    return (
        <>
            <div
                onClick={() => setShowDebug(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all cursor-pointer group"
                title="Diagnóstico Nexus (Shift+Option+D)"
            >
                <div className={`w-2 h-2 rounded-full ${getStatusColor()} animate-pulse shadow-[0_0_8px_rgba(0,0,0,0.2)]`} />
                <span className="text-[9px] font-black uppercase text-white/60 group-hover:text-white transition-colors tracking-widest hidden lg:block">
                    {isOnline ? (supabaseStatus === 'online' ? 'Nexus Cloud: Ativa' : 'Cloud: Instável') : 'Internet: Offline'}
                </span>
            </div>

            {showDebug && (
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 backdrop-blur-md bg-slate-900/60 transition-all duration-300">
                    <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-slate-800/40 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-primary-600/20 rounded-xl">
                                    <Terminal className="text-primary-400" size={20} />
                                </div>
                                <div>
                                    <h3 className="text-white font-black text-sm uppercase tracking-widest leading-none">Nexus Diagnostic Console</h3>
                                    <p className="text-white/40 text-[9px] font-bold uppercase mt-1.5">Engine v2.5 • Estável</p>
                                </div>
                            </div>
                            <button onClick={() => setShowDebug(false)} className="bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-xl transition-all p-2.5">
                                <Activity size={18} />
                            </button>
                        </div>

                        {/* Body - Scrollable */}
                        <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar flex-1">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-3xl bg-white/5 border border-white/5">
                                    <div className="flex items-center gap-2 mb-2 text-white/40 text-[9px] font-black uppercase tracking-[0.2em]">
                                        <Wifi size={12} className={isOnline ? 'text-emerald-400' : 'text-rose-400'} /> Status Rede
                                    </div>
                                    <p className={`text-xs font-black uppercase ${isOnline ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {isOnline ? 'Internet Conectada' : 'Sem Conexão Internet'}
                                    </p>
                                </div>
                                <div className="p-4 rounded-3xl bg-white/5 border border-white/5">
                                    <div className="flex items-center gap-2 mb-2 text-white/40 text-[9px] font-black uppercase tracking-[0.2em]">
                                        <HardDrive size={12} className={supabaseStatus === 'online' ? 'text-emerald-400' : 'text-rose-400'} /> Nexus Cloud
                                    </div>
                                    <p className={`text-xs font-black uppercase ${supabaseStatus === 'online' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {supabaseStatus === 'online' ? 'Banco de Dados: OK' : 'Banco de Dados: Offline'}
                                    </p>
                                </div>
                            </div>

                            {/* Ping e Realtime */}
                            <div className="space-y-4">
                                <h4 className="text-white/40 text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                                    <ShieldCheck size={12} /> Testes de Conectividade
                                </h4>
                                <div className="flex gap-3">
                                    <button
                                        onClick={runPing}
                                        disabled={isPinging}
                                        className="flex-1 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group flex flex-col items-center justify-center text-center gap-2"
                                    >
                                        <RefreshCw size={18} className={`text-primary-400 ${isPinging ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Testar Latência</span>
                                        {pingResult && <span className="text-[9px] font-bold text-primary-300 opacity-60">{pingResult}</span>}
                                    </button>
                                    <div className="flex-1 p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col items-center justify-center text-center gap-2">
                                        <Layers size={18} className="text-purple-400" />
                                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Realtime Status</span>
                                        <span className="text-[9px] font-bold text-purple-300 opacity-60 uppercase">{typeof supabaseDiagnostics.checkRealtime === 'function' ? supabaseDiagnostics.checkRealtime().status : 'Não Disponível'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Logs Recentes */}
                            <div className="space-y-3">
                                <h4 className="text-white/40 text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Terminal size={12} /> Console de Eventos Recentes
                                </h4>
                                <div className="p-4 rounded-3xl bg-black/40 border border-white/5 font-mono text-[10px] space-y-2 overflow-hidden">
                                    {recentLogs.length > 0 ? (
                                        recentLogs.map((log, i) => (
                                            <div key={i} className="flex gap-3 border-b border-white/5 pb-2 last:border-0 truncate">
                                                <span className="text-primary-500 font-bold shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                                                <span className={`uppercase font-black px-1 rounded text-[8px] h-fit shrink-0 ${log.type === 'error' ? 'bg-rose-500/20 text-rose-400' :
                                                    log.type === 'warn' ? 'bg-amber-500/20 text-amber-400' : 'bg-white/10 text-white/40'
                                                    }`}>
                                                    {log.type}
                                                </span>
                                                <span className="text-white/70 truncate whitespace-nowrap overflow-hidden text-ellipsis">
                                                    {log.args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="py-8 text-center text-white/20 italic uppercase tracking-widest text-[9px]">Aguardando eventos...</div>
                                    )}
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    onClick={() => telemetry.downloadLogs()}
                                    className="flex-1 py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 text-white text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 shadow-xl shadow-primary-900/40 active:scale-95"
                                >
                                    <Download size={16} /> Exportar Log Completo
                                </button>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase border border-white/10 transition-all active:scale-95"
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
