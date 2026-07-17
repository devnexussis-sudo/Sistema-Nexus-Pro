import React, { useState, useEffect } from 'react';
import { BellRing, Check, X } from 'lucide-react';

export const PwaNotificationPrompt: React.FC = () => {
  const [show, setShow] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Verifica se o app está rodando em modo PWA instalado (Standalone)
    const checkStandalone = () => {
      const isIOS = ('standalone' in navigator) && (navigator as any).standalone;
      const isAndroid = window.matchMedia('(display-mode: standalone)').matches;
      return isIOS || isAndroid;
    };

    const standalone = checkStandalone();
    setIsStandalone(standalone);

    // Se estiver instalado e as notificações não tiverem sido pedidas ainda (default)
    if (standalone && 'Notification' in window) {
      if (Notification.permission === 'default') {
        // Mostra o modal de forçar notificação
        setShow(true);
      }
    }
  }, []);

  const handleRequestPermission = async () => {
    if (!('Notification' in window)) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setShow(false);
        // Opcional: mostrar um toast de sucesso, mas sumir a tela já basta
      } else {
        // Se negar, escondemos também, pois não podemos pedir de novo via API
        // mas o ideal é orientar o usuário a ir nas configurações
        setShow(false);
      }
    } catch (e) {
      console.error('[PwaNotificationPrompt] Erro ao pedir permissão:', e);
      setShow(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-500">
        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4 text-indigo-600 shadow-inner relative overflow-hidden">
          <div className="absolute inset-0 bg-indigo-200 animate-ping opacity-20"></div>
          <BellRing size={32} className="animate-bounce" />
        </div>
        
        <h2 className="text-xl font-bold text-slate-800 font-poppins mb-2">Ative as Notificações</h2>
        
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          Para que o sistema funcione perfeitamente no seu celular e você receba os alertas de novas mensagens e atualizações, precisamos que você permita as notificações.
        </p>

        <div className="w-full flex flex-col gap-3">
          <button
            onClick={handleRequestPermission}
            className="w-full bg-indigo-600 text-white font-bold text-sm py-3.5 rounded-xl hover:bg-indigo-700 active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2"
          >
            <Check size={18} />
            Habilitar Agora
          </button>
          
          <button
            onClick={() => setShow(false)}
            className="w-full bg-slate-50 text-slate-500 font-bold text-sm py-3 rounded-xl hover:bg-slate-100 active:scale-95 transition-all"
          >
            Talvez Mais Tarde
          </button>
        </div>
      </div>
    </div>
  );
};
