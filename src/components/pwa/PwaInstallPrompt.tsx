/**
 * ============================================
 * PWA Install Prompt — Big Tech Mobile Experience
 * ============================================
 * 
 * Exibe o modal/bottom-sheet de instalação PWA com design Big Tech
 * APENAS em dispositivos móveis caso o app não esteja instalado como PWA (standalone).
 * Em desktops, este componente é completamente inerte (renderiza null).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Download, Smartphone, Zap, Bell, CheckCircle2,
  Sparkles, PlusSquare, MoreVertical
} from 'lucide-react';

// ─── Detecção de Dispositivo Móvel ───────────────────────────────────
export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;

  const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i.test(ua);
  const hasTouch = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
  const smallScreen = window.innerWidth <= 1024;

  // Se o User-Agent é mobile, ou se tem touch e tela compacta, classifica como mobile
  return mobileUA || (hasTouch && smallScreen);
};

// Verifica se já está rodando como PWA instalada (standalone mode)
export const isRunningAsPwa = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    (typeof document !== 'undefined' && document.referrer.includes('android-app://'))
  );
};

const SESSION_DISMISS_KEY = 'nexus-pwa-dismissed-session';

export const PwaInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showAndroidGuide, setShowAndroidGuide] = useState(false);
  const promptRef = useRef<any>(null);

  // ─── Setup: Escuta eventos de instalação e gatilhos programáticos ─────
  useEffect(() => {
    // 1. Limpa qualquer bloqueio legado de 3 dias do localStorage para reativar o prompt
    try {
      localStorage.removeItem('nexus-pwa-dismissed');
    } catch (e) {
      // Ignora erro em iframes restritos
    }

    // 2. Permite que qualquer botão do sistema chame o prompt programaticamente
    const openPromptHandler = () => {
      setShowBanner(true);
      const isIOSDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !(window.navigator as any).standalone;
      if (isIOSDevice) {
        setShowIOSGuide(true);
      }
    };
    window.addEventListener('nexus-open-pwa-install', openPromptHandler);

    // 3. Captura o prompt se index.html já o pegou antes do React montar
    if ((window as any).__nexusDeferredInstallPrompt) {
      promptRef.current = (window as any).__nexusDeferredInstallPrompt;
      setDeferredPrompt((window as any).__nexusDeferredInstallPrompt);
    }

    const promptCapturedHandler = () => {
      if ((window as any).__nexusDeferredInstallPrompt) {
        promptRef.current = (window as any).__nexusDeferredInstallPrompt;
        setDeferredPrompt((window as any).__nexusDeferredInstallPrompt);
      }
    };
    window.addEventListener('nexus-beforeinstallprompt-captured', promptCapturedHandler);

    // 4. Captura do evento nativo beforeinstallprompt
    const nativeHandler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e;
      setDeferredPrompt(e);
      (window as any).__nexusDeferredInstallPrompt = e;
    };
    window.addEventListener('beforeinstallprompt', nativeHandler);

    // 5. Guard: Se não for mobile ou já estiver rodando instalado como PWA (standalone), não exibe
    if (!isMobileDevice() || isRunningAsPwa()) {
      return () => {
        window.removeEventListener('nexus-open-pwa-install', openPromptHandler);
        window.removeEventListener('nexus-beforeinstallprompt-captured', promptCapturedHandler);
        window.removeEventListener('beforeinstallprompt', nativeHandler);
      };
    }

    // 6. Verifica se dispensou nesta sessão atual (permite forçar via ?pwa=1)
    const isForced = window.location.search.includes('pwa=1') || window.location.hash.includes('pwa=1');
    const sessionDismissed = sessionStorage.getItem(SESSION_DISMISS_KEY);
    if (sessionDismissed && !isForced) {
      return () => {
        window.removeEventListener('nexus-open-pwa-install', openPromptHandler);
        window.removeEventListener('nexus-beforeinstallprompt-captured', promptCapturedHandler);
        window.removeEventListener('beforeinstallprompt', nativeHandler);
      };
    }

    // 7. Exibe o banner suavemente em qualquer dispositivo móvel após 1.5s
    const timer = setTimeout(() => {
      setShowBanner(true);
    }, 1500);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('nexus-open-pwa-install', openPromptHandler);
      window.removeEventListener('nexus-beforeinstallprompt-captured', promptCapturedHandler);
      window.removeEventListener('beforeinstallprompt', nativeHandler);
    };
  }, []);

  // ─── Ação de Instalação ─────────────────────────────────────────
  const handleInstall = useCallback(async () => {
    const prompt = promptRef.current || deferredPrompt || (window as any).__nexusDeferredInstallPrompt;

    // Se o browser Chromium disponibilizou o prompt nativo (1-clique)
    if (prompt && typeof prompt.prompt === 'function') {
      setIsInstalling(true);
      try {
        await prompt.prompt();
        const result = await prompt.userChoice;
        if (result && result.outcome === 'accepted') {
          setShowBanner(false);
          sessionStorage.setItem(SESSION_DISMISS_KEY, 'true');
        }
      } catch (err) {
        console.warn('[PWA] Erro ao disparar prompt nativo:', err);
      } finally {
        setIsInstalling(false);
        setDeferredPrompt(null);
        promptRef.current = null;
        (window as any).__nexusDeferredInstallPrompt = null;
      }
      return;
    }

    // Se NÃO houver prompt nativo (ex: iOS Safari, ou Chrome Android que já suprimiu o prompt, Firefox, Samsung Internet)
    const isIOSDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !(window.navigator as any).standalone;
    if (isIOSDevice) {
      setShowIOSGuide(true);
    } else {
      setShowAndroidGuide(true);
    }
  }, [deferredPrompt]);

  // ─── Dispensar ──────────────────────────────────────────────────
  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    setShowIOSGuide(false);
    setShowAndroidGuide(false);
    // Guarda apenas na sessão para não insistir durante a navegação corrente
    sessionStorage.setItem(SESSION_DISMISS_KEY, 'true');
  }, []);

  // ─── Render: Não exibe se inativo ──────────────────────────────
  if (!showBanner) return null;

  // ─── iOS Guide (Apple Big Tech Style) ───────────────────────────
  if (showIOSGuide) {
    return (
      <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-fade-in font-poppins">
        <div className="relative w-full max-w-md bg-gradient-to-b from-[#141f36] via-[#0d1628] to-[#070c18] border border-white/15 rounded-3xl p-5 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85),0_0_35px_rgba(59,130,246,0.2)] text-white overflow-hidden animate-slide-up-pwa">
          {/* Ambient Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-56 h-20 bg-blue-500/25 blur-3xl rounded-full pointer-events-none" />

          {/* Top Handle on Mobile */}
          <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-4 sm:hidden" />

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[10px] font-bold uppercase tracking-widest shadow-sm">
              <Sparkles size={11} className="text-blue-400" />
              <span>Apple iOS • Experiência Nativa</span>
            </div>
            <button
              onClick={handleDismiss}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 active:scale-90 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all"
              title="Fechar"
            >
              <X size={15} />
            </button>
          </div>

          <div className="flex items-center gap-3.5 mb-4">
            <div className="relative shrink-0">
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-500 to-indigo-500 opacity-75 blur-sm animate-pulse" />
              <div className="relative w-14 h-14 rounded-2xl bg-slate-950 border border-white/20 p-1 flex items-center justify-center overflow-hidden shadow-xl">
                <img src="/duno-icon.png" alt="DUNO" className="w-full h-full rounded-xl object-cover" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-white tracking-tight leading-snug">
                DUNO Pro no seu iPhone
              </h3>
              <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
                Adicione à tela de início em apenas 2 passos rápidos:
              </p>
            </div>
          </div>

          {/* Step Cards */}
          <div className="space-y-2.5 mb-5">
            <div className="flex items-center gap-3 p-3 bg-white/[0.05] border border-white/10 rounded-2xl">
              <div className="w-7 h-7 rounded-xl bg-blue-600/30 border border-blue-400/30 text-blue-300 flex items-center justify-center font-black text-xs shrink-0">
                1
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-200">
                  Toque no ícone de <strong className="text-white">Compartilhar</strong> na barra inferior do Safari
                </p>
              </div>
              <div className="p-1.5 bg-white/10 rounded-lg text-blue-400 shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-white/[0.05] border border-white/10 rounded-2xl">
              <div className="w-7 h-7 rounded-xl bg-indigo-600/30 border border-indigo-400/30 text-indigo-300 flex items-center justify-center font-black text-xs shrink-0">
                2
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-200">
                  Role a lista e selecione <strong className="text-white">"Adicionar à Tela de Início"</strong>
                </p>
              </div>
              <div className="p-1.5 bg-white/10 rounded-lg text-indigo-400 shrink-0">
                <PlusSquare size={16} />
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleDismiss}
              className="w-full py-3.5 px-5 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-98 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30"
            >
              <CheckCircle2 size={16} />
              <span>Entendido, Vou Adicionar Agora</span>
            </button>
            <button
              onClick={handleDismiss}
              className="w-full text-center text-slate-400 hover:text-slate-200 text-xs font-semibold py-2 transition-colors active:scale-95"
            >
              Lembrar mais tarde
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Android Guide (Google Chrome / Edge / Samsung Internet) ────
  if (showAndroidGuide) {
    return (
      <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-fade-in font-poppins">
        <div className="relative w-full max-w-md bg-gradient-to-b from-[#141f36] via-[#0d1628] to-[#070c18] border border-white/15 rounded-3xl p-5 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85),0_0_35px_rgba(59,130,246,0.2)] text-white overflow-hidden animate-slide-up-pwa">
          {/* Ambient Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-56 h-20 bg-emerald-500/25 blur-3xl rounded-full pointer-events-none" />

          {/* Top Handle on Mobile */}
          <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-4 sm:hidden" />

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold uppercase tracking-widest shadow-sm">
              <Sparkles size={11} className="text-emerald-400" />
              <span>Google Android • Instalação Rápida</span>
            </div>
            <button
              onClick={handleDismiss}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 active:scale-90 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all"
              title="Fechar"
            >
              <X size={15} />
            </button>
          </div>

          <div className="flex items-center gap-3.5 mb-4">
            <div className="relative shrink-0">
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-blue-500 opacity-75 blur-sm animate-pulse" />
              <div className="relative w-14 h-14 rounded-2xl bg-slate-950 border border-white/20 p-1 flex items-center justify-center overflow-hidden shadow-xl">
                <img src="/duno-icon.png" alt="DUNO" className="w-full h-full rounded-xl object-cover" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-white tracking-tight leading-snug">
                DUNO Pro no seu Android
              </h3>
              <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
                Adicione à tela de início em apenas 2 toques:
              </p>
            </div>
          </div>

          {/* Step Cards */}
          <div className="space-y-2.5 mb-5">
            <div className="flex items-center gap-3 p-3 bg-white/[0.05] border border-white/10 rounded-2xl">
              <div className="w-7 h-7 rounded-xl bg-emerald-600/30 border border-emerald-400/30 text-emerald-300 flex items-center justify-center font-black text-xs shrink-0">
                1
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-200">
                  Toque no menu de opções <strong className="text-white">(ícone de 3 pontinhos ⋮)</strong> no topo direito do navegador
                </p>
              </div>
              <div className="p-1.5 bg-white/10 rounded-lg text-emerald-400 shrink-0">
                <MoreVertical size={16} />
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-white/[0.05] border border-white/10 rounded-2xl">
              <div className="w-7 h-7 rounded-xl bg-teal-600/30 border border-teal-400/30 text-teal-300 flex items-center justify-center font-black text-xs shrink-0">
                2
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-200">
                  Selecione <strong className="text-white">"Instalar aplicativo"</strong> ou <strong className="text-white">"Adicionar à tela inicial"</strong>
                </p>
              </div>
              <div className="p-1.5 bg-white/10 rounded-lg text-teal-400 shrink-0">
                <Download size={16} />
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleDismiss}
              className="w-full py-3.5 px-5 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-98 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30"
            >
              <CheckCircle2 size={16} />
              <span>Entendido, Vou Adicionar Agora</span>
            </button>
            <button
              onClick={handleDismiss}
              className="w-full text-center text-slate-400 hover:text-slate-200 text-xs font-semibold py-2 transition-colors active:scale-95"
            >
              Lembrar mais tarde
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Android / Chrome Install Bottom Sheet (Big Tech) ───────────
  return (
    <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-fade-in font-poppins">
      <div className="relative w-full max-w-md bg-gradient-to-b from-[#141f36] via-[#0d1628] to-[#070c18] border border-white/15 rounded-3xl p-5 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85),0_0_35px_rgba(59,130,246,0.2)] text-white overflow-hidden animate-slide-up-pwa">
        {/* Glow ambient light */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-56 h-20 bg-blue-500/25 blur-3xl rounded-full pointer-events-none" />

        {/* Top Handle on Mobile */}
        <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-4 sm:hidden" />

        {/* Top bar with Badge & Close Button */}
        <div className="flex items-center justify-between mb-4">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-widest shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>App Oficial • PWA Enterprise</span>
          </div>
          <button
            onClick={handleDismiss}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 active:scale-90 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all"
            title="Fechar"
          >
            <X size={15} />
          </button>
        </div>

        {/* Brand Header */}
        <div className="flex items-center gap-3.5 mb-4">
          <div className="relative shrink-0">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-500 to-indigo-500 opacity-75 blur-sm animate-pulse" />
            <div className="relative w-14 h-14 rounded-2xl bg-slate-950 border border-white/20 p-1 flex items-center justify-center overflow-hidden shadow-xl">
              <img src="/duno-icon.png" alt="DUNO" className="w-full h-full rounded-xl object-cover" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-white tracking-tight leading-snug">
              Instalar DUNO Pro
            </h3>
            <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
              Experiência nativa ultrarrápida direto na tela de início do seu celular.
            </p>
          </div>
        </div>

        {/* 3 Value Propositions (Pills / Mini Badges) */}
        <div className="grid grid-cols-3 gap-2 p-2.5 mb-5 bg-white/[0.04] border border-white/10 rounded-2xl">
          <div className="flex flex-col items-center text-center p-1.5">
            <div className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center mb-1">
              <Zap size={14} />
            </div>
            <span className="text-[10px] font-bold text-slate-200 leading-tight">Zero Latência</span>
            <span className="text-[8px] text-slate-400 leading-tight mt-0.5">Offline-Ready</span>
          </div>

          <div className="flex flex-col items-center text-center p-1.5 border-x border-white/10">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center mb-1">
              <Bell size={14} />
            </div>
            <span className="text-[10px] font-bold text-slate-200 leading-tight">Push em Tempo Real</span>
            <span className="text-[8px] text-slate-400 leading-tight mt-0.5">Alertas ao Vivo</span>
          </div>

          <div className="flex flex-col items-center text-center p-1.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center mb-1">
              <Smartphone size={14} />
            </div>
            <span className="text-[10px] font-bold text-slate-200 leading-tight">Tela Cheia</span>
            <span className="text-[8px] text-slate-400 leading-tight mt-0.5">Sem Navegador</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleInstall}
            disabled={isInstalling}
            className="w-full relative group overflow-hidden py-3.5 px-5 rounded-2xl font-bold text-sm tracking-wide text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 shadow-xl shadow-blue-600/30 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {/* Shimmer reflection */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
            {isInstalling ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Instalando Aplicativo...</span>
              </>
            ) : (
              <>
                <Download size={16} className="transition-transform group-hover:-translate-y-0.5" />
                <span>Instalar Aplicativo Agora</span>
              </>
            )}
          </button>

          <button
            onClick={handleDismiss}
            className="w-full text-center text-slate-400 hover:text-slate-200 text-xs font-semibold py-2 transition-colors active:scale-95 cursor-pointer"
          >
            Continuar no navegador por enquanto
          </button>
        </div>
      </div>
    </div>
  );
};
