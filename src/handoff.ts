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

// Tipagem global para o flag de impersonation
declare global {
  interface Window {
    __NEXUS_IMPERSONATION?: boolean;
  }
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

    // ── 3. Copia sessão Supabase Auth (token JWT) para esta aba ──
    // O Supabase SDK lê de customStorage que checa sessionStorage primeiro.
    // Sem isso, o SDK emite SIGNED_OUT e o AuthContext limpa tudo.
    if (data.supabase_auth) {
      window.sessionStorage.setItem('nexus-line-auth', data.supabase_auth);
    }

    // ── 4. Limpeza do token one-time (segurança) ──
    localStorage.removeItem(`nexus_handoff_${token}`);

    // ── 5. Limpa hash para o React Router não quebrar ──
    window.location.hash = '#/admin';

    console.log('[Handoff] ✅ Impersonation ativa para tenant:', data.current_tenant);
  } catch (e) {
    console.error('[Handoff] ❌ Erro:', e);
  }
})();
