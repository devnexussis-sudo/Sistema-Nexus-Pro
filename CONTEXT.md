# 🧠 Nexus Pro - Memória de Contexto e Progresso (Big Tech master)

Este arquivo serve como o Log de Longo Prazo da evolução do projeto, garantindo que o rigor técnico e as decisões arquiteturais sejam preservados.

---

## 🛑 1. Histórico de Auditoria (Os 14 Pontos Fatais)

Identificamos falhas críticas que comprometiam a escalabilidade e segurança do sistema em nível "Enterprise":
1.  **Bypass de RLS:** Uso generalizado de `service_role` ou clientes admin no frontend, expondo dados entre tenants.
2.  **Service Worker Desativado:** Falha na sincronização offline e notificações.
3.  **Bug de Inatividade:** Sessões expirando prematuramente ou falhando no refresh automático.
4.  **Inconsistência de Tipos:** Conflitos entre `UUID` e `TEXT` no PostgreSQL/RLS.
5.  **Recursão de RLS:** Políticas de `users` que causavam loops infinitos.
6.  **Falta de Isolamento Lateral:** Possibilidade de uma empresa acessar dados de outra via IDs sequenciais ou falta de filtros.
7.  **Dependência de Chaves Secretas no Client:** Exposição de `SUPABASE_SERVICE_ROLE_KEY`.
8.  **Ausência de CI/CD para SQL:** Migrações manuais sem rastro no repositório.
9.  **Mapeamento de Tipos Quebrado:** Frontend dessincronizado com o schema do banco.
10. **Race Conditions no Auth:** Múltiplas tentativas de refresh de token simultâneas.
11. **Falta de Granularidade:** Políticas de "Tudo ou Nada" em vez de permissões por Role.
12. **CORS mal configurado:** Bloqueio de Edge Functions em produção.
13. **Uso de IDs numéricos simples:** Vulnerabilidade a ataques de enumeração (corrigido para UUID/Protocolos).
14. **Arquitetura de "Gambiarras":** Soluções temporárias que geram dívida técnica massiva.

---

## ✅ 2. O que já foi feito (Refatoração do Pilar de Segurança)

1.  **Implementação do Isolamento por `tenant_id`:** Criada infraestrutura de `SECURITY DEFINER` com `get_auth_tenant_id()` para garantir que o isolamento ocorra no nível do banco ("Hard Link").
2.  **Remoção do `adminSupabase`:** Eliminamos o cliente inseguro que bypassava o RLS no frontend.
3.  **Criação do `adminAuthProxy`:** Padronização do uso de Edge Functions para operações administrativas (Create/Delete User).
4.  **Correção de Tipagem L7:** Aplicação da Migration V4 com `CAST` explícito para resolver erros de `operator does not exist (uuid = text)`.
5.  **Workflow Big Tech:** Implementação de CI/CD via GitHub Actions para deploy automático de Edge Functions.
6.  **Governança (.cursorrules):** Estabelecimento formal de padrões Clean Architecture e No Bypass.

---

## 📍 3. Estado Atual e Bloqueios

-   **Estado de Leitura (SELECT):** Estável. O sistema lê dados respeitando o isolamento entre empresas.
-   **Estado de Escrita (INSERT/UPDATE):** **BLOQUEADO.** Após a remoção do cliente admin, as policies de RLS estão negando a escrita pois não foram devidamente calibradas para os novos 'Tipos de Usuários' e grupos de acesso.
-   **Edge Functions:** Em processo de deploy via GitHub Actions. Erro de CORS detectado devido à falta de sincronia entre código e configurações de "Verify JWT" no Dashboard.

---

## 🛠️ 4. Decisões Técnicas de Governança

-   **Standard:** Big Tech Master. Nada de soluções amadoras ou paliativas.
-   **Source of Truth:** O Banco de Dados (PostgreSQL + RLS) é o juiz final da segurança.
-   **Mudanças:** 100% via Migrations refletidas em `src/types/supabase.ts`.
-   **Arquitetura:** Clean Architecture com Singleton Supabase.

---

## 🗓️ 5. Próximos Passos Pendentes

1.  **Calibração de Políticas de Escrita:** Ajustar as policies de `orders`, `technicians`, `customers` e `user_groups` para respeitar as permissões granulares de UI (Ex: validar `can_edit`).
2.  **Estabilização da Edge Function:** Resolver o CORS da `admin-operations` via Dashboard (Actions/Secrets/JWT removal).
3.  **Blindagem Total:** Extender RLS para 100% das tabelas do esquema operacional.

*Atualizado em: 18/02/2026 às 23:42*
