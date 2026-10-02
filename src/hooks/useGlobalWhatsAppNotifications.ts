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

export function useGlobalWhatsAppNotifications(currentUserId: string | null, isAdmin: boolean, pathname: string) {
  const previousConversationsRef = useRef<Record<string, { historyLen: number, state: string, assigned: string | null }>>({});
  const isInitialLoad = useRef(true);
  const [alertCount, setAlertCount] = useState(0);

  // Limpa o contador se o usuário estiver na tela do WhatsApp
  useEffect(() => {
    if (pathname.includes('/admin/whatsapp')) {
      setAlertCount(0);
    }
  }, [pathname]);

  useEffect(() => {
    if (!isAdmin && !currentUserId) return;

    const processConversation = (conv: any, isInitial: boolean) => {
      const lastMsgTimestamp = conv.last_message_at || null;
      const prev = previousConversationsRef.current[conv.id];

      // Atualiza o cache local
      previousConversationsRef.current[conv.id] = {
        lastMsgTimestamp,
        state: conv.state,
        assigned: conv.assigned_agent_id
      };

      if (isInitial) return 0;

      const isNewToMe = !prev;
      const hasNewMsg = prev && lastMsgTimestamp && prev.lastMsgTimestamp && lastMsgTimestamp !== prev.lastMsgTimestamp;
      const assignedToMe = conv.assigned_agent_id === currentUserId && prev?.assigned !== currentUserId && currentUserId !== null && conv.state === 'HUMAN_ACTIVE';
      const askedForHuman = conv.state === 'WAITING_HUMAN' && prev?.state !== 'WAITING_HUMAN';

      if (isNewToMe || hasNewMsg || assignedToMe || askedForHuman) {
        const justAskedForHuman = askedForHuman || (isNewToMe && conv.state === 'WAITING_HUMAN');
        const userMsgWhileHuman = hasNewMsg && (conv.state === 'WAITING_HUMAN' || conv.state === 'HUMAN_ACTIVE');
        const justAssignedToMe = assignedToMe;

        let shouldNotify = false;
        if (justAssignedToMe) {
          shouldNotify = true;
        } else if (justAskedForHuman) {
          shouldNotify = true;
        } else if (userMsgWhileHuman) {
          if (conv.assigned_agent_id) {
            shouldNotify = (conv.assigned_agent_id === currentUserId);
          } else {
            shouldNotify = true;
          }
        }

        if (shouldNotify) {
          const isWhatsAppPage = window.location.pathname.includes('/admin/whatsapp');
          
          if (!isWhatsAppPage) {
            playBloop();
            flashTitle();
            
            if (justAssignedToMe) {
              sendBrowserNotification('💬 Chat Transferido!', `Um atendimento foi transferido para você.`);
            } else if (justAskedForHuman || userMsgWhileHuman) {
              sendBrowserNotification('💬 Duno WhatsApp', `${conv.phone_number || 'Cliente'}: Nova mensagem.`);
            }
            return 1; // 1 novo alerta
          }
        }
      }
      return 0;
    };

    const checkConversations = async () => {
      // 🔧 OTIMIZAÇÃO: Snapshot inicial apenas, Realtime cuida do resto sem HTTP
      const { data } = await supabase
        .from('whatsapp_conversations')
        .select('id, state, last_message_at, assigned_agent_id, phone_number')
        .or(`state.eq.WAITING_HUMAN,and(state.eq.HUMAN_ACTIVE,assigned_agent_id.eq.${currentUserId})`);

      if (!data) return;

      let incomingAlerts = 0;
      data.forEach(conv => {
        incomingAlerts += processConversation(conv, isInitialLoad.current);
      });

      isInitialLoad.current = false;
      
      if (incomingAlerts > 0) {
        setAlertCount(prev => prev + incomingAlerts);
      }
    };

    // Chamada inicial (HTTP Snapshot)
    checkConversations();

    // ⚡ Realtime Push Listener: Atualiza instantaneamente com payload (sem HTTP req!)
    const channel = supabase
      .channel(`global_wa_notifs_${currentUserId || 'all'}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_conversations'
      }, (payload) => {
        // 🔧 OTIMIZAÇÃO: Intercepta o evento em tempo real e não faz re-fetch
        if (payload.new && payload.new.id) {
          // Ignora mensagens que não são para mim ou que não estão aguardando
          const isWaiting = payload.new.state === 'WAITING_HUMAN';
          const isActiveMine = payload.new.state === 'HUMAN_ACTIVE' && payload.new.assigned_agent_id === currentUserId;
          
          if (isWaiting || isActiveMine) {
            const alerts = processConversation(payload.new, false);
            if (alerts > 0) {
              setAlertCount(prev => prev + alerts);
            }
          }
        }
      })
      .subscribe();

    // Polling de fallback a cada 60 segundos (em vez de 3s agressivo)
    const interval = setInterval(checkConversations, 60000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [currentUserId, isAdmin]);

  return { alertCount };
}
