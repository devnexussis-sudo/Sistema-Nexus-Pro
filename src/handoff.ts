// ============================================================
// src/handoff.ts
// 🚀 NEXUS — Cross-Tab Impersonation Handoff (Big Tech Pattern)
//
// ARQUITETURA:
//  - Executa ANTES de qualquer outro módulo (primeira linha do index.tsx)
//  - Lê o token de handoff do localStorage (escrito pela aba Master)
//  - Popula SessionStorage com dados de impersonation
//  - Copia o token Supabase Auth para esta aba
//  - Define window.__NEXUS_IMPERSONATION = true para bloquear
//    o AuthContext de destruir a sessão virtual
//
// PADRÃO: AWS STS AssumeRole / Google Cloud IAM Impersonation
// ============================================================

import SessionStorage from './lib/sessionStorage';
import { supabase } from './lib/supabaseClient';

// Tipagem global para o flag de impersonation
declare global {
  interface Window {
    __NEXUS_IMPERSONATION?: boolean;
  }
}

// ── Re-assunção automática após reload (F5) ──
if (typeof window !== 'undefined' && SessionStorage.get('is_impersonating')) {
  window.__NEXUS_IMPERSONATION = true;
}

(function interceptHandoff() {
  const hash = window.location.hash;
  const handoffMatch = hash.match(/handoff=([^&]+)/);
  
  if (!handoffMatch) return;

  const token = handoffMatch[1];
  const raw = localStorage.getItem(`nexus_handoff_${token}`);
  
  if (!raw) return;

  try {
    const data = JSON.parse(raw);

    // ── 1. Flag global: impede AuthContext/supabaseClient de destruir a sessão ──
    window.__NEXUS_IMPERSONATION = true;

    // ── 2. Popula SessionStorage (isolado por aba) ──
    SessionStorage.set('user', data.user);
    SessionStorage.set('current_tenant', data.current_tenant);
    SessionStorage.set('is_impersonating', true);

    if (data.master_session_token) {
      SessionStorage.set('master_session_token', data.master_session_token);
      try {
        sessionStorage.setItem('master_session_token', data.master_session_token);
        localStorage.setItem('master_session_token', data.master_session_token);
      } catch (e) {}
    }

    if (data.master_session_v2) {
      SessionStorage.set('master_session_v2', true);
    }

    // ── 3. Copia e estabelece sessão Supabase Auth (token JWT) para esta aba ──
    if (data.supabase_auth) {
      window.sessionStorage.setItem('nexus-line-auth', data.supabase_auth);
      try {
        window.localStorage.setItem('nexus-line-auth', data.supabase_auth);
        const parsed = typeof data.supabase_auth === 'string' ? JSON.parse(data.supabase_auth) : data.supabase_auth;
        const accessToken = parsed?.access_token || parsed?.currentSession?.access_token || parsed?.session?.access_token;
        const refreshToken = parsed?.refresh_token || parsed?.currentSession?.refresh_token || parsed?.session?.refresh_token;
        const expiresAt = parsed?.expires_at || parsed?.currentSession?.expires_at || parsed?.session?.expires_at;

        const isExpired = typeof expiresAt === 'number' ? (expiresAt * 1000 <= Date.now() + 60000) : false;

        if (accessToken && refreshToken) {
          supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          }).then(async ({ error }) => {
            if (error || isExpired) {
              console.warn('[Handoff] ⚠️ Token de handoff expirado ou prestes a expirar. Tentando refresh preventivo imediato...');
              try {
                const { error: refreshErr } = await supabase.auth.refreshSession();
                if (refreshErr) {
                  console.warn('[Handoff] ⚠️ Refresh preventivo falhou, AuthContext assumirá via STS impersonation:', refreshErr.message);
                }
              } catch (re) {}
            }
          }).catch(err => {
            console.warn('[Handoff] Aviso ao estabelecer sessão Supabase na aba filha:', err);
          });
        }
      } catch (e) {}
    }

    // ── 4. Limpeza do token one-time (segurança) ──
    localStorage.removeItem(`nexus_handoff_${token}`);

    // ── 5. Limpa hash para o React Router não quebrar ──
    window.location.hash = '#/admin';

    console.log('[Handoff] ✅ Impersonation ativa e autenticação estabelecida para tenant:', data.current_tenant);
  } catch (e) {
    console.error('[Handoff] ❌ Erro:', e);
  }
})();
