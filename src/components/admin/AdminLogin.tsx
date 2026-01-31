import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Mail, Lock, Hexagon, Shield } from 'lucide-react';
import { DataService } from '../../services/dataService';
import { User } from '../../types';

interface AdminLoginProps {
    onLogin: (user: User, keepLoggedIn: boolean) => void;
    onToggleMaster: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLogin, onToggleMaster }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [keepLoggedIn, setKeepLoggedIn] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

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

            if (user.role === 'TECHNICIAN') {
                setError('Este portal é exclusivo para administradores. Técnicos devem usar o portal /tech');
                setLoading(false);
                return;
            }

            onLogin(user, keepLoggedIn);
        } catch (err: any) {
            setError(err.message || 'Erro ao fazer login. Tente novamente.');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 flex items-center justify-center p-6">
            <div className="w-full max-w-md">
                {/* Logo e Título */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-600 rounded-3xl mb-6 shadow-2xl shadow-indigo-600/30">
                        <Hexagon size={40} className="text-white" fill="currentColor" fillOpacity={0.2} />
                    </div>
                    <h1 className="text-4xl font-black text-white uppercase italic tracking-tighter mb-2">
                        Nexus<span className="text-indigo-400">.Pro</span>
                    </h1>
                    <p className="text-indigo-400 text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                        <Shield size={16} />
                        Enterprise Management Portal
                    </p>
                </div>

                {/* Card de Login */}
                <div className="bg-white/10 backdrop-blur-xl rounded-[3rem] p-10 border border-white/20 shadow-2xl">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest px-2">
                                E-mail Administrativo
                            </label>
                            <Input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="admin@empresa.com"
                                className="bg-white/5 border-white/20 text-white placeholder:text-white/40 rounded-2xl py-4"
                                icon={<Mail size={18} className="text-indigo-400" />}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest px-2">
                                Senha de Acesso
                            </label>
                            <Input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="bg-white/5 border-white/20 text-white placeholder:text-white/40 rounded-2xl py-4"
                                icon={<Lock size={18} className="text-indigo-400" />}
                            />
                        </div>

                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="keep-logged"
                                checked={keepLoggedIn}
                                onChange={(e) => setKeepLoggedIn(e.target.checked)}
                                className="w-5 h-5 rounded bg-white/10 border-white/20"
                            />
                            <label htmlFor="keep-logged" className="text-white/80 text-sm font-bold cursor-pointer">
                                Manter conectado
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
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl py-5 font-black uppercase tracking-widest shadow-xl shadow-indigo-600/30"
                        >
                            {loading ? 'Autenticando...' : 'Acessar Painel Admin'}
                        </Button>
                    </form>

                    <div className="mt-6 pt-6 border-t border-white/10 space-y-3">
                        <p className="text-white/60 text-xs text-center font-bold">
                            Portal Técnico?{' '}
                            <a href="/tech" className="text-indigo-400 hover:text-indigo-300 underline">
                                Clique aqui
                            </a>
                        </p>
                        <button
                            onClick={onToggleMaster}
                            className="w-full text-white/40 hover:text-white/60 text-[10px] font-bold uppercase tracking-widest transition-colors"
                        >
                            Acesso Master Multi-Tenant
                        </button>
                    </div>
                </div>

                <p className="text-white/40 text-[10px] text-center mt-6 font-bold uppercase tracking-widest">
                    Nexus Pro © 2026 - Enterprise Service Management
                </p>
            </div>
        </div>
    );
};
