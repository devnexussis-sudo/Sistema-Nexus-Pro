import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Mail, Lock, Shield, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { DataService } from '../../services/dataService';
import { User } from '../../types';
import LoginBg from '../../../assets/Wallpaper-login-page.jpeg';
import NexusLogo from '../../../assets/images/nexus-logo.png';
import { PrivacyTermsContent } from './PrivacyTermsContent';

/**
 * 🎛️ CONFIGURAÇÃO DE MODELO DA PÁGINA DE LOGIN:
 * - true  => Modelo Moderno SaaS (Dark com vitrine no quadrante direito e logo DUNO)
 * - false => Modelo Clássico anterior
 *
 * 🔄 BRECHAS DE RETORNO / REVERSÃO:
 * 1. Basta mudar a constante USE_MODERN_LOGIN para false abaixo.
 * 2. Em tempo de execução, é possível alternar adicionando na URL:
 *    - #/login?view=classic (ou ?theme=classic)
 *    - #/login?view=modern (ou ?theme=modern)
 * 3. Existe também um botão discreto no rodapé da página para alternar instantaneamente.
 */
export const USE_MODERN_LOGIN = true;

interface AdminLoginProps {
    onLogin: (user: User, keepLoggedIn: boolean) => void;
    onToggleMaster: () => void;
}

interface ThemedLoginProps extends AdminLoginProps {
    onToggleTheme: () => void;
}

/* ==========================================================================================
   MODELO MODERNO (SAAS DARK COM VITRINE DIREITA E LOGO DUNO NO QUADRANTE ESQUERDO)
   ========================================================================================== */
