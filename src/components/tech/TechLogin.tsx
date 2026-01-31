import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Mail, Lock, Wrench, Smartphone } from 'lucide-react';
import { DataService } from '../../services/dataService';
import { User } from '../../types';

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

            if (user.role !== 'TECHNICIAN') {
                setError('Este portal é exclusivo para técnicos de campo. Administradores devem usar o portal /admin');
                setLoading(false);
                return;
            }

            // 🛡️ Nexus Persistence: Se "Manter Conectado" estiver ativo, salva no GlobalStorage
            if (rememberMe) {
                const { GlobalStorage } = await import('../../lib/sessionStorage');
                GlobalStorage.set('persistent_user', user);
            }

            onLogin(user);
        } catch (err: any) {
            setError(err.message || 'Erro ao fazer login. Tente novamente.');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-slate-900 to-slate-950 flex items-center justify-center p-6">
            <div className="w-full max-w-md">
                {/* Logo e Título */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-600 rounded-3xl mb-6 shadow-2xl shadow-emerald-600/30">
                        <Wrench size={40} className="text-white" />
                    </div>
                    <h1 className="text-4xl font-black text-white uppercase italic tracking-tighter mb-2">
                        Portal Técnico
                    </h1>
                    <p className="text-emerald-400 text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                        <Smartphone size={16} />
                        Acesso Mobile Field Service
                    </p>
                </div>

                {/* Card de Login */}
                <div className="bg-white/10 backdrop-blur-xl rounded-[3rem] p-10 border border-white/20 shadow-2xl">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest px-2">
                                E-mail Técnico
                            </label>
                            <Input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="tecnico@empresa.com"
                                className="bg-white/5 border-white/20 text-white placeholder:text-white/40 rounded-2xl py-4"
                                icon={<Mail size={18} className="text-emerald-400" />}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest px-2">
                                Senha de Acesso
                            </label>
                            <div className="relative">
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="bg-white/5 border-white/20 text-white placeholder:text-white/40 rounded-2xl py-4 pr-12"
                                    icon={<Lock size={18} className="text-emerald-400" />}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-emerald-400 transition-colors"
                                >
                                    {showPassword ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88L14.12 14.12" /><path d="M2 2l20 20" /><path d="M10.37 4.37a9 9 0 0 1 8.94 4.14" /><path d="M22 12c-1.33 2.667-3.533 4.667-6.6 6" /><path d="M15 15a3 3 0 0 1-4.24-4.24" /><path d="M11.63 19.63A9 9 0 0 1 2 12c1.33-2.667 3.533-4.667 6.6-6" /></svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0z" /><circle cx="12" cy="12" r="3" /></svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 px-2">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={rememberMe}
                                        onChange={(e) => setRememberMe(e.target.checked)}
                                    />
                                    <div className={`w-5 h-5 rounded-md border transition-all ${rememberMe ? 'bg-emerald-600 border-emerald-600 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-white/5 border-white/20'}`}>
                                        {rememberMe && (
                                            <svg className="w-full h-full text-white p-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </div>
                                </div>
                                <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest group-hover:text-emerald-400 transition-colors">Manter conectado</span>
                            </label>
                        </div>

                        {error && (
                            <div className="bg-red-500/20 border border-red-500/50 rounded-2xl p-4">
                                <p className="text-red-200 text-xs font-bold text-center">{error}</p>
                            </div>
                        )}

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl py-5 font-black uppercase tracking-widest shadow-xl shadow-emerald-600/30"
                        >
                            {loading ? 'Autenticando...' : 'Acessar Painel Técnico'}
                        </Button>
                    </form>

                    <div className="mt-6 pt-6 border-t border-white/10">
                        <p className="text-white/60 text-xs text-center font-bold">
                            Portal Administrativo?{' '}
                            <a href="/admin" className="text-emerald-400 hover:text-emerald-300 underline">
                                Clique aqui
                            </a>
                        </p>
                    </div>
                </div>

                <p className="text-white/40 text-[10px] text-center mt-6 font-bold uppercase tracking-widest">
                    Nexus Pro © 2026 - Field Service Platform
                </p>
            </div>
        </div>
    );
};
