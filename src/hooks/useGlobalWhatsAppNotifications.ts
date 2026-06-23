import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import SessionStorage from '../lib/sessionStorage';

// --- Global Audio Setup ---
let audioCtx: AudioContext | null = null;
let titleFlashInterval: ReturnType<typeof setInterval> | null = null;

function initGlobalAudioUnlock() {
  if (typeof window === 'undefined') return;
  const unlock = () => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioCtx && Ctx) {
        audioCtx = new Ctx();
      }
      if (audioCtx?.state === 'suspended') {
        audioCtx.resume();
      }
    } catch (e) {}
  };
  ['click', 'keydown', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, unlock, { once: true });
  });
}

// Inicia imediatamente no carregamento do script
initGlobalAudioUnlock();

export function playBloop() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!audioCtx && Ctx) {
      audioCtx = new Ctx();
    }
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const g = audioCtx.createGain();
    g.connect(audioCtx.destination);

    // Frequências para o bip (880Hz e 1100Hz) com volume ajustado
    [[880, 0], [1100, 0.1]].forEach(([freq, delay]) => {
      const osc = audioCtx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq as number, audioCtx!.currentTime + delay);
      osc.connect(g);
      
      g.gain.setValueAtTime(0, audioCtx!.currentTime + delay);
      g.gain.linearRampToValueAtTime(0.5, audioCtx!.currentTime + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx!.currentTime + delay + 0.3);
      
      osc.start(audioCtx!.currentTime + delay);
      osc.stop(audioCtx!.currentTime + delay + 0.35);
    });
  } catch (e) {
    console.error('[Audio] Erro no playBloop:', e);
  }
}

export function flashTitle() {
  if (titleFlashInterval) return;
  let toggle = false;
  const original = document.title;
  titleFlashInterval = setInterval(() => {
    document.title = toggle ? '💬 Nova mensagem!' : original;
    toggle = !toggle;
  }, 900);
  const stop = () => {
    if (titleFlashInterval) clearInterval(titleFlashInterval);
    titleFlashInterval = null;
    document.title = original;
    window.removeEventListener('focus', stop);
  };
  window.addEventListener('focus', stop);
  setTimeout(stop, 30000);
}

export function sendBrowserNotification(title: string, body: string) {
  if (Notification.permission !== 'granted') return;
  if (!document.hidden) return; // só quando janela está em 2º plano
  try {
    const n = new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: 'duno-whatsapp',
      requireInteraction: false,
    });
    n.onclick = () => { 
        window.focus(); 
        n.close(); 
        // Se puder, redireciona para a aba do WhatsApp
        const currentPath = window.location.pathname;
        if (!currentPath.includes('/admin/whatsapp')) {
            window.location.href = '/admin/whatsapp';
        }
    };
    setTimeout(() => n.close(), 6000);
  } catch (_) {}
}

export function useGlobalWhatsAppNotifications(currentUserId: string | null, isAdmin: boolean) {
  const previousConversationsRef = useRef<Record<string, { historyLen: number, state: string, assigned: string | null }>>({});
  const isInitialLoad = useRef(true);
  const [alertCount, setAlertCount] = useState(0);

  // Limpa o contador se o usuário estiver na tela do WhatsApp
  useEffect(() => {
    const checkPath = () => {
      if (window.location.pathname.includes('/admin/whatsapp')) {
        setAlertCount(0);
      }
    };
    checkPath();
    window.addEventListener('popstate', checkPath);
    return () => window.removeEventListener('popstate', checkPath);
  }, []);

  useEffect(() => {
    if (!isAdmin && !currentUserId) return;

    const checkConversations = async () => {
      // Pega conversas esperando humano ou ativas comigo
      const { data } = await supabase
        .from('whatsapp_conversations')
        .select('id, state, history, assigned_agent_id, phone_number')
        .or(`state.eq.WAITING_HUMAN,and(state.eq.HUMAN_ACTIVE,assigned_agent_id.eq.${currentUserId})`);

      if (!data) return;

      const currentMap: Record<string, any> = {};
      let incomingAlerts = 0;
      
      data.forEach(conv => {
        const history = conv.history as any[] || [];
        currentMap[conv.id] = {
          historyLen: history.length,
          state: conv.state,
          assigned: conv.assigned_agent_id
        };

        const prev = previousConversationsRef.current[conv.id];
        
        // Avalia notificações apenas se não for a carga inicial
        if (!isInitialLoad.current) {
          const isNewToMe = !prev; // Conversa nova que acabou de cair na fila ou ser atribuída
          const historyGrew = prev && history.length > prev.historyLen;
          const assignedToMe = conv.assigned_agent_id === currentUserId && prev?.assigned !== currentUserId && currentUserId !== null;
          const askedForHuman = conv.state === 'WAITING_HUMAN' && prev?.state !== 'WAITING_HUMAN';

          if (isNewToMe || historyGrew || assignedToMe || askedForHuman) {
              const newMsgs = historyGrew ? history.slice(prev.historyLen) : [history[history.length - 1] || {}];
              const hasUserMsg = newMsgs.some((m: any) => m.role === 'user');
              
              const justAskedForHuman = askedForHuman || (isNewToMe && conv.state === 'WAITING_HUMAN');
              const userMsgWhileHuman = hasUserMsg && (conv.state === 'WAITING_HUMAN' || conv.state === 'HUMAN_ACTIVE');
              const justAssignedToMe = assignedToMe;

              if (justAskedForHuman || userMsgWhileHuman || justAssignedToMe) {
                const isWhatsAppPage = window.location.pathname.includes('/admin/whatsapp');
                
                if (!isWhatsAppPage) {
                  playBloop();
                  flashTitle();
                  incomingAlerts++;
                }
                
                if (justAssignedToMe) {
                  sendBrowserNotification('💬 Chat Transferido!', `Um atendimento foi transferido para você.`);
                } else if (justAskedForHuman || userMsgWhileHuman) {
                  const previewMsg = newMsgs.find((m:any) => m.role === 'user')?.content || 'Cliente solicitou atendimento.';
                  const preview = String(previewMsg).substring(0, 60);
                  sendBrowserNotification('💬 Duno WhatsApp', `${conv.phone_number}: ${preview}`);
                }
              }
          }
        }
      });

      previousConversationsRef.current = currentMap;
      isInitialLoad.current = false;
      
      if (incomingAlerts > 0) {
        setAlertCount(prev => prev + incomingAlerts);
      }
    };

    // Chamada inicial
    checkConversations();

    // Polling a cada 3 segundos
    const interval = setInterval(checkConversations, 3000);

    return () => clearInterval(interval);
  }, [currentUserId, isAdmin]);

  return { alertCount };
}
