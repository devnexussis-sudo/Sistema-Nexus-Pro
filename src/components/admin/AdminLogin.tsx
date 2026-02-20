import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Mail, Lock, Shield } from 'lucide-react';
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

    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [resetEmailSent, setResetEmailSent] = useState(false);

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

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) {
            setError('Por favor, digite seu e-mail para recuperar a senha.');
            return;
        }

        setError('');
        setLoading(true);

        try {
            await DataService.resetPasswordForEmail(email);
            setResetEmailSent(true);
            setError('');
        } catch (err: any) {
            setError(err.message || 'Erro ao enviar e-mail de recuperação.');
        } finally {
            setLoading(false);
        }
    };

    if (resetEmailSent) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-8">
                <div className="w-full max-w-sm bg-white p-10 rounded-3xl shadow-2xl border border-slate-50 text-center space-y-6">
                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-500">
                        <Mail size={40} />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">E-mail Enviado!</h2>
                        <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest leading-relaxed">
                            Enviamos instruções de recuperação para <br />
                            <span className="text-primary-600 lowercase">{email}</span>
                        </p>
                    </div>
                    <Button
                        onClick={() => { setResetEmailSent(false); setShowForgotPassword(false); }}
                        className="w-full bg-[#1c2d4f] text-white rounded-2xl py-4 font-black uppercase tracking-widest text-[10px]"
                    >
                        Voltar para o Login
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col md:flex-row bg-[#f8fafc]">
            {/* LADO ESQUERDO: MARKETING & IMAGEM */}
            <div className="hidden md:flex md:w-[60%] relative overflow-hidden bg-slate-900 border-r border-slate-100">
                <img
                    src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=2070"
                    alt="Nexus Office"
                    className="absolute inset-0 w-full h-full object-cover opacity-60"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent" />

                <div className="absolute inset-0 flex flex-col justify-center px-20 z-10">
                    <div className="max-w-xl -mt-20">
                        <h2 className="text-6xl font-black text-white italic uppercase tracking-tighter leading-none mb-6 drop-shadow-2xl">
                            Bem vindo ao <br />
                            <span className="text-primary-400">Nexus Line</span>
                        </h2>
                        <p className="text-white/80 text-xl font-medium leading-relaxed drop-shadow-lg">
                            Uma plataforma com tecnologia de ponta para gerenciar suas equipes de campo,
                            otimizar processos e obter máxima produtividade em tempo real.
                        </p>
                    </div>
                </div>

                <div className="absolute top-10 left-10">
                    <div className="p-4 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl">
                        <Shield className="text-primary-400" size={32} />
                    </div>
                </div>
            </div>

            {/* LADO DIREITO: FORMULÁRIO DE LOGIN */}
            <div className="w-full md:w-[40%] flex flex-col items-center justify-center p-8 bg-white relative">
                {/* Logo Flutuante no Topo (Mobile) */}
                <div className="md:hidden mb-10">
                    <img src="/nexus-logo.png" alt="Nexus Logo" className="h-12 w-auto" />
                </div>

                <div className="w-full max-w-sm space-y-10">
                    {/* Logo Destacada (Desktop) */}
                    <div className="hidden md:flex flex-col items-center mb-4">
                        <div className="p-6 bg-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-slate-50 mb-8 transition-transform hover:scale-105 duration-500">
                            <img src="/nexus-logo.png" alt="Nexus Logo" className="h-20 w-auto" />
                        </div>
                        <div className="text-center">
                            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">
                                {showForgotPassword ? 'Recuperar Senha' : 'Entre com a sua conta'}
                            </h1>
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2">Field Service Management</p>
                        </div>
                    </div>

                    {/* Título Mobile */}
                    <div className="md:hidden text-center mb-8">
                        <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">
                            {showForgotPassword ? 'Recuperação' : 'Login'}
                        </h1>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Painel Admin Nexus</p>
                    </div>

                    {/* Card de Login */}
                    <div className="space-y-6">
                        {!showForgotPassword ? (
                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center px-1">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                            E-mail Administrativo *
                                        </label>
                                    </div>
                                    <Input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="Digite seu e-mail"
                                        className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-300 rounded-2xl py-4.5 focus:ring-4 focus:ring-primary-100 transition-all font-bold uppercase text-[11px]"
                                        icon={<Mail size={18} className="text-slate-300" />}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between items-center px-1">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                            Senha de Acesso *
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => setShowForgotPassword(true)}
                                            className="text-[9px] font-black text-primary-600 uppercase tracking-widest hover:underline"
                                        >
                                            Esqueci a senha
                                        </button>
                                    </div>
                                    <Input
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Digite sua senha"
                                        className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-300 rounded-2xl py-4.5 focus:ring-4 focus:ring-primary-100 transition-all font-bold uppercase text-[11px]"
                                        icon={<Lock size={18} className="text-slate-300" />}
                                    />
                                </div>

                                <div className="flex items-center gap-3 px-1">
                                    <input
                                        type="checkbox"
                                        id="keep-logged"
                                        checked={keepLoggedIn}
                                        onChange={(e) => setKeepLoggedIn(e.target.checked)}
                                        className="w-5 h-5 rounded-lg border-slate-300 text-primary-600 focus:ring-primary-100 cursor-pointer transition-all"
                                    />
                                    <label htmlFor="keep-logged" className="text-slate-500 text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none">
                                        Manter conectado nesta sessão
                                    </label>
                                </div>

                                {error && (
                                    <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <p className="text-rose-600 text-[10px] font-black text-center uppercase tracking-tight italic leading-tight">{error}</p>
                                    </div>
                                )}

                                <Button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-2xl py-5 font-black uppercase tracking-[0.25em] shadow-2xl shadow-primary-900/20 border-none transition-all active:scale-[0.97] text-[11px]"
                                >
                                    {loading ? 'Validando Acesso...' : 'Continuar'}
                                </Button>
                            </form>
                        ) : (
                            <form onSubmit={handleForgotPassword} className="space-y-5">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center px-1">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                            E-mail Administrativo *
                                        </label>
                                    </div>
                                    <Input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="Digite seu e-mail"
                                        className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-300 rounded-2xl py-4.5 focus:ring-4 focus:ring-primary-100 transition-all font-bold uppercase text-[11px]"
                                        icon={<Mail size={18} className="text-slate-300" />}
                                    />
                                </div>

                                {error && (
                                    <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <p className="text-rose-600 text-[10px] font-black text-center uppercase tracking-tight italic leading-tight">{error}</p>
                                    </div>
                                )}

                                <div className="space-y-3">
                                    <Button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-2xl py-5 font-black uppercase tracking-[0.25em] shadow-2xl shadow-primary-900/20 border-none transition-all active:scale-[0.97] text-[11px]"
                                    >
                                        {loading ? 'Enviando...' : 'Enviar Recuperação'}
                                    </Button>
                                    <button
                                        type="button"
                                        onClick={() => { setShowForgotPassword(false); setError(''); }}
                                        className="w-full text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-slate-600 transition-all"
                                    >
                                        Voltar para o Login
                                    </button>
                                </div>
                            </form>
                        )}

                        <div className="relative py-4 flex items-center justify-center">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-slate-100"></span>
                            </div>
                            <span className="relative px-6 text-[10px] font-black text-slate-300 uppercase bg-white italic tracking-widest">ou login social</span>
                        </div>

                        <button
                            className="w-full flex items-center justify-center gap-3 py-4.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50 transition-all active:scale-[0.97] shadow-sm"
                        >
                            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                            Entrar com Google Workspace
                        </button>
                    </div>

                    {/* Footer Links */}
                    <div className="flex flex-col items-center gap-6 pt-10">
                        <div className="text-center space-y-2">
                            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                                É um colaborador de campo?
                            </p>
                            <a href="/tech" className="inline-flex items-center gap-2 px-6 py-2 bg-primary-50 text-primary-600 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 hover:text-white transition-all">
                                Acessar App do Técnico
                            </a>
                        </div>

                        <div className="flex flex-col items-center gap-3">
                            <button
                                onClick={onToggleMaster}
                                className="text-slate-300 hover:text-primary-400 text-[9px] font-black uppercase tracking-[0.25em] transition-all"
                            >
                                Multi-Tenant Master Login
                            </button>
                            <div className="flex items-center gap-6 text-slate-300 text-[9px] font-bold uppercase tracking-widest italic">
                                <span>Nexus v2.0</span>
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-100"></span>
                                <span>© 2026</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
