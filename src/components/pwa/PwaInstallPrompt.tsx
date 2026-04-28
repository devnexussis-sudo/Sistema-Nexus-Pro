/**
 * ============================================
 * PWA Install Prompt — Mobile Only
 * ============================================
 * 
 * Exibe o banner de instalação PWA APENAS em dispositivos móveis.
 * Em desktops, este componente é completamente inerte (renderiza null).
 * 
 * Comportamento:
 * - Detecta se o dispositivo é móvel via User-Agent + touch + screen width
 * - Escuta o evento `beforeinstallprompt` do browser
 * - Mostra um banner elegante para instalar como app
 * - Após instalado ou dispensado, não mostra novamente (localStorage)
 * - Se já está rodando como PWA (standalone), nunca mostra
 * 
 * NOTA: Não interfere em NADA no desktop — zero side effects.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Download, Smartphone } from 'lucide-react';

// ─── Detecção de Dispositivo Móvel ───────────────────────────────────
const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;

  // Check 1: User-Agent
  const ua = navigator.userAgent || '';
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i.test(ua);

  // Check 2: Touch capability
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Check 3: Screen width (< 1024px = tablet/phone territory)
  const smallScreen = window.innerWidth < 1024;

  // Precisa de pelo menos 2 dos 3 sinais
  const signals = [mobileUA, hasTouch, smallScreen].filter(Boolean).length;
  return signals >= 2;
};

// Verifica se já está rodando como PWA instalada (standalone mode)
const isRunningAsPwa = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
};

const DISMISS_KEY = 'nexus-pwa-dismissed';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

export const PwaInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const promptRef = useRef<any>(null);

  // ─── Setup: Escuta o beforeinstallprompt ─────────────────────────
  useEffect(() => {
    // Guard: Apenas mobile, não já instalado, não dispensado recentemente
    if (!isMobileDevice()) return;
    if (isRunningAsPwa()) return;

    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      if (Date.now() - dismissedAt < DISMISS_DURATION_MS) return;
    }

    // iOS não suporta beforeinstallprompt — mostra guia manual
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !(window.navigator as any).standalone;
    if (isIOS) {
      // Delay para não aparecer imediatamente (UX)
      const timer = setTimeout(() => {
        setShowIOSGuide(true);
        setShowBanner(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    // Android/Chrome: Captura o evento nativo
    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e;
      setDeferredPrompt(e);
      // Delay para UX: mostra depois do app carregar
      setTimeout(() => setShowBanner(true), 2000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  // ─── Instalar (Android/Chrome) ──────────────────────────────────
  const handleInstall = useCallback(async () => {
    const prompt = promptRef.current || deferredPrompt;
    if (!prompt) return;

    setIsInstalling(true);
    try {
      prompt.prompt();
      const result = await prompt.userChoice;
      if (result.outcome === 'accepted') {
        setShowBanner(false);
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      }
    } catch (err) {
      console.warn('[PWA] Install prompt error:', err);
    } finally {
      setIsInstalling(false);
      setDeferredPrompt(null);
      promptRef.current = null;
    }
  }, [deferredPrompt]);

  // ─── Dispensar ──────────────────────────────────────────────────
  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  }, []);

  // ─── Render: Nada se não deve mostrar ───────────────────────────
  if (!showBanner) return null;

  // ─── iOS Guide ──────────────────────────────────────────────────
  if (showIOSGuide) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 animate-slide-up-pwa">
        <div className="bg-[#1c2d4f] rounded-2xl shadow-2xl p-4 mx-auto max-w-md border border-white/10">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-white/10 rounded-xl shrink-0">
              <img src="/duno-icon.png" alt="DUNO" className="w-10 h-10 rounded-lg" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-bold text-sm">Instale o DUNO Admin</h3>
              <p className="text-white/60 text-xs mt-1 leading-relaxed">
                Toque no botão <span className="inline-flex items-center bg-white/10 px-1.5 py-0.5 rounded text-white/90 font-bold text-[10px]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                  Compartilhar
                </span> e depois em <span className="font-bold text-white/90">"Adicionar à Tela Inicial"</span>
              </p>
            </div>
            <button 
              onClick={handleDismiss}
              className="p-1.5 text-white/30 hover:text-white/60 transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Android/Chrome Install Banner ──────────────────────────────
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 animate-slide-up-pwa">
      <div className="bg-[#1c2d4f] rounded-2xl shadow-2xl p-4 mx-auto max-w-md border border-white/10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-xl shrink-0">
            <img src="/duno-icon.png" alt="DUNO" className="w-10 h-10 rounded-lg" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-bold text-sm">Instalar DUNO Admin</h3>
            <p className="text-white/50 text-[11px] mt-0.5">Acesso rápido direto da sua tela inicial</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDismiss}
              className="px-3 py-2 text-white/40 hover:text-white/70 text-xs font-bold transition-colors"
            >
              Agora não
            </button>
            <button
              onClick={handleInstall}
              disabled={isInstalling}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-white text-[#1c2d4f] rounded-xl text-xs font-black transition-all hover:bg-white/90 active:scale-95 disabled:opacity-50 shadow-lg shadow-black/20"
            >
              {isInstalling ? (
                <div className="w-4 h-4 border-2 border-[#1c2d4f]/20 border-t-[#1c2d4f] rounded-full animate-spin" />
              ) : (
                <Download size={14} />
              )}
              Instalar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
