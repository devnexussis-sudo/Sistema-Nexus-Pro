
import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Mail, Lock, Wrench, Smartphone, Download, Info } from 'lucide-react';
import { DataService } from '../services/dataService';
import { User, UserRole } from '../types';

interface TechLoginProps {
    onLogin: (user: User) => void;
}

export const TechLogin: React.FC<TechLoginProps> = ({ onLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(true);
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isInstallable, setIsInstallable] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);

    useEffect(() => {
        // Detecta iOS
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        setIsIOS(isIOSDevice);

        // Detecta se já está instalado (Standalone)
        const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
        setIsStandalone(!!isStandaloneMode);

        const handler = (e: any) => {
            console.log('[PWA] beforeinstallprompt disparado');
            e.preventDefault();
            setDeferredPrompt(e);
            setIsInstallable(true);
        };

        window.addEventListener('beforeinstallprompt', handler);

        // Se já passaram alguns segundos e não disparou, pode ser que o browser não suporte ou já esteja instalado
        const timer = setTimeout(() => {
            if (!deferredPrompt && !isStandaloneMode) {
                console.log('[PWA] Prompt não disparou automaticamente.');
            }
        }, 3000);

        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
            clearTimeout(timer);
        };
    }, [deferredPrompt, isStandalone]);

    const handleInstallClick = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                setIsInstallable(false);
                setDeferredPrompt(null);
            }
        } else if (isIOS) {
            alert('Para instalar no iPhone:\n1. Toque no ícone de Compartilhar (quadrado com seta)\n2. Role para baixo e toque em "Adicionar à Tela de Início"');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const user = await DataService.login(email, password);

            if (!user) {
                setError('Credenciais inválidas. Verifique seu e-mail e senha.');
                setLoading(false);
                return;
            }

            if (user.role !== UserRole.TECHNICIAN) {
                setError('Este portal é exclusivo para técnicos de campo.');
                const { supabase } = await import('../lib/supabase');
                await supabase.auth.signOut();
                setLoading(false);
                return;
            }

            onLogin(user);
        } catch (err: any) {
            console.error('[TechLogin] Error:', err);
            setError(err.message || 'Erro ao fazer login. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-gradient-to-br from-indigo-950 via-slate-900 to-emerald-950 overflow-y-auto overflow-x-hidden selection:bg-emerald-500 selection:text-white">
            <div className="min-h-full w-full flex flex-col items-center justify-start py-12 px-6">
                <div className="w-full max-w-md space-y-8 pb-20">
                    {/* Logo e Título */}
                    <div className="text-center">
                        <div className="inline-flex items-center justify-center w-24 h-24 bg-emerald-600 rounded-[2.5rem] mb-6 shadow-2xl shadow-emerald-600/20 transform hover:scale-105 transition-transform duration-500">
                            <Wrench size={48} className="text-white" />
                        </div>
                        <h1 className="text-5xl font-black text-white uppercase italic tracking-tighter mb-2">
                            Nexus<span className="text-emerald-500">.Tech</span>
                        </h1>
                        <p className="text-emerald-400 text-[10px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3">
                            <Smartphone size={14} />
                            Field Service Portal
                        </p>
                    </div>

                    {/* Card de Login */}
                    <div className="bg-white/5 backdrop-blur-2xl rounded-[3.5rem] p-10 border border-white/10 shadow-3xl relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>

                        <form onSubmit={handleSubmit} className="space-y-8">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-emerald-500/80 uppercase tracking-widest px-1">
                                    Identificação do Técnico
                                </label>
                                <Input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="seu@email.com"
                                    className="bg-slate-900/50 border-white/10 text-white placeholder:text-white/20 rounded-3xl py-5 h-16 focus:border-emerald-500/50 transition-all"
                                    icon={<Mail size={20} className="text-emerald-500" />}
                                />
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-emerald-500/80 uppercase tracking-widest px-1">
                                    Chave de Acesso
                                </label>
                                <div className="relative">
                                    <Input
                                        type={showPassword ? "text" : "password"}
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="bg-slate-900/50 border-white/10 text-white placeholder:text-white/20 rounded-3xl py-5 h-16 focus:border-emerald-500/50 transition-all pr-14"
                                        icon={<Lock size={20} className="text-emerald-500" />}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-5 top-1/2 -translate-y-1/2 text-white/20 hover:text-emerald-400 transition-colors p-2"
                                    >
                                        {showPassword ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88L14.12 14.12" /><path d="M2 2l20 20" /><path d="M10.37 4.37a9 9 0 0 1 8.94 4.14" /><path d="M22 12c-1.33 2.667-3.533 4.667-6.6 6" /><path d="M15 15a3 3 0 0 1-4.24-4.24" /><path d="M11.63 19.63A9 9 0 0 1 2 12c1.33-2.667 3.533-4.667 6.6-6" /></svg>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0z" /><circle cx="12" cy="12" r="3" /></svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-between px-1">
                                <label className="flex items-center gap-3 cursor-pointer group/check">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={rememberMe}
                                            onChange={(e) => setRememberMe(e.target.checked)}
                                        />
                                        <div className={`w-6 h-6 rounded-xl border-2 transition-all duration-300 flex items-center justify-center ${rememberMe ? 'bg-emerald-600 border-emerald-600' : 'bg-transparent border-white/10'}`}>
                                            {rememberMe && (
                                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest group-hover/check:text-emerald-400 transition-colors">Manter acesso salvo</span>
                                </label>
                            </div>

                            {error && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-5 animate-shake">
                                    <p className="text-red-400 text-xs font-black text-center uppercase tracking-tight">{error}</p>
                                </div>
                            )}

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-[2rem] py-8 h-20 text-xs font-black uppercase tracking-[0.2em] shadow-3xl shadow-emerald-900/40 transform active:scale-95 transition-all"
                            >
                                {loading ? (
                                    <div className="flex items-center gap-3">
                                        <div className="w-5 h-5 border-t-2 border-white rounded-full animate-spin"></div>
                                        <span>Autenticando...</span>
                                    </div>
                                ) : 'Entrar no Sistema'}
                            </Button>
                        </form>
                    </div>

                    {/* Botão de Instalação ou Instruções */}
                    {!isStandalone && (
                        <div className="space-y-4 pt-4">
                            {(isInstallable || isIOS) ? (
                                <button
                                    onClick={handleInstallClick}
                                    className="w-full group relative py-6 bg-gradient-to-r from-emerald-500/10 to-emerald-600/5 border border-emerald-500/30 rounded-[2.5rem] overflow-hidden transition-all hover:bg-emerald-500/20 active:scale-95"
                                >
                                    <div className="flex items-center justify-center gap-4 text-emerald-400">
                                        <Download size={20} className="group-hover:bounce" />
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                                            {isIOS ? 'Instruções para iPhone' : 'Instalar Aplicativo (Android)'}
                                        </span>
                                    </div>
                                </button>
                            ) : (
                                <div className="p-6 bg-white/5 border border-white/5 rounded-[2.5rem] flex items-start gap-4">
                                    <Info size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                                    <p className="text-white/30 text-[9px] font-bold uppercase leading-relaxed text-left">
                                        Dica: Use o Google Chrome no Android ou Safari no iOS para instalar o atalho na tela inicial e ter uma melhor experiência.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="text-center space-y-4">
                        <p className="text-white/20 text-[9px] font-black uppercase tracking-widest">
                            Nexus Pro Platform • Field Service v2.0
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
