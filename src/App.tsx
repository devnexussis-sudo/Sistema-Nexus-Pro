
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useParams, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DialogProvider } from './contexts/DialogContext';
import { PublicApp } from './apps/public/PublicApp';
import { AdminApp } from './apps/admin/AdminApp';
import { AdminLogin } from './components/admin/AdminLogin';
import { MasterLogin } from './components/admin/MasterLogin';
import { SuperAdminPage } from './components/admin/SuperAdminPage';
import { ResetPassword } from './components/admin/ResetPassword';
import { NotFoundPage } from './pages/NotFoundPage';
import SessionStorage from './lib/sessionStorage';
import { DataService } from './services/dataService';
import { PwaInstallPrompt } from './components/pwa/PwaInstallPrompt';
import { PwaNotificationPrompt } from './components/pwa/PwaNotificationPrompt';
import { NetworkStatusIndicator } from './components/common/NetworkStatusIndicator';
import { GlobalAlertProvider } from './components/common/GlobalAlert';
import { GlobalSpinnerProvider } from './components/common/GlobalSpinner';
import { I18nProvider } from './i18n';

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
  const [isMasterAuthenticated, setIsMasterAuthenticated] = useState(
    () => !!SessionStorage.get<boolean>('master_session_v2')
  );
  const [isSuperMode, setIsSuperMode] = useState(
    () => !!SessionStorage.get<boolean>('master_session_v2')
  );
  const [systemNotifications, setSystemNotifications] = useState<any[]>([]);
  const [isImpersonating, setIsImpersonating] = useState(false);

  // Carregar notificações do sistema se autenticado
  useEffect(() => {
    if (auth.isAuthenticated && auth.user && !isSuperMode) {
      DataService.getSystemNotifications(auth.user.id)
        .then(setSystemNotifications)
        .catch(err => console.error("Falha ao buscar notificações:", err));
    }
  }, [auth.isAuthenticated, auth.user, isSuperMode]);

  // 🛡️ RECOVERY INTERCEPTOR: Se cair no root com token de recovery, redireciona preservando o hash
  const navigate = useNavigate();
  useEffect(() => {
    const hash = window.location.hash;

    // Se o hash contém tokens de recovery mas não estamos na rota certa
    if (hash.includes('type=recovery') && !hash.includes('reset-password')) {
      console.log('[RecoveryInterceptor] Detectado lander de recuperação. Redirecionando para /reset-password...');
      // Nós recriamos a URL do hash para o router entender
      const newHash = '#/reset-password' + hash.replace('#', '&');
      window.location.hash = newHash;
    }
  }, []);

  // Rendeiza logo a UI, confiando no splashscreen do index.html para cobrir o carregamento inicial

  return (
    <Routes>
      {/* PUBLIC ROUTES */}
      <Route path="/order/view/:id" element={<PublicAppWrapper type="order" />} />
      <Route path="/view-quote/:id" element={<PublicAppWrapper type="quote" />} />
      <Route path="/view/:id" element={<PublicAppWrapper type="quote" />} />

      {/* MASTER ADMIN — rota dinâmica via env (não exposta no código-fonte compilado visível) */}
      <Route path={`/${import.meta.env.VITE_MASTER_ROUTE_KEY || 'master'}`} element={
        !isMasterAuthenticated ?
          <MasterLogin onLogin={() => { SessionStorage.set('master_session_v2', true); setIsMasterAuthenticated(true); setIsSuperMode(true); }} onCancel={() => window.location.href = '/'} /> :
          <SuperAdminPage onLogout={() => { SessionStorage.remove('master_session_v2'); setIsMasterAuthenticated(false); setIsSuperMode(false); window.location.href = '/'; }} />
      } />

      {/* ADMIN ROUTES */}
      <Route path="/admin/*" element={
        auth.isAuthenticated ?
          <AdminApp
            auth={auth} 
            onLogin={login}
            onLogout={async () => { await logout(); window.location.href = '/'; }}
            isImpersonating={isImpersonating}
            onToggleMaster={() => { }}
            systemNotifications={systemNotifications}
            onMarkNotificationRead={async (id) => {
              if (auth.user) {
                await DataService.markSystemNotificationAsRead(auth.user.id, id);
                setSystemNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
              }
            }}
          /> :
          <Navigate to="/login" replace />
      } />

      {/* LOGIN */}
      <Route path="/login" element={
        auth.isAuthenticated ? <Navigate to="/admin" replace /> :
          <AdminLogin onLogin={login} onToggleMaster={() => { }} />
      } />

      {/* RESET PASSWORD - Suporte flexível para landers do Supabase com HashRouter */}
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/reset-password/*" element={<ResetPassword />} />

      {/* ROOT REDIRECT */}
      <Route path="/" element={<Navigate to={auth.isAuthenticated ? "/admin" : "/login"} replace />} />

      {/* DEFAULT CATCH-ALL */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

// Exibe o prompt de instalação PWA apenas fora de links públicos de OS/orçamento
const PwaInstallPromptConditional: React.FC = () => {
  const location = useLocation();
  const isPublicRoute = /^\/(order\/view|view-quote|view)\//.test(location.pathname);
  if (isPublicRoute) return null;
  return <PwaInstallPrompt />;
};

const App: React.FC = () => {
  return (
    <HashRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <I18nProvider>
        <AuthProvider>
          <DialogProvider>
            <AppRoutes />
            <PwaInstallPromptConditional />
            <PwaNotificationPrompt />
            <NetworkStatusIndicator />
            <GlobalAlertProvider />
            <GlobalSpinnerProvider />
          </DialogProvider>
        </AuthProvider>
      </I18nProvider>
    </HashRouter>
  );
};

export default App;
