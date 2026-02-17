
import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ShieldCheck, Lock, Mail, ArrowRight } from 'lucide-react';
import SessionStorage from '../../lib/sessionStorage';
import { NexusBranding } from '../ui/NexusBranding';

interface MasterLoginProps {
  onLogin: () => void;
  onCancel?: (e?: any) => void;
}

export const MasterLogin: React.FC<MasterLoginProps> = ({ onLogin, onCancel }) => {
  console.log("MasterLogin Component Mounting");
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 🛡️ Security: Enforce a minimum delay to prevent timing attacks and brute-force
      await new Promise(resolve => setTimeout(resolve, 1500));

      const masterEmail = import.meta.env.VITE_MASTER_EMAIL || 'admin@nexus.global';
      const masterPass = import.meta.env.VITE_MASTER_PASSWORD;

      if (!masterPass) {
        throw new Error('Configuração de segurança incompleta (VITE_MASTER_PASSWORD).');
      }

      if (email.trim().toLowerCase() === masterEmail && password === masterPass) {
        SessionStorage.set('master_session_v2', true);
        SessionStorage.remove('force_master');
        onLogin();
      } else {
        setError('Credenciais inválidas ou acesso não autorizado.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro de autenticação.');
    } finally {
      setLoading(false);
    }
  };

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

        <div className="bg-white/5 backdrop-blur-xl p-10 rounded-[2.5rem] border border-white/10 shadow-2xl relative overflow-hidden group">
          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
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
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-[10px] font-bold text-red-400 uppercase text-center">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-xl py-6 font-bold uppercase shadow-xl shadow-[#1c2d4f]/20 border-none transition-all active:scale-95"
            >
              {loading ? 'Autenticando...' : 'Autenticar Master'} <ArrowRight size={18} className="ml-2" />
            </Button>
          </form>
        </div>

        <div className="text-center space-y-4">
          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em]">
            Nexus Line Enterprise &copy; 2026
          </p>
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
