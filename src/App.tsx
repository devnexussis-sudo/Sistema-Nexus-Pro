
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PublicApp } from './apps/public/PublicApp';
import { AdminApp } from './apps/admin/AdminApp';
import { AdminLogin } from './components/admin/AdminLogin';
import { MasterLogin } from './components/admin/MasterLogin';
import { SuperAdminPage } from './components/admin/SuperAdminPage';
import { ResetPassword } from './components/admin/ResetPassword';
import { NotFoundPage } from './pages/NotFoundPage';
import SessionStorage from './lib/sessionStorage';
import { DataService } from './services/dataService';

// Wrapper para rotas públicas
const PublicAppWrapper: React.FC<{ type: 'order' | 'quote' }> = ({ type }) => {
  const { id } = useParams<{ id: string }>();
  console.log('[PublicAppWrapper] 🌍 Abrindo viewer público:', { type, id });

  if (!id) {
    console.error('[PublicAppWrapper] ❌ ID não encontrado na URL');
    return <div className="p-8 text-center">ID inválido</div>;
  }

  return <PublicApp publicOrderId={type === 'order' ? id : null} publicQuoteId={type === 'quote' ? id : null} />;
};

// Componente Interno que usa o AuthContext
const AppRoutes: React.FC = () => {
  const { auth, isInitializing, login, logout } = useAuth();
  const [isMasterAuthenticated, setIsMasterAuthenticated] = useState(false);
  const [isSuperMode, setIsSuperMode] = useState(false);
  const [systemNotifications, setSystemNotifications] = useState<any[]>([]);
  const [isImpersonating, setIsImpersonating] = useState(false);

  // Carregar notificações do sistema se autenticado
  useEffect(() => {
    if (auth.isAuthenticated && auth.user && !isSuperMode) {
      DataService.getUnreadSystemNotifications(auth.user.id)
        .then(setSystemNotifications)
        .catch(err => console.error("Falha ao buscar notificações:", err));
    }
  }, [auth.isAuthenticated, auth.user, isSuperMode]);

  // Rendeiza logo a UI, confiando no splashscreen do index.html para cobrir o carregamento inicial

  return (
    <Routes>
      {/* PUBLIC ROUTES */}
      <Route path="/view/:id" element={<PublicAppWrapper type="order" />} />
      <Route path="/view-quote/:id" element={<PublicAppWrapper type="quote" />} />

      {/* MASTER ADMIN */}
      <Route path="/master" element={
        !isMasterAuthenticated ?
          <MasterLogin onLogin={() => { SessionStorage.set('master_session_v2', true); setIsMasterAuthenticated(true); setIsSuperMode(true); }} onCancel={() => window.location.href = '/'} /> :
          <SuperAdminPage onLogout={() => { SessionStorage.remove('master_session_v2'); setIsMasterAuthenticated(false); setIsSuperMode(false); window.location.href = '/'; }} />
      } />

      {/* ADMIN ROUTES - Note como auth é passado via Context agora, mas AdminApp ainda espera props por compatibilidade */}
      <Route path="/admin/*" element={
        auth.isAuthenticated ?
          <AdminApp
            auth={auth} // Mantendo prop por enquanto para não quebrar AdminApp (Refatoração gradual)
            onLogin={login}
            onLogout={async () => { await logout(); window.location.href = '/'; }}
            isImpersonating={isImpersonating}
            onToggleMaster={() => { }}
            systemNotifications={systemNotifications}
            onMarkNotificationRead={() => { }}
          /> :
          <Navigate to="/login" replace />
      } />

      {/* LOGIN */}
      <Route path="/login" element={
        auth.isAuthenticated ? <Navigate to="/admin" replace /> :
          <AdminLogin onLogin={login} onToggleMaster={() => { }} />
      } />

      {/* RESET PASSWORD */}
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* ROOT REDIRECT */}
      <Route path="/" element={<Navigate to={auth.isAuthenticated ? "/admin" : "/login"} replace />} />

      {/* DEFAULT CATCH-ALL */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <HashRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  );
};

export default App;
