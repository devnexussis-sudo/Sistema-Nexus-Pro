// ============================================================
// src/authCallbackHandler.ts
// 🛡️ NEXUS — Supabase OAuth / SSO Callback & Error Interceptor
//
// PROBLEMA RESOLVIDO:
//  - O Supabase Auth redireciona fluxos OAuth (Google, etc.) e linkIdentity
//    para o redirectTo com parâmetros no search (?error=...) ou hash (#error=... ou #access_token=...).
//  - Como o Nexus utiliza HashRouter, qualquer hash como #error=... ou #access_token=...
//    é interpretado pelo React Router como uma rota inexistente, resultando em tela de Erro 404!
//  - Este handler executa no topo do ciclo de vida da aplicação (antes do React montar),
//    intercepta erros e tokens OAuth, normaliza a rota e armazena notificações para o usuário.
// ============================================================

export function processAuthCallback(): void {
  if (typeof window === 'undefined') return;

  try {
    const rawHash = window.location.hash || '';
    const rawSearch = window.location.search || '';

    // ── 1. DETECÇÃO DE ERROS DE AUTENTICAÇÃO (ex: identity_already_exists) ──
    const hasErrorInHash = rawHash.includes('error=') || rawHash.includes('error_code=');
    const hasErrorInSearch = rawSearch.includes('error=') || rawSearch.includes('error_code=');

    if (hasErrorInHash || hasErrorInSearch) {
      // Normaliza parâmetros de consulta tanto do hash quanto do search
      const hashQuery = rawHash.replace(/^#\/?/, '').replace(/^\?/, '');
      const hashParams = new URLSearchParams(hashQuery);
      const searchParams = new URLSearchParams(rawSearch.replace(/^\?/, ''));

      const error = hashParams.get('error') || searchParams.get('error') || '';
      const errorCode = hashParams.get('error_code') || searchParams.get('error_code') || '';
      const errorDesc = hashParams.get('error_description') || searchParams.get('error_description') || '';

      console.warn('[AuthCallback] ⚠️ Erro OAuth detectado no retorno da autenticação:', {
        error,
        errorCode,
        errorDesc,
      });

      let friendlyMessage = 'Ocorreu uma falha na autenticação com o Google.';

      if (errorCode === 'identity_already_exists' || errorDesc.toLowerCase().includes('already linked')) {
        friendlyMessage = 'Esta conta do Google já está vinculada (a este ou a outro usuário no sistema).';
      } else if (error === 'access_denied') {
        friendlyMessage = 'A autorização com a conta do Google foi cancelada.';
      } else if (errorCode === 'otp_expired') {
        friendlyMessage = 'O link de acesso expirou. Por favor, tente novamente.';
      } else if (errorDesc) {
        friendlyMessage = decodeURIComponent(errorDesc.replace(/\+/g, ' '));
      }

      // Armazena no sessionStorage para o App exibir o toast amigável após o render
      sessionStorage.setItem('nexus_oauth_feedback', JSON.stringify({
        type: 'error',
        title: 'Vinculação Google SSO',
        message: friendlyMessage,
        code: errorCode || error,
        timestamp: Date.now(),
      }));

      // Determina rota de destino segura
      const isUserLoggedIn = !!(
        sessionStorage.getItem('nexus-line-auth') ||
        localStorage.getItem('nexus-line-auth')
      );
      const targetHash = isUserLoggedIn ? '#/admin' : '#/login';

      // Limpa URL limpando search e hash de erro para evitar tela 404 no HashRouter
      const cleanPath = window.location.pathname || '/';
      window.history.replaceState(null, '', cleanPath + targetHash);
      window.location.hash = targetHash;
      return;
    }

    // ── 2. DETECÇÃO DE SUCESSO DE OAUTH COM TOKENS NO HASH (#access_token=) ──
    if (rawHash.startsWith('#access_token=') || rawHash.includes('&access_token=')) {
      console.log('[AuthCallback] 🔑 Tokens de sessão OAuth detectados no hash.');

      sessionStorage.setItem('nexus_oauth_feedback', JSON.stringify({
        type: 'success',
        title: 'Google SSO',
        message: 'Conta Google autenticada com sucesso!',
        timestamp: Date.now(),
      }));

      // Aguarda um ciclo para que o SDK Supabase leia o hash antes de normalizar para #/admin
      setTimeout(() => {
        if (window.location.hash.startsWith('#access_token=')) {
          const cleanPath = window.location.pathname || '/';
          window.history.replaceState(null, '', cleanPath + '#/admin');
          window.location.hash = '#/admin';
        }
      }, 150);
    }
  } catch (err) {
    console.error('[AuthCallback] Falha ao processar callback de autenticação:', err);
  }
}

// Execução imediata ao carregar o módulo
processAuthCallback();
