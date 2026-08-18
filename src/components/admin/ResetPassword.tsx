import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Lock, ShieldCheck, AlertCircle, Eye, EyeOff, Check, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

export const ResetPassword: React.FC = () => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [isChecking, setIsChecking] = useState(true);
    const [isFromMobile, setIsFromMobile] = useState(false);
    const navigate = useNavigate();

    // ─── Regras de Validação de Senha ──────────────────────────────
    const hasMinLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    // ─── 1. Captura e Injeção do Token ─────────────────────────────
    useEffect(() => {
        let mounted = true;

        // Listener reativo de evento de Auth para capturar PASSWORD_RECOVERY instantaneamente
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
                logger.info(`[ResetPassword] Evento de auth capturado: ${event}`);
                if (mounted) setError('');
            }
        });

        const handleAuth = async () => {
            try {
                const url = window.location.href;
                const search = window.location.search;

                const isMobileSource = url.includes('source=mobile');
                if (isMobileSource && mounted) {
                    setIsFromMobile(true);
                }

                const access = url.match(/access_token=([^&#]*)/)?.[1];
                const refresh = url.match(/refresh_token=([^&#]*)/)?.[1];
                const code = url.match(/[?&#]code=([^&#]*)/)?.[1] || new URLSearchParams(search).get('code');
                const tokenHash = url.match(/[?&#]token_hash=([^&#]*)/)?.[1] || new URLSearchParams(search).get('token_hash');

                let authSession: any = null;

                // 1. Verifica se JÁ existe uma sessão ativa (ex: Supabase SDK recuperou do cookie/storage/hash)
                const { data: { session: activeSession } } = await supabase.auth.getSession();
                if (activeSession?.user) {
                    logger.info('[ResetPassword] Sessão válida encontrada no cliente Supabase.');
                    authSession = activeSession;
                }

                // 2. Se temos access_token (Implicit Flow)
                if (!authSession && access) {
                    logger.info('[ResetPassword] Injetando tokens de recuperação (Implicit)...');
                    const { error: sessionUpdateError, data } = await supabase.auth.setSession({
                        access_token: access,
                        refresh_token: refresh || '',
                    });

                    if (!sessionUpdateError && data.session) {
                        authSession = data.session;
                    }
                }

                // 3. Se temos um código / token_hash (PKCE ou OTP Flow)
                const recoveryToken = tokenHash || code;
                if (!authSession && recoveryToken) {
                    logger.info('[ResetPassword] Validando código de recuperação com o Supabase...');

                    // 3a. Tenta primeiro verifyOtp (funciona em QUALQUER navegador/dispositivo sem depender do PKCE verifier no localStorage)
                    const { error: otpError, data: otpData } = await supabase.auth.verifyOtp({
                        token_hash: recoveryToken,
                        type: 'recovery',
                    });

                    if (!otpError && otpData.session) {
                        logger.info('[ResetPassword] Sessão iniciada com sucesso via verifyOtp!');
                        authSession = otpData.session;
                    } else {
                        // 3b. Fallback: troca de código PKCE tradicional
                        logger.info('[ResetPassword] Tentando troca de código PKCE...');
                        const { error: exchangeError, data: exchangeData } = await supabase.auth.exchangeCodeForSession(recoveryToken);

                        if (!exchangeError && exchangeData.session) {
                            logger.info('[ResetPassword] Sessão obtida via exchangeCodeForSession!');
                            authSession = exchangeData.session;
                        } else {
                            console.warn('[ResetPassword] Tentativas de validação de token retornaram:', { otpError, exchangeError });
                        }
                    }
                }

                // 4. Verificação final de garantia (Re-check)
                if (!authSession) {
                    const { data: { session: finalSession } } = await supabase.auth.getSession();
                    authSession = finalSession;
                }

                if (!authSession) {
                    const { data: { user: currentUser } } = await supabase.auth.getUser();
                    if (currentUser) authSession = { user: currentUser };
                }

                // Limpa parâmetros temporários da URL sem perder a rota
                if (access || recoveryToken) {
                    const params = isMobileSource ? '?source=mobile' : '';
                    const cleanUrl = window.location.origin + window.location.pathname + params + '#/reset-password';
                    window.history.replaceState(null, '', cleanUrl);
                }

                // Se temos sessão, libera a UI para definir nova senha
                if (authSession && mounted) {
                    setError('');
                } else if (mounted) {
                    setError('Link de recuperação inválido ou expirado. Por favor, solicite um novo link.');
                }
            } catch (err: any) {
                console.error('[ResetPassword] Erro de inicialização:', err);
                if (mounted) setError(`Erro ao validar credenciais: ${err.message || 'Falha na verificação'}`);
            } finally {
                if (mounted) {
                    setTimeout(() => {
                        if (mounted) setIsChecking(false);
                    }, 400);
                }
            }
        };

        handleAuth();
        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    // ─── 2. Execução do Comando (Nova Senha) ─────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading) return;

        const trimmedPassword = password.trim();
        const trimmedConfirm = confirmPassword.trim();

        // 🛡️ Validação Completa (8+ char, Maiúscula, Minúscula, Número e Caractere Especial)
        if (!hasMinLength || !hasUpper || !hasLower || !hasNumber || !hasSpecial) {
            return setError('A senha deve atender a todos os requisitos solicitados (mínimo 8 caracteres, letras maiúsculas e minúsculas, número e caractere especial).');
        }

        if (trimmedPassword !== trimmedConfirm) {
            return setError('As senhas não coincidem. Verifique e tente novamente.');
        }

        setError('');
        setLoading(true);

        try {
            logger.info('[ResetPassword] Verificando identidade do usuário...');
            const { data: { user } } = await supabase.auth.getUser();
            logger.info(`[ResetPassword] Atualizando senha para: ${user?.email || 'Usuário desconhecido'}`);

            // ✅ Comando direto sem interferência do AuthContext global
            const { error: updateError } = await supabase.auth.updateUser({
                password: trimmedPassword
            });

            if (updateError) throw updateError;

            // Sucesso!
            setSuccess(true);
            logger.info('[ResetPassword] Comando executado com sucesso.');

            // Limpa qualquer sessão residual e força logout
            await supabase.auth.signOut().catch(() => { });

            // Redireciona para o login após mostrar a mensagem de sucesso (Apenas se NÃO for mobile)
            if (!isFromMobile) {
                setTimeout(() => navigate('/login'), 3500);
            }

        } catch (err: any) {
            console.error('[ResetPassword] Erro no comando:', err);
            setError(err.message || 'Não foi possível atualizar a senha. Tente novamente.');
            setLoading(false);
        }
    };

    if (isChecking) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc]">
                <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-[#1c2d4f] animate-spin mb-4"></div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-widest animate-pulse">Validando credenciais...</p>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-8">
                <div className="w-full max-w-sm bg-white p-10 rounded-3xl shadow-2xl border border-slate-200 text-center space-y-6 animate-in zoom-in duration-300">
                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-500">
                        <ShieldCheck size={40} />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Senha Alterada!</h2>
                        {isFromMobile ? (
                            <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest leading-relaxed">
                                Sua nova senha foi salva! <br />
                                <span className="text-[#1c2d4f] block mt-2 text-xs">Feche esta aba e volte ao aplicativo para entrar.</span>
                            </p>
                        ) : (
                            <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest leading-relaxed">
                                Sua nova senha foi salva com sucesso. <br /> Redirecionando para o login...
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-8">
            <div className="w-full max-w-sm flex flex-col items-center justify-center relative space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="flex flex-col items-center mb-2">
                    <div className="p-6 bg-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-slate-200 mb-6 transition-transform hover:scale-105 duration-500">
                        <img src="/nexus-logo.png" alt="DUNO Logo" className="h-16 w-auto max-w-[180px] object-contain" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">
                            Nova Senha
                        </h1>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Crie sua nova credencial de acesso</p>
                    </div>
                </div>

                <div className="w-full space-y-5">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Nova Senha */}
                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center px-1">
                                <label className="text-[10px] font-bold text-slate-500 ml-1">
                                    Nova Senha *
                                </label>
                            </div>
                            <Input
                                type={showPassword ? "text" : "password"}
                                required
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    if (error) setError('');
                                }}
                                placeholder="Digite a nova senha"
                                className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-300 rounded-2xl py-4 focus:ring-4 focus:ring-primary-100 transition-all font-medium text-sm shadow-sm"
                                icon={<Lock size={18} className="text-slate-300" />}
                                rightElement={
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                                        tabIndex={-1}
                                        title={showPassword ? "Ocultar Senha" : "Exibir Senha"}
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                }
                            />
                        </div>

                        {/* Repetir Senha */}
                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center px-1">
                                <label className="text-[10px] font-bold text-slate-500 ml-1">
                                    Repetir Senha *
                                </label>
                            </div>
                            <Input
                                type={showConfirmPassword ? "text" : "password"}
                                required
                                value={confirmPassword}
                                onChange={(e) => {
                                    setConfirmPassword(e.target.value);
                                    if (error) setError('');
                                }}
                                placeholder="Repita a nova senha"
                                className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-300 rounded-2xl py-4 focus:ring-4 focus:ring-primary-100 transition-all font-medium text-sm shadow-sm"
                                icon={<ShieldCheck size={18} className="text-slate-300" />}
                                rightElement={
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                                        tabIndex={-1}
                                        title={showConfirmPassword ? "Ocultar Senha" : "Exibir Senha"}
                                    >
                                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                }
                            />
                        </div>

                        {/* Visual Helper de Requisitos de Senha */}
                        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-1.5 text-[11px] shadow-xs">
                            <p className="font-bold text-slate-500 uppercase tracking-widest text-[9px] mb-1">Requisitos de Segurança da Senha:</p>
                            <div className="grid grid-cols-2 gap-1.5 font-medium">
                                <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                                    {hasMinLength ? <Check size={13} className="text-emerald-500 shrink-0" /> : <X size={13} className="text-slate-300 shrink-0" />}
                                    <span>Mínimo 8 caracteres</span>
                                </div>
                                <div className={`flex items-center gap-1.5 ${hasUpper ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                                    {hasUpper ? <Check size={13} className="text-emerald-500 shrink-0" /> : <X size={13} className="text-slate-300 shrink-0" />}
                                    <span>Maiúscula (A-Z)</span>
                                </div>
                                <div className={`flex items-center gap-1.5 ${hasLower ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                                    {hasLower ? <Check size={13} className="text-emerald-500 shrink-0" /> : <X size={13} className="text-slate-300 shrink-0" />}
                                    <span>Minúscula (a-z)</span>
                                </div>
                                <div className={`flex items-center gap-1.5 ${hasNumber ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                                    {hasNumber ? <Check size={13} className="text-emerald-500 shrink-0" /> : <X size={13} className="text-slate-300 shrink-0" />}
                                    <span>Número (0-9)</span>
                                </div>
                                <div className={`flex items-center gap-1.5 ${hasSpecial ? 'text-emerald-600 font-bold' : 'text-slate-400'} col-span-2`}>
                                    {hasSpecial ? <Check size={13} className="text-emerald-500 shrink-0" /> : <X size={13} className="text-slate-300 shrink-0" />}
                                    <span>Caractere especial (!@#$%^&*...)</span>
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="bg-rose-50 border border-rose-100 rounded-2xl p-3.5 animate-in fade-in slide-in-from-top-2 duration-300">
                                <p className="text-rose-600 text-[11px] font-medium text-center italic leading-tight">{error}</p>
                            </div>
                        )}

                        <Button
                            type="submit"
                            disabled={loading}
                            className={`w-full text-white rounded-2xl py-4.5 font-bold text-sm shadow-xl border-none transition-all active:scale-[0.97] ${loading ? 'bg-slate-400 cursor-wait' : 'bg-[#1c2d4f] hover:bg-[#253a66] shadow-primary-900/20'
                                }`}
                        >
                            {loading ? 'Validando...' : 'Atualizar Credencial'}
                        </Button>
                    </form>
                </div>

                <div className="text-center">
                    <button
                        type="button"
                        onClick={() => navigate('/login')}
                        className="text-slate-500 text-[10px] font-bold hover:text-slate-700 hover:underline transition-all"
                    >
                        Voltar para o Login
                    </button>
                </div>
            </div>
        </div>
    );
};

