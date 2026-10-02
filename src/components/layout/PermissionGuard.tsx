// ============================================================
// src/components/layout/PermissionGuard.tsx
// 🛡️ NEXUS — Route Permission Guard v1.0
//
// Bloqueia acesso direto por URL a páginas não autorizadas.
// Mostra tela de "Acesso Negado" em vez de redirecionar,
// para que o usuário entenda o motivo do bloqueio.
// ============================================================

import React from 'react';
import { ShieldOff, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePermissions, MenuKey } from '../../hooks/usePermissions';

interface PermissionGuardProps {
  /** Chave do menu que precisa de acesso para ver esta página */
  requiredMenu: MenuKey;
  children: React.ReactNode;
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({ requiredMenu, children }) => {
  const { canAccessMenu } = usePermissions();
  const navigate = useNavigate();

  // canAccessMenu já verifica isAdmin internamente
  if (canAccessMenu(requiredMenu)) {
    return <>{children}</>;
  }

  // Tela de acesso negado
  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-slate-50 p-8 text-center">
      <div className="max-w-md mx-auto">
        <div className="w-20 h-20 bg-rose-50 border-2 border-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <ShieldOff size={36} className="text-rose-400" />
        </div>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight mb-2">
          Acesso Restrito
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-8">
          Você não tem permissão para acessar esta página. Entre em contato com o administrador do sistema para solicitar o acesso necessário.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => navigate('/admin')}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-[#1c2d4f] text-white rounded-xl text-sm font-medium hover:bg-[#253a66] transition-all shadow-lg"
          >
            <ArrowLeft size={16} />
            Voltar ao Dashboard
          </button>
        </div>
        <div className="mt-8 inline-flex items-center gap-2 bg-rose-50 border border-rose-100 rounded-xl px-4 py-2">
          <ShieldOff size={12} className="text-rose-400" />
          <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">
            Permissão negada pelo grupo de acesso
          </span>
        </div>
      </div>
    </div>
  );
};
