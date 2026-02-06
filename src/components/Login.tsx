
import React, { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Lock, Mail, ShieldCheck, Wrench, Hexagon } from 'lucide-react';
import { DataService } from '../services/dataService';
import SessionStorage from '../lib/sessionStorage';
import { User } from '../types';

interface LoginProps {
  onLogin: (user: User, keepConnected: boolean) => void;
  onToggleMaster?: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin, onToggleMaster }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [roleMode, setRoleMode] = useState<'admin' | 'tech'>('admin');
  const [error, setError] = useState('');
  const [keepConnected, setKeepConnected] = useState(true);

  const [logoClicks, setLogoClicks] = useState(0);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (logoClicks > 0 && logoClicks < 5) {
      timeout = setTimeout(() => setLogoClicks(0), 1000);
    }
    return () => clearTimeout(timeout);
  }, [logoClicks]);

  const handleLogoClick = () => {
    const newCount = logoClicks + 1;
    setLogoClicks(newCount);

    if (newCount >= 5) {
      SessionStorage.set('force_master', true);
      SessionStorage.remove('is_impersonating');
      // Em vez de reload, usamos o callback para o App.tsx mudar o estado
      if (onToggleMaster) {
        onToggleMaster();
      } else {
        window.location.hash = '#nexus-master';
      }
      setLogoClicks(0);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const user = await DataService.login(email, password);
      if (user) {
        onLogin(user, keepConnected);
      } else {
        setError('Credenciais inválidas. Verifique seu e-mail e senha.');
      }
    } catch (err) {
      setError('Falha no login. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (mode: 'admin' | 'tech') => {
    setRoleMode(mode);
    setEmail('');
    setPassword('');
    setError('');
  };


  return (
    <div className="h-screen w-screen fixed inset-0 flex items-center justify-center bg-slate-50 relative overflow-hidden">
      {/* Background Decorativo Sutil (Grid) */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
      <div className="absolute inset-0 bg-gradient-to-tr from-slate-100 via-slate-50 to-slate-100"></div>

      <div className="w-full max-w-md p-10 bg-white/80 border border-white rounded-[3rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] relative z-10 backdrop-blur-xl animate-fade-in-up">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-6">
            <div
              onClick={handleLogoClick}
              className={`relative p-4 rounded-[1.5rem] bg-gradient-to-br shadow-2xl cursor-pointer active:scale-90 transition-all ${logoClicks >= 3 ? 'ring-2 ring-purple-500 animate-pulse' : ''} ${roleMode === 'admin' ? 'from-indigo-500 to-blue-600' : 'from-emerald-500 to-teal-600'}`}
            >
              <Hexagon size={40} className="text-white" fill="currentColor" fillOpacity={0.2} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white font-black text-xs">N</span>
              </div>
            </div>
          </div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tighter italic flex justify-center items-center gap-1 select-none">
            NEXUS<span className={roleMode === 'admin' ? 'text-indigo-500' : 'text-emerald-500'}>.PRO</span>
          </h1>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Plataforma de Gestão Técnica</p>
        </div>

        <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-10 border border-slate-200">
          <button
            onClick={() => switchMode('admin')}
            className={`flex-1 flex items-center justify-center py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${roleMode === 'admin'
              ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
              : 'text-slate-400 hover:text-slate-600'
              }`}
          >
            <ShieldCheck size={14} className="mr-2" /> Administrativo
          </button>
          <button
            onClick={() => switchMode('tech')}
            className={`flex-1 flex items-center justify-center py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${roleMode === 'tech'
              ? 'bg-white text-emerald-600 shadow-sm border border-slate-200'
              : 'text-slate-400 hover:text-slate-600'
              }`}
          >
            <Wrench size={14} className="mr-2" /> Técnico Campo
          </button>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Acesso Identificado</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail size={18} className="text-slate-400" />}
              required
              className="bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 rounded-2xl py-4 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-200 transition-all font-bold"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Chave de Segurança</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Lock size={18} className="text-slate-400" />}
              required
              className="bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 rounded-2xl py-4 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-200 transition-all font-bold"
            />
          </div>

          <div className="flex items-center px-2">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={keepConnected}
                onChange={(e) => setKeepConnected(e.target.checked)}
                className="w-5 h-5 rounded-lg border-slate-300 bg-white text-emerald-500 focus:ring-emerald-500 cursor-pointer"
              />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-slate-600 transition-colors">Manter conectado</span>
            </label>
          </div>

          {error && <div className="text-red-500 text-[10px] font-black uppercase text-center bg-red-50 p-3 rounded-xl border border-red-100">{error}</div>}

          <Button
            type="submit"
            variant={roleMode === 'admin' ? 'primary' : 'tech-primary'}
            className={`w-full py-5 rounded-2xl font-black text-sm uppercase italic tracking-tight shadow-xl ${roleMode === 'admin' ? 'shadow-indigo-500/20' : 'shadow-emerald-500/20'}`}
            isLoading={loading}
          >
            Autenticar no Sistema
          </Button>
        </form>

        <div className="mt-10 text-center">
          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent mb-6"></div>
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em]">Versão Enterprise v2.5.0</p>
        </div>
      </div>
    </div>
  );
};
