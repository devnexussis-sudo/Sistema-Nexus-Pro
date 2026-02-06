
import React, { useState } from 'react';
import { useTech } from '../context/TechContext';
import { LogIn, ShieldCheck, Mail, Lock, Loader2 } from 'lucide-react';

export const TechLoginV2: React.FC = () => {
    const { login } = useTech();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            await login(email, password);
        } catch (err: any) {
            setError(err.message || "Erro ao fazer login.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-8 bg-[#05070a] relative overflow-hidden">
            {/* Background Glows */}
            <div className="absolute top-1/4 -left-20 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full"></div>
            <div className="absolute bottom-1/4 -right-20 w-64 h-64 bg-emerald-500/5 blur-[100px] rounded-full"></div>

            <div className="w-full max-w-sm space-y-10 animate-in relative z-10 transition-all">

                {/* Brand Header */}
                <div className="text-center space-y-4">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-[28px] glass-emerald mb-4">
                        <ShieldCheck size={40} className="text-emerald-500" />
                    </div>
                    <div className="space-y-1">
                        <h1 className="text-3xl font-black tracking-tighter text-white uppercase italic">
                            Nexus <span className="text-emerald-500">Tech 2.0</span>
                        </h1>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Technician Operations</p>
                    </div>
                </div>

                {/* Login Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <div className="relative group">
                            <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-500 transition-colors" />
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="E-mail Corporativo"
                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-all text-white placeholder:text-slate-600"
                            />
                        </div>
                        <div className="relative group">
                            <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-500 transition-colors" />
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Sua Senha"
                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-all text-white placeholder:text-slate-600"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold text-center animate-pulse">
                            {error}
                        </div>
                    )}

                    <button
                        disabled={isLoading}
                        type="submit"
                        className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white font-black uppercase text-sm tracking-widest py-4 rounded-2xl shadow-xl shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 group"
                    >
                        {isLoading ? (
                            <Loader2 className="animate-spin" size={18} />
                        ) : (
                            <>
                                Entrar no Sistema
                                <LogIn size={18} className="group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>

                    <div className="pt-4 text-center">
                        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                            Secure Authentication • Nexus Pro OS
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
};