const ModernAdminLogin: React.FC<ThemedLoginProps> = ({ onLogin, onToggleMaster, onToggleTheme }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [keepLoggedIn, setKeepLoggedIn] = useState<boolean>(() => {
        return localStorage.getItem('nexus_remember_me_preference') !== 'false';
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [suspendedBanner, setSuspendedBanner] = useState(false);
    const [expiredBanner, setExpiredBanner] = useState(false);
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [resetEmailSent, setResetEmailSent] = useState(false);
    const [showPrivacyTerms, setShowPrivacyTerms] = useState(false);

    // Easter egg de 5 cliques para tela Master
    const [logoClicks, setLogoClicks] = useState(0);

    useEffect(() => {
        let timeout: NodeJS.Timeout;
        if (logoClicks > 0 && logoClicks < 5) {
            timeout = setTimeout(() => setLogoClicks(0), 1200);
        }
        return () => clearTimeout(timeout);
    }, [logoClicks]);

    const handleLogoClick = () => {
        const newCount = logoClicks + 1;
        setLogoClicks(newCount);
        if (newCount >= 5) {
            if (onToggleMaster) {
                onToggleMaster();
            } else {
                window.location.hash = '#nexus-master';
            }
            setLogoClicks(0);
        }
    };

    // Detecta se o usuário foi redirecionado por suspensão de empresa ou sessão expirada
    useEffect(() => {
        const hash = window.location.hash || '';
        if (hash.includes('reason=suspended')) {
            setSuspendedBanner(true);
            window.history.replaceState(null, '', window.location.pathname);
        } else if (hash.includes('reason=expired')) {
            setExpiredBanner(true);
            window.history.replaceState(null, '', window.location.pathname);
        }
    }, []);

    const handleKeepLoggedInToggle = (checked: boolean) => {
        setKeepLoggedIn(checked);
        localStorage.setItem('nexus_remember_me_preference', checked ? 'true' : 'false');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (!keepLoggedIn) {
                localStorage.setItem('nexus_ephemeral_login', 'true');
            } else {
                localStorage.removeItem('nexus_ephemeral_login');
            }

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

    const handleGoogleLogin = async () => {
        try {
            setError('');
            setLoading(true);

            // Ativa o splash screen com ícone pulsante do Duno antes de redirecionar ao Google
            const splash = document.getElementById('nexus-loading-screen');
            if (splash) {
                splash.style.transition = 'none';
                splash.style.opacity = '1';
                splash.style.pointerEvents = 'auto';
                splash.style.display = 'flex';
                splash.classList.remove('fade-out');
            }

            await DataService.signInWithGoogle();
        } catch (err: any) {
            setError(err.message || 'Erro ao autenticar com o Google. Verifique se o login social está configurado.');
            setLoading(false);
            const splash = document.getElementById('nexus-loading-screen');
            if (splash) {
                splash.classList.add('fade-out');
                setTimeout(() => { splash.style.display = 'none'; }, 500);
            }
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

    return (
        <div className="text-slate-900 antialiased min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8 relative selection:bg-[#1c2d4f] selection:text-white overflow-hidden">
            {/* Imagem de Fundo Desfocada com Overlay Azul */}
            <div className="absolute inset-0 z-0">
                <img 
                    src={LoginBg} 
                    alt="Background" 
                    className="w-full h-full object-cover blur-sm scale-105 opacity-50 pointer-events-none"
                />
                <div className="absolute inset-0 bg-[#0e1729]/80 backdrop-blur-md"></div>
            </div>

            {/* Background Glow Ambiente */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#1c2d4f]/30 rounded-full blur-3xl pointer-events-none translate-x-1/2 translate-y-1/2 z-0" />

            {/* Container Principal Centralizado (Padrão SaaS Moderno) */}
            <div className="w-full max-w-5xl min-h-[480px] bg-white lg:bg-[#0e1729]/40 border border-slate-200 lg:border-[#121d33]/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col lg:flex-row backdrop-blur-xl relative z-10">

                {/* ================= LADO ESQUERDO: FORMULÁRIO DE ACESSO ================= */}
                <div className="w-full lg:w-1/2 flex flex-col bg-white rounded-l-3xl lg:rounded-none relative z-10">

                    {/* FAIXA AZUL NO TETO COM A LOGO CENTRALIZADA */}
                    <div className="w-full bg-[#121d33] py-6 sm:py-8 px-6 sm:px-10 flex justify-center items-center shadow-md shrink-0 rounded-tl-3xl lg:rounded-none">
                        <div
                            onClick={handleLogoClick}
                            className="relative z-10 inline-flex items-center justify-center px-8 py-4 bg-white rounded-2xl shadow-lg border border-slate-100 transition-all duration-300 hover:shadow-xl hover:scale-105 cursor-pointer select-none group"
                            title="DUNO Field Management (Clique 5x para Master)"
                        >
                            <img
                                src={NexusLogo}
                                alt="DUNO Logo"
                                className="h-10 w-auto max-w-[160px] object-contain"
                            />
                        </div>
                    </div>

                    {/* CONTEÚDO CENTRAL (FLEX-1 PARA EMPURRAR O FOOTER PRO FUNDO) */}
                    <div className="flex-1 flex flex-col justify-center px-6 sm:px-10 py-4 sm:py-6 overflow-y-auto custom-scrollbar">
                        <div className="w-full max-w-sm mx-auto my-auto">
                            {resetEmailSent ? (
                                <div className="text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
                                    <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center mx-auto text-emerald-500 shadow-sm shadow-emerald-500/10 mt-2">
                                        <Mail size={32} />
                                    </div>
                                    <div className="space-y-2">
                                        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">E-mail Enviado!</h2>
                                        <p className="text-slate-500 text-xs sm:text-sm leading-relaxed max-w-sm mx-auto">
                                            Enviamos instruções de recuperação para <br />
                                            <span className="text-primary-600 font-semibold">{email}</span>
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { setResetEmailSent(false); setShowForgotPassword(false); }}
                                        className="w-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl py-3 text-xs sm:text-sm font-semibold transition-all"
                                    >
                                        Voltar para o Login
                                    </button>
                                </div>
                            ) : showForgotPassword ? (
                                <div className="space-y-6 animate-in fade-in duration-200">
                                    <div className="space-y-2 text-center mb-6">
                                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Recuperar Senha</h1>
                                        <p className="text-xs sm:text-sm text-slate-500">
                                            Digite seu e-mail corporativo para receber as instruções de recuperação.
                                        </p>
                                    </div>

                                    <form onSubmit={handleForgotPassword} className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                                                E-mail corporativo
                                            </label>
                                            <input
                                                type="email"
                                                required
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder="tecnico@empresa.com.br"
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
                                            />
                                        </div>

                                        {error && (
                                            <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-center">
                                                <p className="text-rose-600 text-xs font-medium leading-tight">{error}</p>
                                            </div>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="w-full bg-[#1c2d4f] hover:bg-[#162441] active:bg-[#121d33] disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 shadow-md shadow-[#1c2d4f]/20 flex items-center justify-center gap-2 group mt-2"
                                        >
                                            <span>{loading ? 'Enviando...' : 'Enviar Recuperação'}</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => { setShowForgotPassword(false); setError(''); }}
                                            className="w-full text-slate-500 text-xs font-medium hover:text-slate-800 hover:underline transition-all text-center py-2 mt-2"
                                        >
                                            Voltar para o Login
                                        </button>
                                    </form>
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-1 mb-4 text-center lg:text-left">
                                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bem-vindo de volta</h1>
                                        <p className="text-xs sm:text-sm text-slate-500">Entre com suas credenciais para acessar.</p>
                                    </div>

                                    {/* Botão Google Workspace */}
                                    <button
                                        type="button"
                                        onClick={handleGoogleLogin}
                                        disabled={loading}
                                        className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs sm:text-sm font-semibold py-2.5 px-4 rounded-xl transition-all duration-200 mb-4 group hover:border-slate-300 shadow-sm disabled:opacity-50"
                                    >
                                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                                            <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.6 3.6 1.8 7.4l3.7 2.9C6.4 7.2 9 5 12 5z" />
                                            <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z" />
                                            <path fill="#FBBC05" d="M5.5 14.7c-.2-.7-.4-1.5-.4-2.7s.2-2 .4-2.7L1.8 6.4C.7 8.6 0 11.2 0 14s.7 5.4 1.8 7.6l3.7-2.9z" />
                                            <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.6-2.2-6.5-5.3L1.8 16c1.8 3.8 5.6 7 10.2 7z" />
                                        </svg>
                                        Continuar com Google Workspace
                                    </button>

                                    <div className="relative flex py-1 items-center mb-4">
                                        <div className="flex-grow border-t border-slate-200"></div>
                                        <span className="flex-shrink mx-3 text-[10px] uppercase tracking-wider text-slate-400 font-bold">ou e-mail</span>
                                        <div className="flex-grow border-t border-slate-200"></div>
                                    </div>

                                    <form className="space-y-3" onSubmit={handleSubmit}>
                                        <div className="space-y-1.5">
                                            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                                                E-mail corporativo
                                            </label>
                                            <input
                                                type="email"
                                                required
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder="tecnico@empresa.com.br"
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <div className="flex justify-between items-center">
                                                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                                                    Senha
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => { setShowForgotPassword(true); setError(''); }}
                                                    className="text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors"
                                                >
                                                    Esqueceu?
                                                </button>
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type={showPassword ? "text" : "password"}
                                                    required
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    placeholder="••••••••••••"
                                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 pr-11 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                                                    title={showPassword ? "Ocultar senha" : "Ver senha"}
                                                >
                                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Permanecer Conectado */}
                                        <div className="flex items-center gap-2.5 pt-1">
                                            <label htmlFor="keep-logged-modern" className="relative flex items-center cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    id="keep-logged-modern"
                                                    checked={keepLoggedIn}
                                                    onChange={(e) => handleKeepLoggedInToggle(e.target.checked)}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-9 h-5 bg-slate-200 border border-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] sm:after:top-[1.5px] sm:after:left-[2px] after:bg-white after:shadow-sm peer-checked:after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#1c2d4f] peer-checked:border-[#1c2d4f]"></div>
                                                <span className="ml-2.5 text-xs text-slate-600 font-medium peer-checked:text-[#1c2d4f] peer-checked:font-bold hover:text-slate-800 transition-colors">
                                                    Permanecer conectado
                                                </span>
                                            </label>
                                        </div>

                                        {/* Avisos de suspensão e expiração */}
                                        {suspendedBanner && (
                                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3 mt-2">
                                                <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-amber-800 text-xs font-bold">Acesso suspenso</p>
                                                    <p className="text-amber-700 text-[11px] mt-0.5 leading-relaxed">
                                                        O acesso da sua empresa foi suspenso. Entre em contato com o suporte DUNO para regularizar sua situação.
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {expiredBanner && (
                                            <div className="bg-primary-50 border border-primary-100 rounded-xl p-3.5 flex items-start gap-3 mt-2">
                                                <Shield size={18} className="text-primary-500 shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-primary-800 text-xs font-bold">Sessão Expirada</p>
                                                    <p className="text-primary-700 text-[11px] mt-0.5 leading-relaxed">
                                                        Por motivos de segurança, sua sessão foi encerrada após período de inatividade. Por favor, acesse novamente.
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Mensagem de Erro */}
                                        {error && (
                                            <div className="bg-rose-50 border border-rose-100 rounded-xl p-3.5 text-center animate-in fade-in duration-200 mt-2">
                                                <p className="text-rose-600 text-xs font-semibold leading-tight">{error}</p>
                                            </div>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="w-full bg-[#1c2d4f] hover:bg-[#162441] active:bg-[#121d33] disabled:opacity-60 text-white font-semibold py-2.5 px-4 rounded-xl transition-all duration-200 shadow-md shadow-[#1c2d4f]/20 flex items-center justify-center gap-2 group mt-2"
                                        >
                                            <span>{loading ? 'Validando...' : 'Acessar Plataforma'}</span>
                                            {!loading && (
                                                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
                                                </svg>
                                            )}
                                        </button>
                                    </form>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Rodapé do Quadrante Esquerdo */}
                    <div className="px-6 sm:px-10 pb-4 pt-3 border-t border-slate-100 flex flex-col gap-2 shrink-0">
                        <div className="text-xs text-slate-400 flex justify-between items-center w-full">
                            <span>&copy; {new Date().getFullYear()} DUNO</span>
                            <button onClick={() => setShowPrivacyTerms(true)} className="hover:text-[#1c2d4f] transition-colors underline-offset-2 hover:underline">
                                Termos de privacidade
                            </button>
                        </div>

                        {/* Brecha para alternar de volta para o modelo clássico */}
                        <div className="flex justify-center pt-1">
                            <button
                                type="button"
                                onClick={onToggleTheme}
                                className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors underline decoration-slate-200 underline-offset-4"
                                title="Voltar ao design clássico anterior"
                            >
                                Alternar para layout clássico
                            </button>
                        </div>
                    </div>
                </div>

                {/* ================= LADO DIREITO: PAINEL VISUAL (VITRINE) ================= */}
                <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#0a111f] via-[#0e1729] to-[#0a111f] p-8 flex-col justify-between relative overflow-hidden border-l border-[#121d33]/60">

                    {/* Imagem de fundo sutil com mix blend para textura profissional */}
                    <img
                        src={LoginBg}
                        alt="DUNO Office"
                        className="absolute inset-0 w-full h-full object-cover opacity-25 pointer-events-none"
                    />
                    {/* Filtro Azul sobre a imagem */}
                    <div className="absolute inset-0 bg-[#0a111f]/40 pointer-events-none"></div>

                    {/* Efeito Glow */}
                    <div className="absolute -top-24 -right-24 w-80 h-80 bg-primary-500/15 rounded-full blur-3xl pointer-events-none"></div>

                    {/* Espaçador superior (v2.4 Core removido) */}
                    <div className="relative z-10 h-6"></div>

                    <div className="relative z-10 space-y-4 mb-auto mt-20">
                        <h2 className="text-2xl sm:text-3xl uppercase tracking-widest text-white font-extrabold drop-shadow-md">Field Management</h2>
                        <blockquote className="text-xl font-semibold text-slate-100 leading-snug">
                            &ldquo;Gestão completa de ordens de serviço, ativos e técnicos em campo unificados em alta performance.&rdquo;
                        </blockquote>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            Elimine atritos operacionais e tenha rastreabilidade total das operações técnicas da sua rede.
                        </p>
                    </div>

                    <div className="relative z-10 flex justify-end items-center pt-4 border-t border-white/40">
                        <span className="text-slate-300 font-extrabold tracking-wider text-[11px] uppercase">
                            DUNO, <span className="font-semibold text-primary-400">Sua operação mais inteligente!</span>
                        </span>
                    </div>
                </div>

            </div>

            {/* Modal de Termos de Privacidade */}
            {showPrivacyTerms && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6 lg:p-12">
                    <div className="bg-white w-full max-w-5xl h-full max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200">
                        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/80">
                            <h3 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center gap-2">
                                <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                Termos de Privacidade DUNO
                            </h3>
                            <button onClick={() => setShowPrivacyTerms(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-2 rounded-xl hover:bg-slate-200/50">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 sm:p-8 lg:p-10 custom-scrollbar bg-white">
                            <PrivacyTermsContent />
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                            <button onClick={() => setShowPrivacyTerms(false)} className="px-6 py-2.5 bg-[#1c2d4f] text-white font-medium rounded-xl hover:bg-[#162441] active:bg-[#121d33] transition-colors shadow-sm">
                                Fechar e Voltar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


/* ==========================================================================================
   MODELO CLÁSSICO (PRESERVADO INTEGRALMENTE PARA GARANTIA TOTAL DE REVERSÃO)
   ========================================================================================== */
const ClassicAdminLogin: React.FC<ThemedLoginProps> = ({ onLogin, onToggleMaster, onToggleTheme }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [keepLoggedIn, setKeepLoggedIn] = useState<boolean>(() => {
        return localStorage.getItem('nexus_remember_me_preference') !== 'false';
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [suspendedBanner, setSuspendedBanner] = useState(false);
    const [expiredBanner, setExpiredBanner] = useState(false);
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [resetEmailSent, setResetEmailSent] = useState(false);

    // Detecta se o usuário foi redirecionado por suspensão de empresa ou sessão expirada
    useEffect(() => {
        const hash = window.location.hash || '';
        if (hash.includes('reason=suspended')) {
            setSuspendedBanner(true);
            window.history.replaceState(null, '', window.location.pathname);
        } else if (hash.includes('reason=expired')) {
            setExpiredBanner(true);
            window.history.replaceState(null, '', window.location.pathname);
        }
    }, []);

    const handleKeepLoggedInToggle = (checked: boolean) => {
        setKeepLoggedIn(checked);
        localStorage.setItem('nexus_remember_me_preference', checked ? 'true' : 'false');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (!keepLoggedIn) {
                localStorage.setItem('nexus_ephemeral_login', 'true');
            } else {
                localStorage.removeItem('nexus_ephemeral_login');
            }

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
                <div className="w-full max-w-sm bg-white p-10 rounded-3xl shadow-2xl border border-slate-200 text-center space-y-6">
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
                    src={LoginBg}
                    alt="Nexus Office"
                    className="absolute inset-0 w-full h-full object-cover opacity-60"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent" />

                <div className="absolute inset-0 flex flex-col justify-center px-20 z-10">
                    <div className="max-w-xl -mt-20">
                        <h2 className="text-6xl font-black text-white italic uppercase tracking-tighter leading-none mb-6 drop-shadow-2xl">
                            Bem vindo ao <br />
                            <span className="text-primary-400">DUNO</span>
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
                    <img src="/nexus-logo.png" alt="DUNO Logo" className="h-10 w-auto max-w-[140px] object-contain" />
                </div>

                <div className="w-full max-w-sm space-y-10">
                    {/* Logo Destacada (Desktop) */}
                    <div className="hidden md:flex flex-col items-center mb-4">
                        <div className="p-6 bg-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-slate-200 mb-8 transition-transform hover:scale-105 duration-500">
                            <img src="/nexus-logo.png" alt="DUNO Logo" className="h-16 w-auto max-w-[180px] object-contain" />
                        </div>
                        <div className="text-center">
                            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">
                                {showForgotPassword ? 'Recuperar Senha' : 'Entre com a sua conta'}
                            </h1>
                        </div>
                    </div>

                    {/* Título Mobile */}
                    <div className="md:hidden text-center mb-8">
                        <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">
                            {showForgotPassword ? 'Recuperação' : 'Login'}
                        </h1>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Painel Admin DUNO</p>
                    </div>

                    {/* Card de Login */}
                    <div className="space-y-6">
                        {!showForgotPassword ? (
                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center px-1">
                                        <label className="font-poppins text-[11px] font-semibold text-slate-600 ml-1 tracking-wide">
                                            E-mail Administrativo *
                                        </label>
                                    </div>
                                    <Input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="Digite seu e-mail"
                                        className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-300 rounded-2xl py-4.5 focus:ring-4 focus:ring-primary-100 transition-all font-medium text-sm"
                                        icon={<Mail size={18} className="text-slate-300" />}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between items-center px-1">
                                        <label className="font-poppins text-[11px] font-semibold text-slate-600 ml-1 tracking-wide">
                                            Senha de Acesso *
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => setShowForgotPassword(true)}
                                            className="font-poppins text-[11px] font-semibold text-primary-600 hover:text-primary-700 hover:underline transition-colors tracking-wide"
                                        >
                                            Esqueci a senha
                                        </button>
                                    </div>
                                    <div className="relative">
                                        <Input
                                            type={showPassword ? "text" : "password"}
                                            required
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Digite sua senha"
                                            className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-300 rounded-2xl py-4.5 pr-12 focus:ring-4 focus:ring-primary-100 transition-all font-medium text-sm"
                                            icon={<Lock size={18} className="text-slate-300" />}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                                        >
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 px-1 mt-2">
                                    <label htmlFor="keep-logged-classic" className="relative flex items-center cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            id="keep-logged-classic"
                                            checked={keepLoggedIn}
                                            onChange={(e) => handleKeepLoggedInToggle(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#1c2d4f] group-hover:bg-slate-300"></div>
                                        <span className="ml-3 text-[12px] font-semibold text-slate-600 tracking-tight select-none">
                                            Permanecer conectado
                                        </span>
                                    </label>
                                </div>

                                {suspendedBanner && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-amber-800 text-xs font-medium leading-tight">Acesso suspenso</p>
                                            <p className="text-amber-600 text-[11px] mt-0.5 leading-relaxed">
                                                O acesso da sua empresa foi suspenso. Entre em contato com o suporte DUNO para regularizar sua situação.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {expiredBanner && (
                                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <Shield size={18} className="text-blue-500 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-blue-800 text-xs font-medium leading-tight">Sessão Expirada</p>
                                            <p className="text-blue-600 text-[11px] mt-0.5 leading-relaxed">
                                                Por motivos de segurança, sua sessão foi encerrada após longo período de inatividade. Por favor, acesse novamente.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {error && (
                                    <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <p className="text-rose-600 text-[11px] font-medium text-center italic leading-tight">{error}</p>
                                    </div>
                                )}

                                <Button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-2xl py-5 font-bold text-sm shadow-2xl shadow-primary-900/20 border-none transition-all active:scale-[0.97]"
                                >
                                    {loading ? 'Validando Acesso...' : 'Continuar'}
                                </Button>
                            </form>
                        ) : (
                            <form onSubmit={handleForgotPassword} className="space-y-5">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center px-1">
                                        <label className="font-poppins text-[11px] font-semibold text-slate-600 ml-1 tracking-wide">
                                            E-mail Administrativo *
                                        </label>
                                    </div>
                                    <Input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="Digite seu e-mail"
                                        className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-300 rounded-2xl py-4.5 focus:ring-4 focus:ring-primary-100 transition-all font-medium text-sm"
                                        icon={<Mail size={18} className="text-slate-300" />}
                                    />
                                </div>

                                {error && (
                                    <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <p className="text-rose-600 text-[11px] font-medium text-center italic leading-tight">{error}</p>
                                    </div>
                                )}

                                <div className="space-y-3">
                                    <Button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-2xl py-5 font-bold text-sm shadow-2xl shadow-primary-900/20 border-none transition-all active:scale-[0.97]"
                                    >
                                        {loading ? 'Enviando...' : 'Enviar Recuperação'}
                                    </Button>
                                    <button
                                        type="button"
                                        onClick={() => { setShowForgotPassword(false); setError(''); }}
                                        className="w-full text-slate-500 text-[10px] font-bold hover:text-slate-700 hover:underline transition-all"
                                    >
                                        Voltar para o Login
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>

                    {/* Footer Links */}
                    <div className="flex flex-col items-center gap-6 pt-10">
                        <div className="flex flex-col items-center gap-3">
                            <div className="flex items-center gap-6 font-poppins text-slate-400 text-[10px] font-medium uppercase tracking-widest">
                                <span>DUNO v2.0</span>
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-200"></span>
                                <span>© 2026</span>
                            </div>

                            {/* Brecha para alternar para o modelo moderno */}
                            <button
                                type="button"
                                onClick={onToggleTheme}
                                className="text-[11px] text-slate-400 hover:text-primary-600 transition-colors underline decoration-slate-300 underline-offset-4"
                                title="Experimentar o novo modelo SaaS moderno"
                            >
                                Experimentar novo layout moderno (SaaS)
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};


/* ==========================================================================================
   COMPONENTE PRINCIPAL COM CONTROLE DE MODELO (MODERNO vs CLÁSSICO)
   ========================================================================================== */
export const AdminLogin: React.FC<AdminLoginProps> = (props) => {
    const [currentTheme, setCurrentTheme] = useState<'modern' | 'classic'>(() => {
        // 1. Verifica query string ou hash params
        const hash = window.location.hash || '';
        const search = window.location.search || '';
        const fullQuery = search + (hash.includes('?') ? '&' + hash.split('?')[1] : '');
        const params = new URLSearchParams(fullQuery);

        const urlView = params.get('view') || params.get('theme');
        if (urlView === 'classic') return 'classic';
        if (urlView === 'modern') return 'modern';

        // 2. Verifica se há preferência salva no localStorage
        const saved = localStorage.getItem('duno_login_theme');
        if (saved === 'classic' || saved === 'modern') return saved;

        // 3. Fallback para a configuração padrão definida na constante
        return USE_MODERN_LOGIN ? 'modern' : 'classic';
    });

    const handleToggleTheme = () => {
        const nextTheme = currentTheme === 'modern' ? 'classic' : 'modern';
        setCurrentTheme(nextTheme);
        localStorage.setItem('duno_login_theme', nextTheme);
    };

    if (currentTheme === 'classic') {
        return <ClassicAdminLogin {...props} onToggleTheme={handleToggleTheme} />;
    }

    return <ModernAdminLogin {...props} onToggleTheme={handleToggleTheme} />;
};
