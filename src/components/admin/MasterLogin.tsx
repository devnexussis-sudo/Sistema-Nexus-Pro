
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ShieldCheck, Lock, Mail, ArrowRight, KeyRound, AlertTriangle, Timer } from 'lucide-react';
import SessionStorage from '../../lib/sessionStorage';
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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-5 bg-[#1c2d4f] rounded-[2rem] shadow-2xl shadow-[#1c2d4f]/20">
              <NexusBranding variant="light" size="lg" showText={false} />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-white tracking-tight uppercase">Nexus <span className="text-slate-400">Master</span></h1>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.4em]">Núcleo de Provisionamento Global</p>
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-xl p-10 rounded-[2.5rem] border border-white/10 shadow-2xl relative overflow-hidden">
          {isLocked ? (
            <div className="text-center space-y-6 py-4">
              <div className="flex justify-center">
                <div className="p-4 bg-red-500/10 rounded-2xl">
                  <Timer size={40} className="text-red-400" />
                </div>
              </div>
              <div>
                <p className="text-sm font-bold text-red-400 uppercase tracking-widest mb-2">Acesso Temporariamente Bloqueado</p>
                <p className="text-slate-400 text-xs">Muitas tentativas mal sucedidas.</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
                <p className="text-4xl font-black text-red-400 font-mono">{formatCountdown(countdown)}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-2">Tempo restante para desbloqueio</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-2">E-mail Master</label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="master@nexus.global"
                  icon={<Mail size={18} className="text-white/20" />}
                  className="bg-white/5 border-white/10 text-white rounded-xl py-4"
                  required
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-2">Chave de Segurança</label>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  icon={<Lock size={18} className="text-white/20" />}
                  className="bg-white/5 border-white/10 text-white rounded-xl py-4"
                  required
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-2">Código TOTP (Autenticador)</label>
                <Input
                  type="text"
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  icon={<KeyRound size={18} className="text-white/20" />}
                  className="bg-white/5 border-white/10 text-white rounded-xl py-4 font-mono text-lg tracking-[0.5em]"
                  maxLength={6}
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                />
                <p className="text-[9px] text-slate-600 px-2">
                  Use Google Authenticator, Authy ou 1Password. Código renova a cada 30s.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 p-4 rounded-xl">
                  <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
                  <p className="text-[10px] font-bold text-red-400 uppercase leading-relaxed">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading || totpCode.length < 6}
                className="w-full bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-xl py-6 font-bold uppercase shadow-xl shadow-[#1c2d4f]/20 border-none transition-all active:scale-95 disabled:opacity-40"
              >
                {loading ? 'Autenticando no servidor...' : 'Autenticar Master'} <ArrowRight size={18} className="ml-2" />
              </Button>
            </form>
          )}
        </div>

        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <ShieldCheck size={12} className="text-slate-700" />
            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em]">
              Nexus Line Enterprise © 2026 — Autenticação Server-Side 🔐
            </p>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={(e) => onCancel(e)}
              className="text-[10px] font-bold text-slate-500 hover:text-white uppercase tracking-widest transition-colors cursor-pointer block w-full text-center py-2"
            >
              Voltar ao Início
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
