import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────
type AlertType = 'error' | 'warning' | 'info' | 'success';

interface AlertState {
  title: string;
  text: string;
  type: AlertType;
}

interface ConfirmState {
  title: string;
  text: string;
  confirmText: string;
  cancelText: string;
  danger: boolean;
  onConfirm: () => void | Promise<void>;
}

interface DialogContextValue {
  showAlert: (text: string, type?: AlertType, title?: string) => void;
  showConfirm: (
    text: string,
    onConfirm: () => void | Promise<void>,
    title?: string,
    confirmText?: string,
    danger?: boolean,
    cancelText?: string
  ) => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────
const DialogContext = createContext<DialogContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────
export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alertState, setAlertState] = useState<AlertState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const showAlert = useCallback((text: string, type: AlertType = 'warning', title?: string) => {
    const defaultTitles: Record<AlertType, string> = {
      error: 'Erro',
      warning: 'Atenção',
      info: 'Informação',
      success: 'Sucesso',
    };
    setAlertState({ title: title ?? defaultTitles[type], text, type });
  }, []);

  const showConfirm = useCallback((
    text: string,
    onConfirm: () => void | Promise<void>,
    title = 'Confirmação',
    confirmText = 'Confirmar',
    danger = false,
    cancelText = 'Cancelar'
  ) => {
    setConfirmState({ title, text, onConfirm, confirmText, danger, cancelText });
  }, []);

  const handleConfirm = async () => {
    if (!confirmState) return;
    setConfirmState(null);
    await confirmState.onConfirm();
  };

  const iconMap: Record<AlertType, React.ReactNode> = {
    error: <AlertTriangle size={20} />,
    warning: <AlertTriangle size={20} />,
    info: <Info size={20} />,
    success: <CheckCircle2 size={20} />,
  };

  const colorMap: Record<AlertType, string> = {
    error: 'bg-rose-100 text-rose-600',
    warning: 'bg-amber-100 text-amber-600',
    info: 'bg-blue-100 text-blue-600',
    success: 'bg-emerald-100 text-emerald-600',
  };

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}

      {/* ── Alert Modal ───────────────────────────────────────────────────── */}
      {alertState && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6">
              <div className="flex gap-4 items-start">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${colorMap[alertState.type]}`}>
                  {iconMap[alertState.type]}
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-slate-900 mb-1">{alertState.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{alertState.text}</p>
                </div>
                <button onClick={() => setAlertState(null)} className="text-slate-400 hover:text-slate-600 transition-colors mt-0.5">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-3 flex justify-end border-t border-slate-100">
              <button
                onClick={() => setAlertState(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Modal ────────────────────────────────────────────────── */}
      {confirmState && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6">
              <div className="flex gap-4 items-start">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${confirmState.danger ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'}`}>
                  <AlertTriangle size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-slate-900 mb-1">{confirmState.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{confirmState.text}</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-3 flex justify-end gap-3 border-t border-slate-100">
              <button
                onClick={() => setConfirmState(null)}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                {confirmState.cancelText}
              </button>
              <button
                onClick={handleConfirm}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors text-white ${confirmState.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 hover:bg-slate-800'}`}
              >
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
export const useDialog = (): DialogContextValue => {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within <DialogProvider>');
  return ctx;
};
