
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
        } else {
            alert('Para instalar no Android:\n1. Toque nos 3 pontos verticais (canto superior direito)\n2. Toque em "Instalar aplicativo" ou "Adicionar à tela inicial"');
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
        <div className="fixed inset-0 bg-gradient-to-br from-primary-950 via-slate-900 to-emerald-950 overflow-y-auto overflow-x-hidden selection:bg-emerald-500 selection:text-white">
            <div className="min-h-full w-full flex flex-col items-center justify-start py-12 px-6">
                <div className="w-full max-w-md space-y-8 pb-20">
                    {/* Logo e Título */}
                    <div className="text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-600 rounded-2xl mb-4 shadow-xl shadow-emerald-600/20 transform hover:scale-105 transition-transform duration-500">
                            <Wrench size={32} className="text-white" />
                        </div>
                        <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter mb-1">
                            Nexus<span className="text-emerald-500">.Tech</span>
                        </h1>
                        <p className="text-emerald-400 text-[9px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2">
                            <Smartphone size={12} />
                            Field Service Portal
                        </p>
                    </div>

                    {/* Card de Login */}
                    <div className="bg-white/10 backdrop-blur-2xl rounded-[2.5rem] p-8 border border-white/10 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent"></div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-emerald-500 uppercase tracking-widest px-1">
                                    Identificação do Técnico
                                </label>
                                <Input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="seu@email.com"
                                    className="bg-white border-none text-slate-900 placeholder:text-slate-400 rounded-2xl py-4 h-14 focus:ring-2 focus:ring-emerald-500/50 shadow-inner"
                                    icon={<Mail size={18} className="text-slate-400" />}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-emerald-500 uppercase tracking-widest px-1">
                                    Chave de Acesso
                                </label>
                                <div className="relative">
                                    <Input
                                        type={showPassword ? "text" : "password"}
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="bg-white border-none text-slate-900 placeholder:text-slate-400 rounded-2xl py-4 h-14 focus:ring-2 focus:ring-emerald-500/50 shadow-inner pr-12"
                                        icon={<Lock size={18} className="text-slate-400" />}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-emerald-500 transition-colors p-2"
                                    >
                                        {showPassword ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88L14.12 14.12" /><path d="M2 2l20 20" /><path d="M10.37 4.37a9 9 0 0 1 8.94 4.14" /><path d="M22 12c-1.33 2.667-3.533 4.667-6.6 6" /><path d="M15 15a3 3 0 0 1-4.24-4.24" /><path d="M11.63 19.63A9 9 0 0 1 2 12c1.33-2.667 3.533-4.667 6.6-6" /></svg>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0z" /><circle cx="12" cy="12" r="3" /></svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-between px-1">
                                <label className="flex items-center gap-2 cursor-pointer group/check">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={rememberMe}
                                            onChange={(e) => setRememberMe(e.target.checked)}
                                        />
                                        <div className={`w-5 h-5 rounded-lg border-2 transition-all duration-300 flex items-center justify-center ${rememberMe ? 'bg-emerald-600 border-emerald-600' : 'bg-white/5 border-white/10'}`}>
                                            {rememberMe && (
                                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>
                                    </div>
                                    <span className="text-[9px] font-black text-white/50 uppercase tracking-widest group-hover/check:text-emerald-400 transition-colors">Manter conectado</span>
                                </label>
                            </div>

                            {error && (
                                <div className="bg-red-500/20 border border-red-500/20 rounded-2xl p-4">
                                    <p className="text-red-300 text-[10px] font-black text-center uppercase tracking-tight">{error}</p>
                                </div>
                            )}

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl py-6 h-16 text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-emerald-900/40 transform active:scale-95 transition-all"
                            >
                                {loading ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-t-2 border-white rounded-full animate-spin"></div>
                                        <span>Entrando...</span>
                                    </div>
                                ) : 'Acessar APP'}
                            </Button>
                        </form>
                    </div>

                    {/* Botão de Instalação Pulsante e Aparente */}
                    {!isStandalone && (
                        <div className="pt-2">
                            <button
                                onClick={handleInstallClick}
                                className="w-full relative py-5 bg-emerald-500/10 border-2 border-emerald-500/40 rounded-2xl transition-all active:scale-95 animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.2)] overflow-hidden group"
                            >
                                {/* Efeito de brilho passando */}
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-400/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>

                                <div className="flex flex-col items-center justify-center gap-1 text-emerald-400 relative z-10">
                                    <div className="flex items-center gap-3">
                                        <Download size={22} className="animate-bounce" />
                                        <span className="text-[11px] font-black uppercase tracking-[0.2em]">
                                            {isIOS ? 'Instalar no iPhone (iOS)' :
                                                isInstallable ? 'Instalar Agora (Android)' :
                                                    'Como Instalar o APP'}
                                        </span>
                                    </div>
                                    {!isInstallable && !isIOS && (
                                        <span className="text-[7px] font-bold uppercase opacity-60 tracking-widest">
                                            Clique para ver as instruções de instalação
                                        </span>
                                    )}
                                </div>
                            </button>

                            {!isInstallable && !isIOS && (
                                <p className="mt-3 text-white/20 text-[8px] font-bold uppercase text-center leading-relaxed px-4">
                                    Para melhor experiência, instale o Nexus Tech na sua tela de início usando o menu do Chrome ou Safari.
                                </p>
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
