/**
 * ============================================
 * PWA Install Prompt — Big Tech Modern Mobile
 * ============================================
 * 
 * Design limpo, corporativo e padrão Big Tech (Apple / Google),
 * perfeitamente alinhado com a identidade visual do DUNO (Navy #1c2d4f).
 * Sem efeitos futurísticos/neon excessivos.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Download, Smartphone, Zap, Bell, CheckCircle2,
  PlusSquare, MoreVertical, Share2
} from 'lucide-react';

// ─── Detecção de Dispositivo Móvel ───────────────────────────────────
export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;

  const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i.test(ua);
  const hasTouch = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
  const smallScreen = window.innerWidth <= 1024;

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
    // 1. Limpa resquícios antigos do localStorage que bloqueavam por 3 dias
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
    // Guarda apenas na sessão para não incomodar durante a navegação corrente
    sessionStorage.setItem(SESSION_DISMISS_KEY, 'true');
  }, []);

  // ─── Render: Não exibe se inativo ──────────────────────────────
  if (!showBanner) return null;

  // ─── iOS Guide (Apple Safari Style) ─────────────────────────────
  if (showIOSGuide) {
    return (
      <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in font-poppins">
        <div className="relative w-full max-w-md bg-white border border-slate-200/90 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-[0_-10px_40px_rgba(28,45,79,0.15),0_20px_40px_rgba(0,0,0,0.12)] text-slate-900 overflow-hidden animate-slide-up-pwa">
          {/* Top Handle on Mobile */}
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-[#1c2d4f] text-[11px] font-semibold tracking-wide">
              <span>Apple iOS • Safari</span>
            </div>
            <button
              onClick={handleDismiss}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-90 border border-slate-200/80 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
              title="Fechar"
            >
              <X size={15} />
            </button>
          </div>

          <div className="flex items-center gap-3.5 mb-5">
            <div className="w-13 h-13 rounded-2xl bg-white border border-slate-200 p-1 flex items-center justify-center shadow-xs shrink-0">
              <img src="/duno-icon.png" alt="DUNO" className="w-full h-full rounded-xl object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-slate-900 tracking-tight leading-snug">
                DUNO Pro no seu iPhone
              </h3>
              <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">
                Adicione à tela de início em apenas 2 toques pelo Safari:
              </p>
            </div>
          </div>

          {/* Step Cards */}
          <div className="space-y-2.5 mb-5">
            <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200/70 rounded-2xl">
              <div className="w-7 h-7 rounded-xl bg-[#1c2d4f] text-white flex items-center justify-center font-bold text-xs shrink-0">
                1
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-700 leading-relaxed">
                  Toque no ícone de <strong className="text-slate-900 font-semibold">Compartilhar</strong> na barra inferior do Safari
                </p>
              </div>
              <div className="p-2 bg-white border border-slate-200 rounded-xl text-[#1c2d4f] shrink-0 shadow-2xs">
                <Share2 size={16} />
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200/70 rounded-2xl">
              <div className="w-7 h-7 rounded-xl bg-[#1c2d4f] text-white flex items-center justify-center font-bold text-xs shrink-0">
                2
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-700 leading-relaxed">
                  Role o menu e selecione <strong className="text-slate-900 font-semibold">"Adicionar à Tela de Início"</strong>
                </p>
              </div>
              <div className="p-2 bg-white border border-slate-200 rounded-xl text-[#1c2d4f] shrink-0 shadow-2xs">
                <PlusSquare size={16} />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleDismiss}
              className="w-full py-3.5 px-5 rounded-xl font-semibold text-sm text-white bg-[#1c2d4f] hover:bg-[#162441] active:bg-[#121d33] transition-all flex items-center justify-center gap-2 shadow-md shadow-[#1c2d4f]/20 cursor-pointer"
            >
              <CheckCircle2 size={16} />
              <span>Entendido, Vou Adicionar Agora</span>
            </button>
            <button
              onClick={handleDismiss}
              className="w-full text-center text-slate-500 hover:text-slate-800 text-xs font-medium py-1.5 transition-colors cursor-pointer"
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
      <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in font-poppins">
        <div className="relative w-full max-w-md bg-white border border-slate-200/90 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-[0_-10px_40px_rgba(28,45,79,0.15),0_20px_40px_rgba(0,0,0,0.12)] text-slate-900 overflow-hidden animate-slide-up-pwa">
          {/* Top Handle on Mobile */}
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-[#1c2d4f] text-[11px] font-semibold tracking-wide">
              <span>Google Android • Navegador</span>
            </div>
            <button
              onClick={handleDismiss}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-90 border border-slate-200/80 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
              title="Fechar"
            >
              <X size={15} />
            </button>
          </div>

          <div className="flex items-center gap-3.5 mb-5">
            <div className="w-13 h-13 rounded-2xl bg-white border border-slate-200 p-1 flex items-center justify-center shadow-xs shrink-0">
              <img src="/duno-icon.png" alt="DUNO" className="w-full h-full rounded-xl object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-slate-900 tracking-tight leading-snug">
                DUNO Pro no seu Android
              </h3>
              <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">
                Adicione à tela de início em apenas 2 toques:
              </p>
            </div>
          </div>

          {/* Step Cards */}
          <div className="space-y-2.5 mb-5">
            <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200/70 rounded-2xl">
              <div className="w-7 h-7 rounded-xl bg-[#1c2d4f] text-white flex items-center justify-center font-bold text-xs shrink-0">
                1
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-700 leading-relaxed">
                  Toque no menu de opções <strong className="text-slate-900 font-semibold">(ícone de 3 pontinhos ⋮)</strong> no topo do navegador
                </p>
              </div>
              <div className="p-2 bg-white border border-slate-200 rounded-xl text-[#1c2d4f] shrink-0 shadow-2xs">
                <MoreVertical size={16} />
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200/70 rounded-2xl">
              <div className="w-7 h-7 rounded-xl bg-[#1c2d4f] text-white flex items-center justify-center font-bold text-xs shrink-0">
                2
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-700 leading-relaxed">
                  Selecione <strong className="text-slate-900 font-semibold">"Instalar aplicativo"</strong> ou <strong className="text-slate-900 font-semibold">"Adicionar à tela inicial"</strong>
                </p>
              </div>
              <div className="p-2 bg-white border border-slate-200 rounded-xl text-[#1c2d4f] shrink-0 shadow-2xs">
                <Download size={16} />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleDismiss}
              className="w-full py-3.5 px-5 rounded-xl font-semibold text-sm text-white bg-[#1c2d4f] hover:bg-[#162441] active:bg-[#121d33] transition-all flex items-center justify-center gap-2 shadow-md shadow-[#1c2d4f]/20 cursor-pointer"
            >
              <CheckCircle2 size={16} />
              <span>Entendido, Vou Adicionar Agora</span>
            </button>
            <button
              onClick={handleDismiss}
              className="w-full text-center text-slate-500 hover:text-slate-800 text-xs font-medium py-1.5 transition-colors cursor-pointer"
            >
              Lembrar mais tarde
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Bottom Sheet Principal (Big Tech Clean Modern) ─────────────
  return (
    <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in font-poppins">
      <div className="relative w-full max-w-md bg-white border border-slate-200/90 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-[0_-10px_40px_rgba(28,45,79,0.15),0_20px_40px_rgba(0,0,0,0.12)] text-slate-900 overflow-hidden animate-slide-up-pwa">
        {/* Top Handle on Mobile */}
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />

        {/* Top bar with Badge & Close Button */}
        <div className="flex items-center justify-between mb-4">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-[#1c2d4f] text-[11px] font-semibold tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Aplicativo Oficial • PWA</span>
          </div>
          <button
            onClick={handleDismiss}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-90 border border-slate-200/80 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
            title="Fechar"
          >
            <X size={15} />
          </button>
        </div>

        {/* Brand Header */}
        <div className="flex items-center gap-3.5 mb-4">
          <div className="w-13 h-13 rounded-2xl bg-white border border-slate-200 p-1 flex items-center justify-center shadow-xs shrink-0">
            <img src="/duno-icon.png" alt="DUNO" className="w-full h-full rounded-xl object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-900 tracking-tight leading-snug">
              Instalar DUNO Pro
            </h3>
            <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">
              Acesse com rapidez direto da tela de início, sem barras de navegador.
            </p>
          </div>
        </div>

        {/* 3 Value Propositions */}
        <div className="grid grid-cols-3 gap-2.5 my-4">
          <div className="flex flex-col items-center text-center p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="w-8 h-8 rounded-xl bg-white border border-slate-200/70 text-[#1c2d4f] flex items-center justify-center mb-1.5 shadow-2xs">
              <Zap size={15} />
            </div>
            <span className="text-[11px] font-semibold text-slate-800 leading-tight">Mais Rápido</span>
            <span className="text-[9px] text-slate-400 leading-tight mt-0.5">Zero latência</span>
          </div>

          <div className="flex flex-col items-center text-center p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="w-8 h-8 rounded-xl bg-white border border-slate-200/70 text-emerald-600 flex items-center justify-center mb-1.5 shadow-2xs">
              <Bell size={15} />
            </div>
            <span className="text-[11px] font-semibold text-slate-800 leading-tight">Notificações</span>
            <span className="text-[9px] text-slate-400 leading-tight mt-0.5">Alertas ao vivo</span>
          </div>

          <div className="flex flex-col items-center text-center p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="w-8 h-8 rounded-xl bg-white border border-slate-200/70 text-[#1c2d4f] flex items-center justify-center mb-1.5 shadow-2xs">
              <Smartphone size={15} />
            </div>
            <span className="text-[11px] font-semibold text-slate-800 leading-tight">Tela Cheia</span>
            <span className="text-[9px] text-slate-400 leading-tight mt-0.5">Experiência app</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 mt-2">
          <button
            onClick={handleInstall}
            disabled={isInstalling}
            className="w-full py-3.5 px-5 rounded-xl font-semibold text-sm text-white bg-[#1c2d4f] hover:bg-[#162441] active:bg-[#121d33] shadow-md shadow-[#1c2d4f]/20 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {isInstalling ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Instalando Aplicativo...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>Instalar Aplicativo Agora</span>
              </>
            )}
          </button>

          <button
            onClick={handleDismiss}
            className="w-full text-center text-slate-500 hover:text-slate-800 text-xs font-medium py-2 transition-colors cursor-pointer"
          >
            Continuar no navegador por enquanto
          </button>
        </div>
      </div>
    </div>
  );
};
