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

        const handleToken = async () => {
            try {
                // Pequeno delay para garantir que o navegador processou a URL completa
                await new Promise(resolve => setTimeout(resolve, 800));

                const hash = window.location.hash;
                if (hash.includes('access_token=')) {
                    // Extração robusta do token
                    const token = hash.split('access_token=')[1]?.split('&')[0];
                    const refresh = hash.split('refresh_token=')[1]?.split('&')[0];

                    if (token) {
                        const { error: sessionError } = await supabase.auth.setSession({
                            access_token: token,
                            refresh_token: refresh || '',
                        });

                        if (sessionError) {
                            console.error('[ResetPassword] Erro ao carregar sessão:', sessionError);
                            if (mounted) setError('O link de recuperação parece inválido ou expirou.');
                        } else {
                            // Limpa a URL para evitar re-processamento do token pelo Supabase
                            const cleanUrl = window.location.origin + window.location.pathname + window.location.search + '#/reset-password';
                            window.history.replaceState(null, '', cleanUrl);
                        }
                    }
                }

                // Verifica se temos sessão agora
                const { data: { session } } = await supabase.auth.getSession();
                if (!session && mounted && !error) {
                    setError('Não foi possível validar seu acesso. Por favor, tente clicar no link do e-mail novamente.');
                }

            } catch (err) {
                console.error('[ResetPassword] Erro crítico:', err);
                if (mounted) setError('Ocorreu um erro ao validar o link de recuperação.');
            } finally {
                if (mounted) setIsChecking(false);
            }
        };

        handleToken();

        return () => { mounted = false; };
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
            // 1. Verifica se a sessão está ativa antes de tentar o update
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                throw new Error('Sessão perdida. Por favor, atualize a página ou clique novamente no link do e-mail.');
            }

            // 2. Tenta atualizar a senha
            const { error: updateError } = await supabase.auth.updateUser({
                password: password
            });

            if (updateError) throw updateError;

            // 3. Sucesso!
            setSuccess(true);

            // 4. Limpa a sessão para forçar novo login
            await supabase.auth.signOut();

            // 5. Redireciona
            setTimeout(() => {
                navigate('/login');
            }, 3000);

        } catch (err: any) {
            console.error('[ResetPassword] Erro ao salvar senha:', err);
            setError(err.message || 'Erro inesperado ao salvar. Verifique sua conexão.');
        } finally {
            setLoading(false);
        }
    };

    if (isChecking) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc]">
                <div className="w-12 h-12 rounded-full border-4 border-primary-100 border-t-primary-600 animate-spin mb-4"></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Carregando formulário...</p>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-8">
                <div className="w-full max-w-sm bg-white p-10 rounded-3xl shadow-2xl border border-slate-50 text-center space-y-6">
                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-500">
                        <ShieldCheck size={40} />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Senha Atualizada!</h2>
                        <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest leading-relaxed">
                            Senha alterada com sucesso. <br />
                            Redirecionando para o login...
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
                    <div className="inline-flex p-4 bg-white rounded-2xl shadow-xl border border-slate-50 mb-4">
                        <img src="/nexus-logo.png" alt="Nexus Logo" className="h-12 w-auto" />
                    </div>
                    <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Nova Senha</h1>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Crie sua nova credencial de acesso</p>
                </div>

                <div className="bg-white p-8 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-slate-50">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Nova Senha</label>
                            <Input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Digite a nova senha"
                                className="bg-slate-50 border-slate-200 text-slate-900 rounded-2xl py-4 focus:ring-4 focus:ring-primary-100 transition-all font-bold"
                                icon={<Lock size={18} className="text-slate-300" />}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Confirmar Nova Senha</label>
                            <Input
                                type="password"
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Repita a senha"
                                className="bg-slate-50 border-slate-200 text-slate-900 rounded-2xl py-4 focus:ring-4 focus:ring-primary-100 transition-all font-bold"
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
                            disabled={loading}
                            className={`w-full text-white rounded-2xl py-5 font-black uppercase tracking-[0.25em] transition-all active:scale-[0.97] ${loading ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#1c2d4f] hover:bg-[#253a66]'
                                }`}
                        >
                            {loading ? 'Salvando Senha...' : 'Salvar Nova Senha'}
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
