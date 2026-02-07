import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Mail, Lock, Shield } from 'lucide-react';
import { DataService } from '../../services/dataService';
import { User } from '../../types';
import { NexusBranding } from '../ui/NexusBranding';

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
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
            <div className="w-full max-w-md">
                {/* Logo e Título */}
                <div className="text-center mb-10 flex flex-col items-center">
                    <NexusBranding variant="light" size="lg" className="mb-4" />
                    <p className="text-white/40 text-[9px] font-bold uppercase tracking-[0.3em] flex items-center justify-center gap-2 mt-4">
                        <Shield size={14} />
                        Enterprise Management Portal
                    </p>
                </div>

                {/* Card de Login */}
                <div className="bg-white/5 backdrop-blur-xl rounded-[2.5rem] p-10 border border-white/10 shadow-2xl">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-2">
                                E-mail Administrativo
                            </label>
                            <Input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="admin@empresa.com"
                                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 rounded-xl py-4"
                                icon={<Mail size={18} className="text-white/20" />}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-2">
                                Senha de Acesso
                            </label>
                            <Input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 rounded-xl py-4"
                                icon={<Lock size={18} className="text-white/20" />}
                            />
                        </div>

                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="keep-logged"
                                checked={keepLoggedIn}
                                onChange={(e) => setKeepLoggedIn(e.target.checked)}
                                className="w-4 h-4 rounded bg-white/5 border-white/10"
                            />
                            <label htmlFor="keep-logged" className="text-white/40 text-[11px] font-bold uppercase tracking-wider cursor-pointer">
                                Manter conectado
                            </label>
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                                <p className="text-red-400 text-xs font-bold text-center uppercase tracking-tight">{error}</p>
                            </div>
                        )}

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-xl py-5 font-bold uppercase tracking-widest shadow-xl shadow-[#1c2d4f]/20 border-none"
                        >
                            {loading ? 'Autenticando...' : 'Acessar Painel Admin'}
                        </Button>
                    </form>

                    <div className="mt-8 pt-6 border-t border-white/5 space-y-4">
                        <p className="text-white/30 text-[10px] text-center font-bold uppercase tracking-widest">
                            Portal Técnico?{' '}
                            <a href="/tech" className="text-white/60 hover:text-white underline">
                                Clique aqui
                            </a>
                        </p>
                        <button
                            onClick={onToggleMaster}
                            className="w-full text-white/20 hover:text-white/40 text-[9px] font-bold uppercase tracking-widest transition-colors"
                        >
                            Acesso Master Multi-Tenant
                        </button>
                    </div>
                </div>

                <p className="text-white/20 text-[9px] text-center mt-10 font-bold uppercase tracking-widest">
                    Nexus Line © 2026 - Enterprise Service Management
                </p>
            </div>
        </div>
    );
};
