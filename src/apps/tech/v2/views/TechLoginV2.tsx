
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
        <div className="min-h-screen flex flex-col items-center justify-center px-8 bg-slate-50 relative overflow-hidden font-sans">
            {/* Background Accents */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-100/30 blur-[100px] rounded-full -mr-32 -mt-32"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary-50 blur-[100px] rounded-full -ml-32 -mb-32"></div>

            <div className="w-full max-w-sm space-y-12 animate-in relative z-10 transition-all">

                {/* Brand Header */}
                <div className="text-center space-y-4">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-lg bg-primary-500 text-white shadow-none mb-4">
                        <ShieldCheck size={40} />
                    </div>
                    <div className="space-y-1">
                        <h1 className="text-3xl font-black tracking-tighter text-primary-500 uppercase italic">
                            Nexus <span className="text-primary-400">Tech</span>
                        </h1>
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] italic">Operational Excellence</p>
                    </div>
                </div>

                {/* Login Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-3">
                        <div className="relative group">
                            <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-primary-500 transition-colors" />
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="E-mail Corporativo"
                                className="w-full bg-white border border-slate-200 rounded-lg py-4 pl-12 pr-4 text-sm font-bold focus:ring-4 focus:ring-primary-100 focus:border-primary-500 outline-none transition-all text-slate-900 placeholder:text-slate-300"
                            />
                        </div>
                        <div className="relative group">
                            <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-primary-500 transition-colors" />
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Sua Senha"
                                className="w-full bg-white border border-slate-200 rounded-lg py-4 pl-12 pr-4 text-sm font-bold focus:ring-4 focus:ring-primary-100 focus:border-primary-500 outline-none transition-all text-slate-900 placeholder:text-slate-300"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 rounded-lg bg-rose-50 border border-rose-100 text-rose-600 text-[10px] font-black uppercase tracking-widest text-center animate-in fade-in slide-in-from-top-2">
                            {error}
                        </div>
                    )}

                    <button
                        disabled={isLoading}
                        type="submit"
                        className="w-full h-16 bg-primary-500 hover:bg-primary-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black uppercase text-xs tracking-[0.1em] py-4 rounded-lg shadow-none active:scale-95 transition-all flex items-center justify-center gap-3 group"
                    >
                        {isLoading ? (
                            <Loader2 className="animate-spin" size={20} />
                        ) : (
                            <>
                                Acessar Sistema
                                <LogIn size={20} className="group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>

                    <div className="pt-6 text-center border-t border-slate-100">
                        <p className="text-[9px] text-slate-300 font-black uppercase tracking-[0.2em]">
                            Secure Cloud • Nexus Pro Ecosystem
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
};
