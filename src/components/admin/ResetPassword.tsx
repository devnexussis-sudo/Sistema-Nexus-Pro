import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Lock, ShieldCheck, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

export const ResetPassword: React.FC = () => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [isChecking, setIsChecking] = useState(true);
    const navigate = useNavigate();

    // ─── 1. Captura e Injeção do Token ─────────────────────────────
    useEffect(() => {
        let mounted = true;

        const handleAuth = async () => {
            try {
                const url = window.location.href;
                const access = url.match(/access_token=([^&]*)/)?.[1];
                const refresh = url.match(/refresh_token=([^&]*)/)?.[1];

                if (access) {
                    logger.info('[ResetPassword] Injetando tokens de recuperação...');
                    await supabase.auth.setSession({
                        access_token: access,
                        refresh_token: refresh || '',
                    });

                    // Limpa URL para estética e segurança BigTech
                    const cleanUrl = window.location.origin + window.location.pathname + '#/reset-password';
                    window.history.replaceState(null, '', cleanUrl);
                }

                // Verifica se temos uma sessão ativa (seja automática ou injetada)
                const { data: { session } } = await supabase.auth.getSession();
                if (!session && mounted) {
                    setError('O link de recuperação parece inválido ou expirado. Por favor, solicite um novo e-mail.');
                }
            } catch (err: any) {
                console.error('[ResetPassword] Erro de inicialização:', err);
                if (mounted) setError('Erro ao validar credenciais de recuperação.');
            } finally {
                if (mounted) setIsChecking(false);
            }
        };

        handleAuth();
        return () => { mounted = false; };
    }, []);

    // ─── 2. Execução do Comando (Nova Senha) ─────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading) return;

        if (password.length < 6) return setError('A senha deve ter pelo menos 6 caracteres.');
        if (password !== confirmPassword) return setError('As senhas digitadas não coincidem.');

        setError('');
        setLoading(true);

        try {
            logger.info('[ResetPassword] Executando comando de atualização de senha...');

            // ✅ Comando direto sem interferência do AuthContext global (que está em modo ignorar)
            const { error: updateError } = await supabase.auth.updateUser({
                password: password
            });

            if (updateError) throw updateError;

            // Sucesso!
            setSuccess(true);
            logger.info('[ResetPassword] Comando executado com sucesso.');

            // Limpa qualquer sessão residual e força logout
            await supabase.auth.signOut().catch(() => { });

            // Redireciona para o login após mostrar a mensagem de sucesso
            setTimeout(() => navigate('/login'), 2500);

        } catch (err: any) {
            console.error('[ResetPassword] Erro no comando:', err);
            setError(err.message || 'Não foi possível atualizar a senha. Tente novamente.');
            setLoading(false);
        }
    };

    if (isChecking) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
                <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-primary-600 animate-spin mb-4"></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Autenticando acesso...</p>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
                <div className="w-full max-w-sm bg-white p-10 rounded-[3rem] shadow-2xl border border-white text-center space-y-6 animate-in zoom-in duration-300">
                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-500">
                        <ShieldCheck size={40} />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter italic">Senha Alterada!</h2>
                        <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest leading-relaxed">
                            Sua nova senha foi salva com sucesso. <br /> Redirecionando para o login...
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
            <div className="w-full max-w-sm space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="text-center space-y-4">
                    <div className="inline-flex p-4 bg-white rounded-3xl shadow-xl border border-white mb-2">
                        <img src="/nexus-logo.png" alt="Nexus Logo" className="h-10 w-auto" />
                    </div>
                    <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter italic">Nova Senha</h1>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Crie sua nova credencial de acesso</p>
                </div>

                <div className="bg-white p-8 rounded-[3rem] shadow-[0_30px_60px_rgba(0,0,0,0.08)] border border-white">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Nova Senha</label>
                            <Input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Mínimo 6 caracteres"
                                className="bg-slate-50 border-slate-200 text-slate-900 rounded-2xl py-4 font-bold focus:ring-4 focus:ring-primary-100 transition-all placeholder:text-slate-300"
                                icon={<Lock size={18} className="text-slate-300" />}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Repetir Senha</label>
                            <Input
                                type="password"
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Repita a senha"
                                className="bg-slate-50 border-slate-200 text-slate-900 rounded-2xl py-4 font-bold focus:ring-4 focus:ring-primary-100 transition-all placeholder:text-slate-300"
                                icon={<ShieldCheck size={18} className="text-slate-300" />}
                            />
                        </div>

                        {error && (
                            <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex items-start gap-3 animate-in shake duration-300">
                                <AlertCircle className="text-rose-500 shrink-0" size={16} />
                                <p className="text-rose-600 text-[10px] font-black uppercase tracking-tight leading-tight">{error}</p>
                            </div>
                        )}

                        <Button
                            type="submit"
                            disabled={loading || !!error}
                            className={`w-full text-white rounded-2xl py-6 font-black uppercase tracking-[0.25em] shadow-xl transition-all active:scale-[0.98] text-[11px] ${loading ? 'bg-slate-400 cursor-wait' : 'bg-[#1c2d4f] hover:bg-[#253a66] shadow-[#1c2d4f]/20'
                                }`}
                        >
                            {loading ? 'MODIFICANDO SENHA...' : 'ATUALIZAR CREDENCIAL'}
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
