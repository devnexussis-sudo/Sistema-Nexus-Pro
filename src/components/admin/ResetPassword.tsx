import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Lock, ShieldCheck, AlertCircle, Eye, EyeOff, Check, X, Mail, RefreshCw, Smartphone, ArrowRight } from 'lucide-react';
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
    const [hasValidSession, setHasValidSession] = useState(false);

    // Estado para reenvio de novo link quando o atual estiver expirado
    const [resendEmail, setResendEmail] = useState('');
    const [resendLoading, setResendLoading] = useState(false);
    const [resendSuccess, setResendSuccess] = useState(false);
    const [resendError, setResendError] = useState('');

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
        let isExchanging = false;

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
                logger.info(`[ResetPassword] Evento de auth capturado: ${event}`);
                if (mounted) {
                    setError('');
                    setHasValidSession(true);
                    setIsChecking(false);
                }
            }
        });

        const handleAuth = async () => {
            try {
                const url = window.location.href;
                const search = window.location.search || '';
                const hash = window.location.hash || '';

                // Combina search e hash para extrair parâmetros de forma resiliente
                const hashQuery = hash.includes('?') ? hash.split('?')[1] : hash.replace(/^#\/?(reset-password)?\/?/, '').replace(/^#/, '');
                const rawParams = (search.replace(/^\?/, '') + '&' + hashQuery).replace(/^&+/, '');
                const params = new URLSearchParams(rawParams);

                const isMobileSource = url.includes('source=mobile') || params.get('source') === 'mobile';
                if (isMobileSource && mounted) {
                    setIsFromMobile(true);
                }

                // Detecta se a URL já traz indicação de erro de token do Supabase (GoTrue)
                const urlError = params.get('error') || url.match(/[?&#]error=([^&#]*)/)?.[1];
                const urlErrorCode = params.get('error_code') || url.match(/[?&#]error_code=([^&#]*)/)?.[1];
                const urlErrorDesc = params.get('error_description') || url.match(/[?&#]error_description=([^&#]*)/)?.[1];

                const emailHint = params.get('email') || '';
                if (emailHint && mounted) {
                    setResendEmail(decodeURIComponent(emailHint));
                }

                if (urlError || urlErrorCode) {
                    logger.warn('[ResetPassword] Erro detectado na URL de recuperação:', { urlError, urlErrorCode, urlErrorDesc });
                    if (mounted) {
                        setError('O link de recuperação expirou ou já foi utilizado. Digite seu e-mail para receber um novo link.');
                        setHasValidSession(false);
                        setIsChecking(false);
                    }
                    return;
                }

                const access = params.get('access_token') || url.match(/access_token=([^&#]*)/)?.[1];
                const refresh = params.get('refresh_token') || url.match(/refresh_token=([^&#]*)/)?.[1];
                const code = params.get('code') || url.match(/[?&#]code=([^&#]*)/)?.[1];
                const tokenHash = params.get('token_hash') || url.match(/[?&#]token_hash=([^&#]*)/)?.[1];

                let authSession: any = null;

                // 1. Verifica se o cliente já possui sessão ativa
                const { data: { session: existingSession } } = await supabase.auth.getSession();
                if (existingSession?.user) {
                    logger.info('[ResetPassword] Sessão válida encontrada no cliente Supabase.');
                    authSession = existingSession;
                }

                // 2. Se temos access_token (Implicit Flow) e a sessão ainda não está pronta
                if (!authSession && access) {
                    logger.info('[ResetPassword] Injetando tokens de recuperação (Implicit)...');
                    const cleanAccess = decodeURIComponent(access);
                    const cleanRefresh = refresh ? decodeURIComponent(refresh) : '';
                    const { error: sessionUpdateError, data } = await supabase.auth.setSession({
                        access_token: cleanAccess,
                        refresh_token: cleanRefresh,
                    });

                    if (!sessionUpdateError && data.session) {
                        authSession = data.session;
                    } else if (sessionUpdateError) {
                        console.warn('[ResetPassword] Erro ao injetar access_token:', sessionUpdateError.message);
                    }
                }

                // 3. Se temos token_hash OTP
                if (!authSession && tokenHash) {
                    logger.info('[ResetPassword] Validando token_hash OTP...');
                    const cleanHash = decodeURIComponent(tokenHash);
                    const { error: otpError, data: otpData } = await supabase.auth.verifyOtp({
                        token_hash: cleanHash,
                        type: 'recovery',
                    });
                    if (!otpError && otpData.session) {
                        logger.info('[ResetPassword] Sessão iniciada com sucesso via verifyOtp!');
                        authSession = otpData.session;
                    }
                }

                // 4. Se temos código PKCE e a sessão ainda não foi consumida
                if (!authSession && code && !isExchanging) {
                    isExchanging = true;
                    logger.info('[ResetPassword] Trocando código PKCE...');
                    const cleanCode = decodeURIComponent(code);
                    const { error: exchangeError, data: exchangeData } = await supabase.auth.exchangeCodeForSession(cleanCode);

                    if (!exchangeError && exchangeData.session) {
                        logger.info('[ResetPassword] Sessão obtida via exchangeCodeForSession!');
                        authSession = exchangeData.session;
                    } else {
                        // Fallback: se exchangeCodeForSession falhar por falta de code_verifier, tenta verifyOtp
                        const { error: otpFallbackError, data: otpFallbackData } = await supabase.auth.verifyOtp({
                            token_hash: cleanCode,
                            type: 'recovery',
                        });
                        if (!otpFallbackError && otpFallbackData.session) {
                            authSession = otpFallbackData.session;
                        } else {
                            console.warn('[ResetPassword] Tentativas de validação de código retornaram erro:', { exchangeError, otpFallbackError });
                        }
                    }
                }

                // 5. Verificação final com espera de até 1s para o SDK
                if (!authSession) {
                    for (let i = 0; i < 5; i++) {
                        const { data: { session: s } } = await supabase.auth.getSession();
                        if (s?.user) {
                            authSession = s;
                            break;
                        }
                        if (i < 4) await new Promise(r => setTimeout(r, 200));
                    }
                }

                if (!authSession) {
                    const { data: { user: currentUser } } = await supabase.auth.getUser();
                    if (currentUser) authSession = { user: currentUser };
                }

                if (authSession && mounted) {
                    setError('');
                    setHasValidSession(true);
                    const mobileParam = isMobileSource ? '?source=mobile' : '';
                    const cleanUrl = `${window.location.origin}/#/reset-password${mobileParam}`;
                    window.history.replaceState(null, '', cleanUrl);
                } else if (mounted) {
                    setHasValidSession(false);
                    setError('O link de recuperação expirou ou é inválido. Digite seu e-mail para receber um novo link.');
                }
            } catch (err: any) {
                console.error('[ResetPassword] Erro de inicialização:', err);
                if (mounted) {
                    setHasValidSession(false);
                    setError(`Erro ao validar credenciais: ${err.message || 'Falha na verificação'}`);
                }
            } finally {
                if (mounted) setIsChecking(false);
            }
        };

        handleAuth();
        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    // ─── 2. Reenvio de Novo Link de Recuperação ───────────────────────
    const handleResendLink = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanEmail = resendEmail.trim().toLowerCase();
        if (!cleanEmail) {
            setResendError('Por favor, informe seu e-mail.');
            return;
        }

        setResendLoading(true);
        setResendError('');
        try {
            const redirectUrl = `${window.location.origin}/reset-password${isFromMobile ? '?source=mobile' : ''}`;
            const { error: resetErr } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
                redirectTo: redirectUrl,
            });

            if (resetErr) throw resetErr;

            setResendSuccess(true);
            logger.info('[ResetPassword] Novo link de recuperação enviado com sucesso para:', cleanEmail);
        } catch (err: any) {
            console.error('[ResetPassword] Erro ao reenviar link:', err);
            setResendError(err.message || 'Não foi possível enviar o novo link. Verifique o e-mail digitado.');
        } finally {
            setResendLoading(false);
        }
    };

    // ─── 3. Execução do Comando (Nova Senha) ─────────────────────────
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
            logger.info('[ResetPassword] Verificando sessão ativa para atualização de senha...');
            
            // 🛡️ Garante que a sessão esteja presente no cliente Supabase
            const { data: { session: activeSession } } = await supabase.auth.getSession();
            
            if (!activeSession) {
                const { data: { user: currentUser } } = await supabase.auth.getUser();
                if (!currentUser) {
                    throw new Error('A sessão de recuperação expirou. Por favor, solicite um novo link abaixo.');
                }
            }

            logger.info('[ResetPassword] Executando updateUser com a nova senha...');
            const { error: updateError } = await supabase.auth.updateUser({
                password: trimmedPassword
            });

            if (updateError) {
                console.error('[ResetPassword] Erro ao atualizar senha no Supabase:', updateError);
                if (updateError.message?.toLowerCase().includes('session missing') || updateError.message?.toLowerCase().includes('auth session')) {
                    throw new Error('A sessão de recuperação expirou. Solicite um novo link de redefinição.');
                }
                throw updateError;
            }

            // Sucesso!
            setSuccess(true);
            logger.info('[ResetPassword] Senha alterada com sucesso.');

            // Limpa qualquer sessão residual e força logout para segurança
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

    // ── Tela de Validação Inicial ──
    if (isChecking) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc]">
                <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-[#1c2d4f] animate-spin mb-4"></div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-widest animate-pulse">Validando credenciais...</p>
            </div>
        );
    }

    // ── Tela de Sucesso ──
    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-6">
                <div className="w-full max-w-sm bg-white p-8 sm:p-10 rounded-3xl shadow-2xl border border-slate-200 text-center space-y-6 animate-in zoom-in duration-300">
                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-500 shadow-inner">
                        <ShieldCheck size={44} />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Senha Alterada!</h2>
                        {isFromMobile ? (
                            <div className="space-y-4">
                                <p className="text-slate-500 text-xs font-medium leading-relaxed">
                                    Sua nova credencial foi redefinida com sucesso.
                                </p>
                                <a
                                    href="nexusmobile://"
                                    className="inline-flex items-center justify-center gap-2 w-full py-4 px-6 bg-[#1c2d4f] hover:bg-[#253a66] text-white font-bold text-sm rounded-2xl shadow-xl transition-all active:scale-[0.98]"
                                >
                                    <Smartphone size={18} />
                                    <span>Abrir Aplicativo Duno</span>
                                </a>
                                <p className="text-slate-400 text-[10px]">
                                    Ou feche esta aba e entre no aplicativo com sua nova senha.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <p className="text-slate-500 text-xs font-medium leading-relaxed">
                                    Sua nova senha foi salva. Redirecionando para o login em instantes...
                                </p>
                                <Button
                                    onClick={() => navigate('/login')}
                                    className="w-full py-3.5 bg-[#1c2d4f] hover:bg-[#253a66] text-white font-bold text-xs rounded-2xl shadow-lg"
                                >
                                    Ir para o Login Agora
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── Tela de Link Expirado ou Inválido (Com Reenvio Direto) ──
    if (!hasValidSession) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-6">
                <div className="w-full max-w-sm flex flex-col items-center justify-center relative space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-500">
                    <div className="flex flex-col items-center">
                        <div className="p-5 bg-white rounded-3xl shadow-[0_15px_40px_rgba(0,0,0,0.08)] border border-slate-200 mb-4 transition-transform hover:scale-105 duration-300">
                            <img src="/nexus-logo.png" alt="DUNO Logo" className="h-12 w-auto max-w-[160px] object-contain" />
                        </div>
                    </div>

                    <div className="w-full bg-white p-7 sm:p-8 rounded-3xl shadow-xl border border-slate-200 space-y-5">
                        <div className="text-center space-y-2">
                            <div className="w-14 h-14 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-2 border border-amber-100">
                                <AlertCircle size={30} />
                            </div>
                            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                                Link Expirado ou Utilizado
                            </h2>
                            <p className="text-slate-500 text-[11px] leading-relaxed">
                                Por motivos de segurança, os links de recuperação são de uso único e expiram rapidamente. Solicite um novo link abaixo:
                            </p>
                        </div>

                        {resendSuccess ? (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center space-y-2 animate-in zoom-in duration-300">
                                <div className="w-9 h-9 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                                    <Check size={20} />
                                </div>
                                <h3 className="text-xs font-black text-emerald-800 uppercase">Novo Link Enviado!</h3>
                                <p className="text-emerald-700 text-[11px] leading-relaxed font-medium">
                                    Verifique sua caixa de entrada no e-mail <strong className="font-bold underline">{resendEmail}</strong> e clique no link mais recente.
                                </p>
                            </div>
                        ) : (
                            <form onSubmit={handleResendLink} className="space-y-3.5">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 ml-1">
                                        E-mail para Recuperação *
                                    </label>
                                    <Input
                                        type="email"
                                        required
                                        value={resendEmail}
                                        onChange={(e) => {
                                            setResendEmail(e.target.value);
                                            if (resendError) setResendError('');
                                        }}
                                        placeholder="seu.email@exemplo.com"
                                        className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-2xl py-3.5 focus:ring-4 focus:ring-primary-100 font-medium text-xs shadow-xs"
                                        icon={<Mail size={16} className="text-slate-400" />}
                                    />
                                </div>

                                {resendError && (
                                    <div className="bg-rose-50 border border-rose-100 rounded-2xl p-3 animate-in fade-in duration-200">
                                        <p className="text-rose-600 text-[11px] font-medium text-center leading-tight">{resendError}</p>
                                    </div>
                                )}

                                <Button
                                    type="submit"
                                    disabled={resendLoading}
                                    className={`w-full text-white rounded-2xl py-3.5 font-bold text-xs shadow-md border-none transition-all active:scale-[0.98] ${
                                        resendLoading ? 'bg-slate-400 cursor-wait' : 'bg-[#1c2d4f] hover:bg-[#253a66]'
                                    }`}
                                >
                                    {resendLoading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <RefreshCw size={14} className="animate-spin" />
                                            <span>Enviando novo link...</span>
                                        </span>
                                    ) : (
                                        <span className="flex items-center justify-center gap-2">
                                            <span>Enviar Novo Link de Recuperação</span>
                                            <ArrowRight size={14} />
                                        </span>
                                    )}
                                </Button>
                            </form>
                        )}

                        <div className="pt-2 text-center border-t border-slate-100">
                            {isFromMobile ? (
                                <a
                                    href="nexusmobile://"
                                    className="inline-flex items-center gap-1.5 text-slate-500 text-[11px] font-bold hover:text-slate-800 transition-colors"
                                >
                                    <Smartphone size={14} />
                                    <span>Voltar para o Aplicativo Duno</span>
                                </a>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => navigate('/login')}
                                    className="text-slate-500 text-[11px] font-bold hover:text-slate-800 hover:underline transition-all"
                                >
                                    Voltar para a Tela de Login
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── Tela Principal de Definição da Nova Senha ──
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-6">
            <div className="w-full max-w-sm flex flex-col items-center justify-center relative space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-500">
                <div className="flex flex-col items-center">
                    <div className="p-5 bg-white rounded-3xl shadow-[0_15px_40px_rgba(0,0,0,0.08)] border border-slate-200 mb-4 transition-transform hover:scale-105 duration-300">
                        <img src="/nexus-logo.png" alt="DUNO Logo" className="h-14 w-auto max-w-[170px] object-contain" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">
                            Nova Senha
                        </h1>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                            {isFromMobile ? 'Defina sua senha de acesso ao aplicativo' : 'Crie sua nova credencial de acesso'}
                        </p>
                    </div>
                </div>

                <div className="w-full bg-white p-7 sm:p-8 rounded-3xl shadow-xl border border-slate-200 space-y-5">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Nova Senha */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 ml-1">
                                Nova Senha *
                            </label>
                            <Input
                                type={showPassword ? "text" : "password"}
                                required
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    if (error) setError('');
                                }}
                                placeholder="Digite a nova senha"
                                className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-300 rounded-2xl py-3.5 focus:ring-4 focus:ring-primary-100 transition-all font-medium text-xs shadow-xs"
                                icon={<Lock size={16} className="text-slate-400" />}
                                rightElement={
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                                        tabIndex={-1}
                                        title={showPassword ? "Ocultar Senha" : "Exibir Senha"}
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                }
                            />
                        </div>

                        {/* Repetir Senha */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 ml-1">
                                Repetir Senha *
                            </label>
                            <Input
                                type={showConfirmPassword ? "text" : "password"}
                                required
                                value={confirmPassword}
                                onChange={(e) => {
                                    setConfirmPassword(e.target.value);
                                    if (error) setError('');
                                }}
                                placeholder="Repita a nova senha"
                                className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-300 rounded-2xl py-3.5 focus:ring-4 focus:ring-primary-100 transition-all font-medium text-xs shadow-xs"
                                icon={<ShieldCheck size={16} className="text-slate-400" />}
                                rightElement={
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                                        tabIndex={-1}
                                        title={showConfirmPassword ? "Ocultar Senha" : "Exibir Senha"}
                                    >
                                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                }
                            />
                        </div>

                        {/* Visual Helper de Requisitos de Senha */}
                        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 space-y-1.5 text-[10px] shadow-xs">
                            <p className="font-bold text-slate-500 uppercase tracking-widest text-[8px] mb-0.5">Requisitos de Segurança da Senha:</p>
                            <div className="grid grid-cols-2 gap-1 font-medium">
                                <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                                    {hasMinLength ? <Check size={12} className="text-emerald-500 shrink-0" /> : <X size={12} className="text-slate-300 shrink-0" />}
                                    <span>Mínimo 8 caracteres</span>
                                </div>
                                <div className={`flex items-center gap-1.5 ${hasUpper ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                                    {hasUpper ? <Check size={12} className="text-emerald-500 shrink-0" /> : <X size={12} className="text-slate-300 shrink-0" />}
                                    <span>Maiúscula (A-Z)</span>
                                </div>
                                <div className={`flex items-center gap-1.5 ${hasLower ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                                    {hasLower ? <Check size={12} className="text-emerald-500 shrink-0" /> : <X size={12} className="text-slate-300 shrink-0" />}
                                    <span>Minúscula (a-z)</span>
                                </div>
                                <div className={`flex items-center gap-1.5 ${hasNumber ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                                    {hasNumber ? <Check size={12} className="text-emerald-500 shrink-0" /> : <X size={12} className="text-slate-300 shrink-0" />}
                                    <span>Número (0-9)</span>
                                </div>
                                <div className={`flex items-center gap-1.5 ${hasSpecial ? 'text-emerald-600 font-bold' : 'text-slate-400'} col-span-2`}>
                                    {hasSpecial ? <Check size={12} className="text-emerald-500 shrink-0" /> : <X size={12} className="text-slate-300 shrink-0" />}
                                    <span>Caractere especial (!@#$%^&*...)</span>
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="bg-rose-50 border border-rose-100 rounded-2xl p-3 animate-in fade-in duration-200">
                                <p className="text-rose-600 text-[11px] font-medium text-center leading-tight">{error}</p>
                            </div>
                        )}

                        <Button
                            type="submit"
                            disabled={loading}
                            className={`w-full text-white rounded-2xl py-4 font-bold text-xs shadow-xl border-none transition-all active:scale-[0.98] ${
                                loading ? 'bg-slate-400 cursor-wait' : 'bg-[#1c2d4f] hover:bg-[#253a66] shadow-primary-900/20'
                            }`}
                        >
                            {loading ? 'Salvando nova senha...' : 'Atualizar Credencial'}
                        </Button>
                    </form>

                    <div className="pt-2 text-center border-t border-slate-100">
                        {isFromMobile ? (
                            <a
                                href="nexusmobile://"
                                className="inline-flex items-center gap-1.5 text-slate-500 text-[11px] font-bold hover:text-slate-800 transition-colors"
                            >
                                <Smartphone size={14} />
                                <span>Voltar para o Aplicativo Duno</span>
                            </a>
                        ) : (
                            <button
                                type="button"
                                onClick={() => navigate('/login')}
                                className="text-slate-500 text-[11px] font-bold hover:text-slate-800 hover:underline transition-all"
                            >
                                Voltar para o Login
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
