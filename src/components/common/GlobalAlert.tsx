import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, X, CheckCircle, Info } from 'lucide-react';

export const GlobalAlertProvider: React.FC = () => {
  const [alerts, setAlerts] = useState<Array<{ id: number, message: string, type: 'error' | 'success' | 'info' }>>([]);

  useEffect(() => {
    // Override window.alert globally!
    const originalAlert = window.alert;
    window.alert = (msg: string) => {
       if (!msg) return;
       let type: 'error' | 'success' | 'info' = 'info';
       const lowerMsg = msg.toLowerCase();
       
       if (lowerMsg.includes('erro') || lowerMsg.includes('falha') || msg.includes('❌') || msg.includes('🚨') || msg.includes('⚠️')) {
         type = 'error';
       } else if (lowerMsg.includes('sucesso') || lowerMsg.includes('salvo') || msg.includes('✅')) {
         type = 'success';
       }
       
       // Limpa emojis e prefixos comuns que o dev usava nos alerts
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
       
       // Auto dismiss after 5 seconds
       setTimeout(() => {
         setAlerts(prev => prev.filter(a => a.id !== id));
       }, 5000);
    };

    return () => {
      window.alert = originalAlert;
    };
  }, []);

  if (alerts.length === 0) return null;

  return createPortal(
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
                <h4 className={`text-sm font-bold ${
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
    </div>,
    document.body
  );
};
