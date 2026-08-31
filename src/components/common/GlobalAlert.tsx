import React, { useState, useEffect } from 'react';
import { safeCreatePortal } from '../../utils/portal';
import { AlertCircle, X, CheckCircle, Info } from 'lucide-react';

// Substitui window.alert globalmente por toast notifications no padrão Nexus.
// Para window.confirm, use o hook useDialog() do DialogContext.
export const GlobalAlertProvider: React.FC = () => {
  const [alerts, setAlerts] = useState<Array<{ id: number, message: string, type: 'error' | 'success' | 'info' }>>([]);

  useEffect(() => {
    const originalAlert = window.alert;
    window.alert = (msg: string) => {
       if (!msg) return;
       let type: 'error' | 'success' | 'info' = 'info';
       const lowerMsg = msg.toLowerCase();
       
       if (lowerMsg.includes('erro') || lowerMsg.includes('falha') || msg.includes('❌') || msg.includes('🚨') || msg.includes('⚠️')) {
         type = 'error';
       } else if (lowerMsg.includes('sucesso') || lowerMsg.includes('salvo') || lowerMsg.includes('gerado') || msg.includes('✅')) {
         type = 'success';
       } else if (lowerMsg.includes('atenção') || lowerMsg.includes('atencao') || lowerMsg.includes('aviso')) {
         type = 'error'; // warnings aparecem como error para dar visibilidade
       }
       
       const cleanMsg = msg
         .replace(/✅|❌|🚨|⚠️/g, '')
         .replace(/^\[ERRO DE BANCO DE DADOS\]\n\n/, '')
         .replace(/^ERRO AO SALVAR USUÁRIO:\n/, '')
         .replace(/^ERRO AO REMOVER USUÁRIO:\n/, '')
         .replace(/^Erro ao salvar grupo: /, '')
         .replace(/^Erro ao remover grupo: /, '')
         .trim();

       const id = Date.now() + Math.random();
       setAlerts(prev => [...prev, { id, message: cleanMsg, type }]);
       
       setTimeout(() => {
         setAlerts(prev => prev.filter(a => a.id !== id));
       }, 6000);
    };

    return () => {
      window.alert = originalAlert;
    };
  }, []);

  useEffect(() => {
    const handleSlowNetwork = () => {
      const id = Date.now() + Math.random();
      setAlerts(prev => {
        // Prevent duplicate slow network warnings
        if (prev.some(a => a.message.includes('conexão está lenta'))) return prev;
        return [...prev, { id, message: 'Sua conexão está lenta, estamos tentando reconectar...', type: 'info' }];
      });
      setTimeout(() => {
        setAlerts(prev => prev.filter(a => a.id !== id));
      }, 8000);
    };

    window.addEventListener('NEXUS_SLOW_NETWORK_WARNING', handleSlowNetwork);
    return () => {
      window.removeEventListener('NEXUS_SLOW_NETWORK_WARNING', handleSlowNetwork);
    };
  }, []);

  if (alerts.length === 0) return null;

  return safeCreatePortal(
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {alerts.map(alert => (
        <div key={alert.id} className={`pointer-events-auto p-4 rounded-xl shadow-2xl border flex items-start gap-3 transform transition-all duration-300 animate-fade-in ${
          alert.type === 'error' ? 'bg-white border-rose-500/20 shadow-rose-500/10' :
          alert.type === 'success' ? 'bg-white border-emerald-500/20 shadow-emerald-500/10' :
          'bg-white border-[#1c2d4f]/20 shadow-[#1c2d4f]/10'
        }`}>
          <div className="shrink-0 mt-0.5">
            {alert.type === 'error' && <AlertCircle size={20} className="text-rose-500" />}
            {alert.type === 'success' && <CheckCircle size={20} className="text-emerald-500" />}
            {alert.type === 'info' && <Info size={20} className="text-[#1c2d4f]" />}
          </div>
          <div className="flex-1">
            <h4 className={`text-sm font-semibold ${
              alert.type === 'error' ? 'text-rose-700' :
              alert.type === 'success' ? 'text-emerald-700' :
              'text-[#1c2d4f]'
            }`}>
              {alert.type === 'error' ? 'Atenção!' : alert.type === 'success' ? 'Sucesso!' : 'Aviso do Sistema'}
            </h4>
            <p className="text-xs font-medium text-slate-600 mt-1 whitespace-pre-wrap leading-relaxed">{alert.message}</p>
          </div>
          <button onClick={() => setAlerts(prev => prev.filter(a => a.id !== alert.id))} className="text-slate-400 hover:text-slate-600 p-1 shrink-0 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};
