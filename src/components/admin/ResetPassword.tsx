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

        // 🛡️ TRAVA DE SEGURANÇA: Se em 4 segundos nada acontecer, libera a tela
        const safetyTimer = setTimeout(() => {
            if (mounted && isChecking) {
                console.warn('[ResetPassword] ⏱️ Timeout de segurança atingido. Liberando tela.');
                setIsChecking(false);
            }
        }, 4000);

        const validateSession = async () => {
            console.log('[ResetPassword] 🔍 Iniciando validação de link...');
            try {
                const url = window.location.href;
                console.log('[ResetPassword] 🌐 URL Detectada:', url);

                // Extração via Regex (robusta para HashRouter)
                const accessToken = url.match(/access_token=([^&]*)/)?.[1];
                const refreshToken = url.match(/refresh_token=([^&]*)/)?.[1];

                if (accessToken) {
                    console.log('[ResetPassword] 🔑 Token encontrado na URL. Injetando sessão...');
                    const { error: setSessionError } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken || '',
                    });

                    if (setSessionError) {
                        console.error('[ResetPassword] ❌ Erro ao setar sessão:', setSessionError);
                        if (mounted) setError('O link de recuperação parece inválido ou expirou.');
                    } else {
                        console.log('[ResetPassword] ✅ Sessão injetada com sucesso.');
                        // Pequeno delay para o state do Supabase atualizar globalmente
                        await new Promise(r => setTimeout(r, 500));
                    }
                }

                const { data: { session } } = await supabase.auth.getSession();
                console.log('[ResetPassword] 👤 Sessão atual:', session ? 'Ativa' : 'Ausente');

                if (!session && mounted) {
                    setError('Sessão de recuperação não detectada. Tente clicar novamente no link do e-mail.');
                }
            } catch (err) {
                console.error('[ResetPassword] 💥 Erro fatal na validação:', err);
                if (mounted) setError('Erro ao processar o link de recuperação.');
            } finally {
                if (mounted) {
                    setIsChecking(false);
                    clearTimeout(safetyTimer);
                }
            }
        };

        validateSession();
        return () => {
            mounted = false;
            clearTimeout(safetyTimer);
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading) return;

        setError('');
        if (password.length < 6) {
            setError('A senha deve ter pelo menos 6 caracteres.');
            return;
        }
        if (password !== confirmPassword) {
            setError('As senhas não coincidem.');
            return;
        }

        setLoading(true);
        console.log('[ResetPassword] 🚀 Tentando atualizar senha...');

        // Proteção contra travamento no botão (15s)
        const fallbackTimer = setTimeout(() => {
            if (loading) {
                setLoading(false);
                setError('O servidor não respondeu a tempo. Verifique sua internet.');
                console.warn('[ResetPassword] ⏱️ Timeout no envio da senha.');
            }
        }, 15000);

        try {
            // Verifica sessão um milissegundo antes para garantir
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                throw new Error('Sessão ausente. Volte ao e-mail e clique no link novamente.');
            }

            const { error: updateError } = await supabase.auth.updateUser({
                password: password
            });

            if (updateError) throw updateError;

            console.log('[ResetPassword] ✨ Senha atualizada com sucesso!');
            clearTimeout(fallbackTimer);
            setSuccess(true);

            // Logout imediato e limpeza local para segurança
            await supabase.auth.signOut().catch(() => { });

            setTimeout(() => {
                if (window.location.hash.includes('reset-password')) {
                    navigate('/login');
                }
            }, 3000);

        } catch (err: any) {
            console.error('[ResetPassword] ❌ Erro ao salvar:', err);
            setError(err.message || 'Falha ao atualizar senha. Link pode estar expirado.');
            setLoading(false);
            clearTimeout(fallbackTimer);
        }
    };

    if (isChecking) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc]">
                <div className="w-10 h-10 rounded-full border-4 border-slate-100 border-t-primary-600 animate-spin mb-4"></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Validando Link...</p>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-8">
                <div className="w-full max-w-sm bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-50 text-center space-y-6">
                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-500 animate-bounce">
                        <ShieldCheck size={40} />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter italic">Sucesso!</h2>
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
            <div className="w-full max-w-sm space-y-8">
                <div className="text-center space-y-4">
                    <div className="inline-flex p-4 bg-white rounded-2xl shadow-xl border border-slate-50 mb-2">
                        <img src="/nexus-logo.png" alt="Nexus Logo" className="h-10 w-auto" />
                    </div>
                    <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter italic">Nova Senha</h1>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Crie sua nova credencial de acesso</p>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.06)] border border-slate-50">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-1 block">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Nova Senha</label>
                            <Input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="******"
                                className="bg-slate-50 border-slate-200 text-slate-900 rounded-2xl py-4 font-bold"
                                icon={<Lock size={18} className="text-slate-300" />}
                            />
                        </div>

                        <div className="space-y-1 block">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Confirmar Senha</label>
                            <Input
                                type="password"
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="******"
                                className="bg-slate-50 border-slate-200 text-slate-900 rounded-2xl py-4 font-bold"
                                icon={<ShieldCheck size={18} className="text-slate-300" />}
                            />
                        </div>

                        {error && (
                            <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex items-start gap-3 animate-in fade-in duration-300">
                                <AlertCircle className="text-rose-500 shrink-0" size={16} />
                                <p className="text-rose-600 text-[10px] font-black uppercase tracking-tight leading-tight">{error}</p>
                            </div>
                        )}

                        <Button
                            type="submit"
                            disabled={loading || !!error}
                            className={`w-full text-white rounded-2xl py-5 font-black uppercase tracking-[0.2em] shadow-xl transition-all active:scale-[0.97] text-[11px] ${loading ? 'bg-slate-400 cursor-wait' : 'bg-[#1c2d4f] hover:bg-[#253a66]'
                                }`}
                        >
                            {loading ? 'MODIFICANDO...' : 'ATUALIZAR SENHA'}
                        </Button>
                    </form>
                </div>

                <div className="text-center">
                    <button
                        onClick={() => navigate('/login')}
                        className="text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-slate-600 transition-all"
                    >
                        Voltar para o Login
                    </button>
                </div>
            </div>
        </div>
    );
};
