import './handoff'; // DEVE SER A PRIMEIRA LINHA!
import './authCallbackHandler'; // 🛡️ Intercepta retornos e erros de OAuth antes do HashRouter montar!
import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/admin.css';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './lib/telemetry'; // 📡 Initialize global logging system
// ⛔ REMOVIDO: import './lib/idleLogout'
// O timer de inatividade (12h) é gerenciado EXCLUSIVAMENTE pelo AuthContext.
// Ter dois sistemas concorrentes causava race conditions e duplo signOut.


const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

// A tela de carregamento com ícone pulsante do Duno (#nexus-loading-screen)
// permanece ativa até o App.tsx confirmar que a inicialização de autenticação
// e roteamento (incluindo o retorno de OAuth do Google) foram 100% concluídos.
