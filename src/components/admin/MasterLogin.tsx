
import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ShieldCheck, Lock, Mail, Hexagon, ArrowRight } from 'lucide-react';
import SessionStorage from '../../lib/sessionStorage';

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

    const masterEmail = import.meta.env.VITE_MASTER_EMAIL || 'admin@nexus.global';
    const masterPass = import.meta.env.VITE_MASTER_PASSWORD || 'admin';

    if (email.trim().toLowerCase() === masterEmail && password.trim() === masterPass) {
      await new Promise(resolve => setTimeout(resolve, 800));
      SessionStorage.set('master_session_v2', true);
      SessionStorage.remove('force_master');
      onLogin();
    } else {
      await new Promise(resolve => setTimeout(resolve, 500));
      setError('Acesso negado. Credenciais do Núcleo Master inválidas.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0d0d12] flex items-center justify-center p-6 selection:bg-purple-500/30">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-4 bg-purple-600 rounded-[2rem] shadow-2xl shadow-purple-500/40 animate-pulse">
              <ShieldCheck size={48} className="text-white" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-black text-white italic tracking-tighter uppercase">Nexus <span className="text-purple-500">Master</span></h1>
            <p className="text-[10px] font-black text-purple-400/60 uppercase tracking-[0.4em]">Núcleo de Provisionamento Global</p>
          </div>
        </div>

        <div className="bg-[#16161e] p-10 rounded-[3rem] border border-white/5 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/5 blur-[50px] -translate-y-1/2 translate-x-1/2"></div>

          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            <Input
              label="E-mail Master"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="master@nexus.global"
              icon={<Mail size={18} />}
              className="bg-white/5 border-white/10 text-white rounded-2xl py-4 focus:border-purple-500/50"
              required
            />
            <Input
              label="Chave de Segurança"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              icon={<Lock size={18} />}
              className="bg-white/5 border-white/10 text-white rounded-2xl py-4 focus:border-purple-500/50"
              required
            />

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl text-[10px] font-black text-red-500 uppercase text-center animate-shake">
                {error}
              </div>
            )}

            <Button
              type="submit"
              isLoading={loading}
              className="w-full bg-purple-600 hover:bg-purple-500 rounded-2xl py-6 font-black italic uppercase shadow-xl shadow-purple-500/20 transition-all active:scale-95"
            >
              Autenticar Master <ArrowRight size={18} className="ml-2" />
            </Button>
          </form>
        </div>

        <div className="text-center space-y-4">
          <p className="text-[9px] font-bold text-gray-600 uppercase tracking-[0.2em] italic">
            Nexus Enterprise Architecture &copy; 2025
          </p>
          {onCancel && (
            <button
              type="button"
              onClick={(e) => onCancel(e)}
              className="text-[10px] font-black text-purple-500/50 hover:text-purple-500 uppercase tracking-widest transition-colors cursor-pointer block w-full text-center py-2"
            >
              Voltar ao Início
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
