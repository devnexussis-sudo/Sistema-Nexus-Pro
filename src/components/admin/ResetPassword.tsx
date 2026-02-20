import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Lock, ShieldCheck, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export const ResetPassword: React.FC = () => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [isChecking, setIsChecking] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        let mounted = true;

        const validateSession = async () => {
            try {
                // 1. Tenta pegar sessão atual (caso o SDK já tenha lido)
                let { data: { session } } = await supabase.auth.getSession();

                // 2. Se não tem sessão, busca Manualmente na URL inteira (Solução definitiva para HashRouter)
                if (!session) {
                    const url = window.location.href;
                    // Regex para pegar os tokens independente de onde estejam na URL
                    const accessToken = url.match(/access_token=([^&]*)/)?.[1];
                    const refreshToken = url.match(/refresh_token=([^&]*)/)?.[1];

                    if (accessToken) {
                        const { data, error: setSessionError } = await supabase.auth.setSession({
                            access_token: accessToken,
                            refresh_token: refreshToken || '',
                        });
                        if (!setSessionError) session = data.session;
                    }
                }

                if (!session && mounted) {
                    // Se mesmo assim não achou, esperamos um pouco mais (Supabase as vezes demora)
                    await new Promise(r => setTimeout(r, 1000));
                    const { data: { session: finalSession } } = await supabase.auth.getSession();
                    if (!finalSession) {
                        setError('Sessão expirada ou link inválido. Por favor, tente gerar um novo e-mail.');
                    }
                }

                // Limpa a URL para o usuário não ver o token
                if (mounted) {
                    const cleanUrl = window.location.origin + window.location.pathname + '#/reset-password';
                    window.history.replaceState(null, '', cleanUrl);
                }

            } catch (err) {
                console.error('[ResetPassword] Erro:', err);
            } finally {
                if (mounted) setIsChecking(false);
            }
        };

        validateSession();

        // Safety net: libera a tela em no máximo 2.5 segundos de qualquer jeito
        const timer = setTimeout(() => {
            if (mounted && isChecking) setIsChecking(false);
        }, 2500);

        return () => {
            mounted = false;
            clearTimeout(timer);
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password.length < 6) {
            setError('A nova senha deve ter pelo menos 6 caracteres.');
            return;
        }

        if (password !== confirmPassword) {
            setError('As senhas não coincidem.');
            return;
        }

        setLoading(true);

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password: password
            });

            if (updateError) throw updateError;

            setSuccess(true);
            await supabase.auth.signOut();

            setTimeout(() => {
                navigate('/login');
            }, 3000);
        } catch (err: any) {
            setError(err.message || 'Erro ao atualizar senha.');
        } finally {
            setLoading(false);
        }
    };

    if (isChecking && !error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc]">
                <div className="w-10 h-10 rounded-full border-4 border-slate-100 border-t-primary-600 animate-spin mb-4"></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Autenticando acesso...</p>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-8">
                <div className="w-full max-w-sm bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-50 text-center space-y-6 animate-in zoom-in duration-500">
                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-500">
                        <ShieldCheck size={40} />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter italic">Pronto!</h2>
                        <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest leading-relaxed">
                            Senha alterada. Redirecionando...
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-8">
            <div className="w-full max-w-sm space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="text-center space-y-4">
                    <div className="inline-flex p-4 bg-white rounded-2xl shadow-xl border border-slate-50 mb-2">
                        <img src="/nexus-logo.png" alt="Nexus Logo" className="h-10 w-auto" />
                    </div>
                    <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter italic">Nova Senha</h1>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Crie sua nova credencial de acesso</p>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.06)] border border-slate-50">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Nova Senha</label>
                            <Input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="******"
                                className="bg-slate-50 border-slate-200 text-slate-900 rounded-2xl py-4 focus:ring-4 focus:ring-primary-100 transition-all font-bold placeholder:text-slate-300"
                                icon={<Lock size={18} className="text-slate-300" />}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Confirmar Senha</label>
                            <Input
                                type="password"
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="******"
                                className="bg-slate-50 border-slate-200 text-slate-900 rounded-2xl py-4 focus:ring-4 focus:ring-primary-100 transition-all font-bold placeholder:text-slate-300"
                                icon={<ShieldCheck size={18} className="text-slate-300" />}
                            />
                        </div>

                        {error && (
                            <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex items-start gap-3">
                                <AlertCircle className="text-rose-500 shrink-0" size={16} />
                                <p className="text-rose-600 text-[10px] font-black uppercase tracking-tight leading-tight">{error}</p>
                            </div>
                        )}

                        <Button
                            type="submit"
                            disabled={loading}
                            className={`w-full text-white rounded-2xl py-5 font-black uppercase tracking-[0.2em] shadow-xl transition-all active:scale-[0.97] text-[11px] ${loading ? 'bg-slate-400' : 'bg-[#1c2d4f] hover:bg-[#253a66] shadow-primary-900/10'
                                }`}
                        >
                            {loading ? 'Salvando...' : 'Atualizar Credencial'}
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
};
