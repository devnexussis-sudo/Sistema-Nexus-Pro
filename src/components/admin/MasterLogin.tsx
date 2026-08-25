
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ShieldCheck, Lock, Mail, ArrowRight, KeyRound, AlertTriangle, Timer } from 'lucide-react';
import SessionStorage from '../../lib/sessionStorage';
import { supabase } from '../../lib/supabase';
import { NexusBranding } from '../ui/NexusBranding';

// Supabase project URL for Edge Function calls
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// The session token returned by the edge function — compared in browser for session persistence
// This is NOT a secret — it's just an opaque value to confirm the server validated credentials
const LOCKOUT_KEY = 'master_lockout_ui';

interface MasterLoginProps {
  onLogin: () => void;
  onCancel?: (e?: any) => void;
}

export const MasterLogin: React.FC<MasterLoginProps> = ({ onLogin, onCancel }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    const lockoutUntil = parseInt(localStorage.getItem(LOCKOUT_KEY) || '0', 10);
    if (lockoutUntil > Date.now()) setLockedUntil(lockoutUntil);
  }, []);

  useEffect(() => {
    if (!lockedUntil) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) {
        setLockedUntil(null);
        localStorage.removeItem(LOCKOUT_KEY);
        clearInterval(timerRef.current);
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [lockedUntil]);

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockedUntil && lockedUntil > Date.now()) return;

    setLoading(true);
    setError('');

    try {
      // All secrets validated server-side inside the Edge Function
      const response = await fetch(`${SUPABASE_URL}/functions/v1/master-auth-validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, password, totp: totpCode }),
      });

      const result = await response.json();

      if (response.status === 429) {
        // Server-side rate limit hit — sync UI lockout display
        const until = Date.now() + ((result.lockedSecs || 300) * 1000);
        localStorage.setItem(LOCKOUT_KEY, String(until));
        setLockedUntil(until);
        setError(result.error || 'Acesso bloqueado temporariamente.');
        return;
      }

      if (result.success && result.sessionToken) {
        // ─── Big Tech Pattern: Set session using server-issued JWT tokens ───
        // The Edge Function (Identity Provider) validates 3FA and issues 
        // real Supabase Auth tokens. We use setSession() to establish the
        // authenticated session locally — like Auth0's handleRedirectCallback.
        if (result.access_token && result.refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: result.access_token,
            refresh_token: result.refresh_token,
          });
          if (sessionError) {
            console.error('[MasterLogin] Session establishment failed:', sessionError.message);
          }
        }

        // Store the opaque session token — server confirmed identity
        SessionStorage.set('master_session_v2', true);
        SessionStorage.set('master_session_token', result.sessionToken);
        SessionStorage.remove('force_master');
        localStorage.removeItem(LOCKOUT_KEY);
        onLogin();
      } else {
        setError(result.error || 'Credenciais inválidas ou código TOTP incorreto.');
      }
    } catch (err: any) {
      setError('Erro de conexão com o servidor de autenticação. Verifique sua internet.');
    } finally {
      setLoading(false);
    }
  };

  const isLocked = lockedUntil !== null && lockedUntil > Date.now();

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6 relative overflow-hidden select-none">
      {/* 🌌 Atmospheric Mesh & Grid Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_-100px,#1c2d4f,transparent)] opacity-60 pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-25 pointer-events-none" />

      <div className="w-full max-w-md space-y-8 relative z-10 animate-in fade-in zoom-in-95 duration-500">
        {/* Header Branding */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-5 bg-gradient-to-b from-[#1c2d4f] to-[#121f38] rounded-[2rem] shadow-2xl shadow-[#1c2d4f]/40 ring-1 ring-white/10 hover:scale-105 transition-transform duration-300">
              <NexusBranding variant="light" size="lg" showText={false} />
            </div>
          </div>
          <div className="space-y-1.5">
            <h1 className="text-3xl font-extrabold tracking-tight uppercase text-white flex items-center justify-center gap-2">
              DUNO <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">Master</span>
            </h1>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[9px] font-extrabold uppercase tracking-[0.3em] text-blue-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
              </span>
              Núcleo de Provisionamento Global
            </div>
          </div>
        </div>

        {/* Auth Glassmorphic Card */}
        <div className="bg-slate-900/75 backdrop-blur-2xl p-8 sm:p-10 rounded-[2.5rem] border border-slate-800/80 shadow-[0_20px_50px_rgba(0,0,0,0.6)] relative overflow-hidden ring-1 ring-white/5">
          {isLocked ? (
            <div className="text-center space-y-6 py-4">
              <div className="flex justify-center">
                <div className="p-4 bg-rose-500/10 rounded-2xl border border-rose-500/20 shadow-inner">
                  <Timer size={40} className="text-rose-400 animate-pulse" />
                </div>
              </div>
              <div>
                <p className="text-xs font-black text-rose-400 uppercase tracking-widest mb-1.5">Acesso Temporariamente Bloqueado</p>
                <p className="text-slate-400 text-xs font-medium">Muitas tentativas mal sucedidas registradas.</p>
              </div>
              <div className="bg-rose-950/40 border border-rose-500/30 rounded-2xl p-6 shadow-2xl">
                <p className="text-4xl font-black text-rose-400 font-mono tracking-wider">{formatCountdown(countdown)}</p>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-2">Tempo restante para desbloqueio</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
              <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest px-2">E-mail Master</label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="master@dunoup.com.br"
                  icon={<Mail size={18} className="text-slate-500" />}
                  className="bg-slate-950/60 border-slate-800 focus:border-blue-500/60 text-white rounded-2xl py-4 transition-all"
                  required
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest px-2">Chave de Segurança</label>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  icon={<Lock size={18} className="text-slate-500" />}
                  className="bg-slate-950/60 border-slate-800 focus:border-blue-500/60 text-white rounded-2xl py-4 transition-all"
                  required
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest px-2">Código TOTP (Autenticador)</label>
                <Input
                  type="text"
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  icon={<KeyRound size={18} className="text-slate-500" />}
                  className="bg-slate-950/60 border-slate-800 focus:border-blue-500/60 text-white rounded-2xl py-4 font-mono text-lg tracking-[0.5em] transition-all"
                  maxLength={6}
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                />
                <p className="text-[9px] text-slate-500 font-medium px-2">
                  Use Google Authenticator ou Authy. O código renova a cada 30s.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-3 bg-rose-500/10 border border-rose-500/30 p-4 rounded-2xl animate-shake">
                  <AlertTriangle size={18} className="text-rose-400 mt-0.5 shrink-0" />
                  <p className="text-[10px] font-extrabold text-rose-300 uppercase leading-relaxed">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading || totpCode.length < 6}
                className="w-full bg-[#1c2d4f] hover:bg-[#253a66] active:bg-[#162440] text-white rounded-2xl py-4 text-xs font-bold uppercase shadow-xl shadow-[#1c2d4f]/30 border border-blue-400/20 transition-all duration-200 active:scale-98 disabled:opacity-40 disabled:pointer-events-none"
              >
                {loading ? 'Autenticando no servidor...' : 'Autenticar Master'} <ArrowRight size={16} className="ml-2" />
              </Button>
            </form>
          )}
        </div>

        {/* Footer info */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <ShieldCheck size={14} className="text-slate-600" />
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">
              Nexus Line Enterprise © 2026 — Autenticação Server-Side 🔐
            </p>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={(e) => onCancel(e)}
              className="text-[10px] font-bold text-slate-500 hover:text-slate-300 uppercase tracking-widest transition-colors cursor-pointer block w-full text-center py-2"
            >
              Voltar ao Início
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
