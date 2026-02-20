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

        const safetyTimer = setTimeout(() => {
            if (mounted && isChecking) setIsChecking(false);
        }, 3500);

        const init = async () => {
            try {
                const url = window.location.href;
                const access = url.match(/access_token=([^&]*)/)?.[1];
                const refresh = url.match(/refresh_token=([^&]*)/)?.[1];

                if (access) {
                    await supabase.auth.setSession({
                        access_token: access,
                        refresh_token: refresh || '',
                    });

                    // 🛡️ LIMPEZA DE URL: Remove o token da barra de endereços para evitar conflitos
                    const cleanUrl = window.location.origin + window.location.pathname + '#/reset-password';
                    window.history.replaceState(null, '', cleanUrl);
                }

                const { data: { session } } = await supabase.auth.getSession();
                if (!session && mounted) {
                    setError('Link expirado ou inválido. Peça um novo e-mail.');
                }
            } catch (err) {
                console.error('[ResetPassword] Init Error:', err);
            } finally {
                if (mounted) {
                    setIsChecking(false);
                    clearTimeout(safetyTimer);
                }
            }
        };

        init();
        return () => { mounted = false; clearTimeout(safetyTimer); };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading) return;

        setError('');
        if (password.length < 6) { return setError('Mínimo 6 caracteres.'); }
        if (password !== confirmPassword) { return setError('Senhas não conferem.'); }

        setLoading(true);

        try {
            // 🏎️ RACE CONDITION FIX: Se o Supabase demorar mais de 12s, desistimos e mostramos erro
            const updatePromise = supabase.auth.updateUser({ password });
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('O servidor não respondeu a tempo. Tente novamente.')), 12000)
            );

            await Promise.race([updatePromise, timeoutPromise])
                .then((res: any) => {
                    if (res.error) throw res.error;
                });

            setSuccess(true);
            await supabase.auth.signOut().catch(() => { });
            setTimeout(() => navigate('/login'), 3000);

        } catch (err: any) {
            console.error('[ResetPassword] Update Error:', err);
            setError(err.message || 'Erro ao salvar. Verifique sua conexão.');
        } finally {
            // 🔓 GARANTIA: O botão sempre volta ao normal se não for sucesso
            setLoading(false);
        }
    };

    if (isChecking) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc]">
                <div className="w-10 h-10 rounded-full border-4 border-slate-100 border-t-primary-600 animate-spin mb-4"></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aguarde...</p>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-8">
                <div className="w-full max-w-sm bg-white p-10 rounded-[2.5rem] shadow-2xl text-center space-y-6 animate-in zoom-in duration-500">
                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-500">
                        <ShieldCheck size={40} />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-black text-slate-800 uppercase italic">Senha Salva!</h2>
                        <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest leading-relaxed">Redirecionando para login...</p>
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

                <div className="bg-white p-8 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.06)] border border-slate-50 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-1">
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

                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Repetir Senha</label>
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
                            <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex items-start gap-3">
                                <AlertCircle className="text-rose-500 shrink-0" size={16} />
                                <p className="text-rose-600 text-[10px] font-black uppercase tracking-tight leading-tight">{error}</p>
                            </div>
                        )}

                        <Button
                            type="submit"
                            disabled={loading}
                            className={`w-full text-white rounded-2xl py-5 font-black uppercase tracking-[0.2em] shadow-xl transition-all active:scale-[0.97] text-[11px] ${loading ? 'bg-slate-400 cursor-not-allowed opacity-70' : 'bg-[#1c2d4f] hover:bg-[#253a66]'
                                }`}
                        >
                            {loading ? 'PROCESSANDO...' : 'MODIFICAR SENHA'}
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
