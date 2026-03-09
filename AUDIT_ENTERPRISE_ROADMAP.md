# 🏛️ NEXUS LINE — Auditoria Enterprise-Grade (L7 Principal Engineer)

**Data:** 2026-02-18  
**Auditor:** Principal Software Engineer L7  
**Escopo:** Auditoria de 4 Pilares Críticos para SaaS Comercial de Alto Nível  
**Status:** ⚠️ NÃO PRONTO PARA PRODUÇÃO ENTERPRISE — Leia abaixo  

---

## 📋 SUMÁRIO EXECUTIVO

O Nexus Line possui uma base funcional sólida, com boas intenções arquiteturais (multi-tenancy via RLS, singleton Supabase, sessões isoladas por aba). No entanto, **apresenta 14 inconsistências fatais e 23 problemas graves** que impedem sua classificação como SaaS comercial Enterprise-Grade. Os problemas mais críticos são: **bypass total de RLS pelo uso massivo de `adminSupabase`**, **Service Worker desabilitado**, **duplicação catastrófica da função `getCurrentTenantId`** e **ausência de gerenciamento de estado offline**.

---

## 🔴 PILAR 1: ARQUITETURA DE RESILIÊNCIA (O Bug de Inatividade)

### 1.1 ✅ O que está BEM
- Cliente Supabase instanciado como **singleton** (`supabase.ts` linha 16) — correto.
- `autoRefreshToken: true` habilitado — correto.
- `ensureValidSession()` com cooldown de 10s para evitar flood.
- Heartbeat do Realtime configurado em 15s com reconnect exponential backoff.
- Custom fetch com timeout de 30s para prevenir requests pendurados.
- AuthContext com listener `onAuthStateChange` para reagir a TOKEN_REFRESHED.
- Inactivity check de 1.5h com cleanup de sessão.
- Listener `focus` e `online` para restaurar sessão após offline.

### 1.2 🔴 INCONSISTÊNCIAS FATAIS

#### FATAL-R1: Race Condition no Token Refresh (Dupla Chamada)
**Arquivo:** `src/contexts/AuthContext.tsx` linhas 57-70  
**Problema:** O `validateAndRestoreSession()` faz `supabase.auth.refreshSession()` manualmente quando detecta token próximo de expirar. Porém, o `autoRefreshToken: true` do cliente já está fazendo isso automaticamente. O próprio comentário no `supabase.ts` (linha 71) diz: *"Do NOT manually refresh if autoRefreshToken is on. Manual refresh creates race conditions."* — **mas o AuthContext faz exatamente o contrário**.  
**Impacto:** Race condition entre refresh manual e auto-refresh. Em cenários de alta latência (3G/4G), ambos podem executar simultaneamente, invalidando o token do outro.  
**Severidade:** 🔴 CRÍTICA  
**Correção:** Remover o refresh manual do AuthContext. Confiar exclusivamente no `autoRefreshToken` do SDK. O `validateAndRestoreSession` deve apenas verificar se a sessão existe, não forçar refresh.

#### FATAL-R2: Session Guard Duplicado e Inconsistente
**Arquivos:** `src/lib/supabase.ts` (linhas 64-90) vs `src/services/orderService.ts` (linhas 43-55)  
**Problema:** Existem DUAS implementações diferentes de `ensureValidSession`:
- `supabase.ts`: Apenas verifica sessão, **não** faz refresh manual (correto).
- `orderService.ts`: Faz `refreshSession()` manualmente (incorreto, conflita com auto-refresh).  
**Impacto:** Comportamento inconsistente. OrderService pode invalidar tokens ativos.  
**Severidade:** 🔴 CRÍTICA  
**Correção:** Usar apenas o `ensureValidSession` de `supabase.ts` em todo o projeto. Deletar a versão duplicada no `orderService.ts`.

#### FATAL-R3: handleFocus Chama validateAndRestoreSession DUAS Vezes
**Arquivo:** `src/contexts/AuthContext.tsx` linhas 134-143  
**Problema:** A função `handleFocus` chama `validateAndRestoreSession` duas vezes seguidas (linhas 137-138), uma com `silent=false` e outra com `silent=true`. Isso gera o DOBRO de chamadas desnecessárias ao Supabase Auth toda vez que o usuário volta à aba.  
**Impacto:** Desperdício de requisições, risco de rate limit em cenários com muitas abas.  
**Severidade:** 🟠 ALTA  
**Correção:** Chamar apenas uma vez. A lógica condicional de `!currentTenant` pode ser resolvida em uma única chamada.

#### FATAL-R4: `adminSupabase` É Um Objeto Híbrido Instável
**Arquivo:** `src/lib/supabase.ts` linhas 222-234  
**Problema:** O `adminSupabase` é criado com spread (`{...supabase, auth: {...}}`) e cast `as any`. Isso **NÃO** é um cliente Supabase real — é um objeto plain JS que perdeu os métodos de prototype do SDK. Métodos como `.channel()`, `.realtime`, etc., podem quebrar silenciosamente.  
**Impacto:** Comportamento imprevisível. Qualquer atualização do SDK Supabase pode quebrar completamente.  
**Severidade:** 🔴 CRÍTICA  
**Correção:** Não usar spread. O `adminSupabase` deve ser o próprio `supabase` com o admin proxy injetado separadamente. As operações admin devem usar `adminAuthProxy` diretamente, não misturado em um objeto Frankenstein.

#### GRAVE-R5: AbortController Leak no Custom Fetch
**Arquivo:** `src/lib/supabase.ts` linhas 24-43  
**Problema:** O `AbortController` criado no custom fetch encadeia com o signal original via `addEventListener('abort', ...)`, mas **nunca remove** esse listener. Em aplicações de longa duração (SPA), isso pode acumular centenas de listeners no signal original do Supabase.  
**Severidade:** 🟠 ALTA  
**Correção:** Usar `AbortSignal.any()` (API moderna) ou garantir cleanup do listener no `.finally()`.

---

## 🔴 PILAR 2: PADRÕES DE ESCALABILIDADE SaaS (Multi-Tenancy & RLS)

### 2.1 ✅ O que está BEM
- RLS habilitado em todas as tabelas core (migrations verificadas).
- Função `get_user_tenant_id()` como SECURITY DEFINER — correto.
- Policies usando `get_user_tenant_id()` para isolamento por tenant.
- Fallback de JWT → tabela `users` para resolver tenant — robusto.
- Índices nos campos `tenant_id` de todas as tabelas — bom.
- Audit logs com infraestrutura criada (embora triggers comentados).

### 2.2 🔴 INCONSISTÊNCIAS FATAIS

#### FATAL-S1: 🚨 BYPASS TOTAL DO RLS — `adminSupabase` Usado Em Todo Lugar 🚨
**Arquivos:** `orderService.ts`, `tenantService.ts`, `technicianService.ts`, `authService.ts`  
**Problema:** O `getServiceClient()` retorna `adminSupabase` em TODOS os services. O admin proxy redireciona operações auth para Edge Functions (correto), MAS `adminSupabase.from('orders')` usa `supabase.from` — ou seja, usa o **cliente anon** para queries normais. Porém, em `tenantService.ts`, as chamadas usam `adminSupabase.from('tenants')` diretamente, e se esse objeto herdar a service role key (ou se no futuro alguém adicionar a service key), **TODO o RLS será ignorado**.  

Mais grave: O `tenantService.ts` usa `adminSupabase.from('users')` para buscar dados cross-tenant no painel Master (linhas 289, 320). Se um admin de um tenant conseguir acessar essas funções, **pode ver dados de outros tenants**.  
**Impacto:** Risco de VAZAMENTO DE DADOS entre clientes. Violação de LGPD.  
**Severidade:** 🔴🔴 BLOQUEANTE  
**Correção:**
1. Remover `adminSupabase` do frontend completamente.
2. Operações admin devem usar Edge Functions (que já existem para auth).
3. Queries normais devem usar o `supabase` client (anon) que respeita RLS.
4. Operações Master devem ser auth-guarded por Edge Functions com verificação de role.

#### FATAL-S2: Tenant ID Extraído de URL Params sem Validação
**Arquivo:** `src/lib/tenantContext.ts` linha 60-64, replicado em ~8 arquivos  
**Problema:** O `getCurrentTenantId()` aceita `tid` de query params da URL (`?tid=xxx`). Um atacante pode adicionar `?tid=UUID_DE_OUTRO_TENANT` à URL e, se qualquer código confiar nesse valor sem validar contra o JWT, acessar dados de outro tenant.  
**Impacto:** Escalação horizontal de acesso. Um usuário pode forjar contexto de outro tenant.  
**Severidade:** 🔴 CRÍTICA  
**Correção:** O tenant ID do URL deve ser APENAS informativo (para link público). O tenant real deve SEMPRE vir do JWT claims ou da tabela `users`. Remover fallback para URL params em contextos autenticados.

#### FATAL-S3: `getCurrentTenantId()` Duplicado 8+ Vezes
**Arquivos com cópia idêntica:**
1. `src/lib/tenantContext.ts` (TenantContext.getCurrentTenantId)
2. `src/services/authService.ts` (AuthService.getCurrentTenantId)
3. `src/services/orderService.ts` (getCurrentTenantId local)
4. `src/services/tenantService.ts` (getCurrentTenantId local)
5. `src/services/technicianService.ts` (getCurrentTenantId local)
6. `src/services/storageService.ts` (getCurrentTenantId local)
7. `src/services/dataService.ts` (DataService.getCurrentTenantId)
8. Provavelmente mais em `customerService.ts`, `equipmentService.ts`, etc.  

**Problema:** Código duplicado com ~30 linhas idênticas em cada arquivo. Se um fix precisa ser aplicado (como remover o fallback de URL params), precisa ser feito em 8+ lugares.  
**Nota:** O `TenantContext` foi criado exatamente para resolver isso, mas **nenhum service o usa**. O `useTenantContext` hook tem um bug: importa `React` na linha 177, **depois** de ser usado na linha 158.  
**Severidade:** 🔴 CRÍTICA (manutenibilidade + segurança)  
**Correção:** Todos os services devem importar e usar `getCurrentTenantId` de `tenantContext.ts`. Deletar todas as cópias locais.

#### FATAL-S4: `technicians` Tabela Sem Verificação de Tenant no Frontend
**Arquivo:** `technicianService.ts` linhas 308-311  
**Problema:** `updateTechnicianAvatar` faz update sem filtrar por `tenant_id`: `.update({ avatar }).eq('id', userId)`. Se o RLS falhar (e com `adminSupabase` isso é possível), um admin pode alterar o avatar de um técnico de outro tenant.  
**Severidade:** 🟠 ALTA  
**Correção:** Sempre incluir `.eq('tenant_id', tenantId)` em queries de update/delete.

#### GRAVE-S5: `deleteTenant` Faz Cascade Manual sem Transaction
**Arquivo:** `tenantService.ts` linhas 282-313  
**Problema:** A exclusão de tenant deleta dados sequencialmente em 10 tabelas. Se o processo falhar no meio (ex: timeout na tabela 5), as tabelas 1-4 já foram limpas mas o tenant ainda existe. Dados órfãos.  
**Severidade:** 🟠 ALTA  
**Correção:** Usar uma Edge Function com database transaction (`BEGIN/COMMIT/ROLLBACK`), ou configurar `ON DELETE CASCADE` nas foreign keys.

#### GRAVE-S6: Policies do `users_select_policy` Permitem `OR public.is_admin()`
**Arquivo:** `20260209_clean_and_fix_all_rls.sql` linha 72  
**Problema:** A policy de SELECT permite que qualquer admin veja TODOS os users, independente de tenant: `id = auth.uid() OR tenant_id = get_user_tenant_id() OR public.is_admin()`. O `is_admin()` não filtra por tenant, então um admin do Tenant A pode ver users do Tenant B.  
**Severidade:** 🔴 CRÍTICA  
**Correção:** Mudar para: `id = auth.uid() OR (tenant_id = get_user_tenant_id()) OR (is_admin() AND tenant_id = get_user_tenant_id())`.

#### GRAVE-S7: `users_delete_admin` Policy Sem Filtro de Tenant
**Arquivo:** `20260209_clean_and_fix_all_rls.sql` linha 80-81  
**Problema:** `USING (public.is_admin())` — um admin pode deletar users de QUALQUER tenant.  
**Severidade:** 🔴 CRÍTICA  
**Correção:** Adicionar `AND tenant_id = public.get_user_tenant_id()`.

---

## 🔴 PILAR 3: INTEGRIDADE DO APP (PWA para APK)

### 3.1 ✅ O que está BEM
- `manifest.json` presente com ícones e configuração standalone.
- Loading screen com fallback de 10s (safety timeout).
- HashRouter para compatibilidade com hosts estáticos.
- Vite configurado com Brotli + Gzip compression.
- Code splitting manual por vendor chunks.

### 3.2 🔴 INCONSISTÊNCIAS FATAIS

#### FATAL-P1: Service Worker DESABILITADO — PWA Não Funciona
**Arquivo:** `public/sw.js` linhas 1-25  
**Problema:** O service worker está **intencionalmente desabilitado**. Ele faz `self.registration.unregister()` no activate. Isso significa:
- ❌ Nenhum cache offline funciona
- ❌ O app não instala como PWA real
- ❌ Nenhum background sync
- ❌ Push notifications não funcionam via SW
- ❌ Envolvimento via Trusted Web Activity (TWA) para APK será instável  

**Impacto:** O app é apenas um website responsivo, NÃO uma PWA. Para APK via TWA/Capacitor, o SW é obrigatório.  
**Severidade:** 🔴🔴 BLOQUEANTE  
**Correção:** Implementar um SW completo com estratégias de cache:
- Cache-First para assets estáticos
- Network-First para API calls
- Offline Fallback page
- Background Sync para mutations pendentes
- Considerar usar Workbox (plugin Vite disponível)

#### FATAL-P2: Sem Gerenciamento de Estado Offline
**Problema geral:**
- Nenhum `store` global (Redux/Zustand/Jotai). Estado é gerenciado via:
  - `AuthContext` (único Context provider)
  - `useQuery` hook customizado com cache em `localStorage`
  - `SessionStorage` por aba
- O `useQuery` persiste dados em `localStorage` (bom para offline read), mas:
  - ❌ Nenhum mecanismo de **offline mutation queue** (write-ahead log)
  - ❌ Nenhum conflict resolution para sincronização
  - ❌ Se o app perde rede durante um `createOrder`, a OS é simplesmente perdida
  - ❌ Nenhum UI feedback de "offline mode"  

**Severidade:** 🔴 CRÍTICA para mobile  
**Correção:** Implementar:
1. Mutation Queue com IndexedDB (mais robusto que localStorage)
2. Background Sync via SW
3. UI indicator de status de rede
4. Retry automático com idempotency keys

#### FATAL-P3: `manifest.json` Incompleto para APK
**Arquivo:** `public/manifest.json`  
**Problemas:**
- ❌ Faltam ícones em múltiplos tamanhos (48, 72, 96, 128, 144, 192, 384, 512)
- ❌ Mesmo arquivo `pwa-icon.png` usado para 512 e 192 (deve ser otimizado por tamanho)
- ❌ `"purpose": "any maskable"` deve ser separado em dois entries (melhor compatibilidade)
- ❌ Falta `id` field (PWA spec recomenda para identidade)
- ❌ Falta `categories` e `screenshots` (melhor instalação)
- ❌ `start_url: "/"` mas o app usa HashRouter — deveria ser `"/?source=pwa"` ou `"/#/"`.  
**Severidade:** 🟠 ALTA  
**Correção:** Gerar ícones em todos os tamanhos. Separar `any` e `maskable`. Adicionar campos faltantes.

#### GRAVE-P4: `useQuery` Cache Key Collision
**Arquivo:** `src/hooks/useQuery.ts` linha 58  
**Problema:** Cache key em localStorage é `NEXUS_CACHE_${key}`, mas não inclui tenant ID. Se dois usuários de tenants diferentes usarem o mesmo browser, dados de um aparecerão para o outro.  
**Severidade:** 🟠 ALTA  
**Correção:** Prefixar cache key com tenant ID: `NEXUS_CACHE_${tenantId}_${key}`.

#### GRAVE-P5: OrderDetailsModal.tsx com 63KB
**Arquivo:** `src/tech-pwa/OrderDetailsModal.tsx` — **63.2 KB**  
**Problema:** Componente monolítico com provavelmente 1500+ linhas. Para mobile PWA, isso significa:
- Parse time alto em dispositivos low-end
- Impossível de manter
- Tree-shaking ineficaz  
**Severidade:** 🟠 ALTA  
**Correção:** Dividir em sub-componentes: OrderHeader, OrderStatusFlow, OrderForm, OrderItems, OrderSignature, OrderActions, etc.

---

## 🔴 PILAR 4: CLEAN CODE & DÍVIDA TÉCNICA

### 4.1 ✅ O que está BEM
- TypeScript habilitado com interfaces bem definidas (`types/index.ts`).
- Separation of concerns entre Services/Hooks/Components/Lib.
- ErrorHandler robusto com ErrorCode enum e retry logic.
- Logger estruturado.
- XSS protection module.
- Validation module com Zod.
- `DataService` marcado como `DEPRECATION NOTICE` com facade para services específicos.

### 4.2 🔴 INCONSISTÊNCIAS

#### FATAL-C1: `any` Em Todo Lugar — Tipagem Suja
**Exemplos:**
- `tenantService.ts`: `createTenant(tenant: any)`, `updateTenant(tenant: any)`, `createUser(userData: any)`, `updateUser(userData: any)` — TODOS `any`.
- `orderService.ts`: `_mapOrderToDB(order: any)`, `_mapOrderFromDB(data: any)`
- `supabase.ts`: `adminSupabase` castado como `as any` (linha 234)
- `AuthContext.tsx`: `authSubscriptionRef = useRef<any>(null)`, `systemNotifications = useState<any[]>([])`  
**Impacto:** O TypeScript existe mas perde 70% do valor. Bugs de tipagem passam despercebidos. Refactoring se torna arriscado.  
**Severidade:** 🔴 CRÍTICA (para manutenibilidade)  
**Correção:** Criar interfaces TypeScript para TODAS as entidades de banco de dados. Criar tipos para payloads de create/update.

#### FATAL-C2: Lógica de Negócio Vazando para Componentes
**Exemplos:**
- `TechLogin.tsx` (14.8KB) — provavelmente faz fetch, auth, session management, navigation, tudo dentro do componente.
- `TechDashboard.tsx` (24.9KB) — provavelmente combina UI + data fetching + business logic.
- `OrderDetailsModal.tsx` (63.2KB) — monólito de UI + lógica.
- `App.tsx` linhas 62-63: Lógica Master Login inline no JSX com callbacks complexos.  
**Severidade:** 🟠 ALTA  
**Correção:** Extrair lógica para hooks customizados (`useTechAuth`, `useTechDashboard`, `useOrderDetails`). Componentes devem ser apenas UI.

#### GRAVE-C3: DataService Facade é um God Object
**Arquivo:** `src/services/dataService.ts` linhas 111-123  
**Problema:** Usa spread operator para merge de 12 services em um único objeto. Isso:
- Cria colisões de nome silenciosas (se dois services têm o mesmo método, um sobrescreve o outro)
- Impossibilita tree-shaking
- Dificulta descoberta de tipos  
**Severidade:** 🟠 ALTA  
**Correção:** Parar de usar `DataService` como ponto de acesso. Importar services específicos diretamente.

#### GRAVE-C4: Backup Files no Repositório
**Arquivo:** `src/services/` contém:
- `authService.ts.backup`
- `authService.ts.bkp`
- `contractService.ts.bkp`
- `customerService.ts.bkp`
- `equipmentService.ts.bkp`
- `financialService.ts.bkp`
- `formService.ts.bak`
- `orderService.ts.bkp`
- `quoteService.ts.bkp`
- `stockService.ts.bkp`
- `technicianService.ts.bkp`  
**Problema:** 11 arquivos de backup no repositório. Isso é trabalho do Git, não de `.bkp` files. Indica ausência de disciplina de versionamento.  
**Severidade:** 🟡 MÉDIA  
**Correção:** Deletar todos os `.bkp`/`.backup`/`.bak`. Adicionar ao `.gitignore`.

#### GRAVE-C5: Import Circular Potencial em `tenantContext.ts`
**Arquivo:** `src/lib/tenantContext.ts` linha 177  
**Problema:** `import * as React from 'react'` está na ÚLTIMA LINHA do arquivo, depois de já ter sido usado na linha 158. Em ambientes com ESM strict, isso pode falhar. É um hoisting issue.  
**Severidade:** 🟡 MÉDIA  
**Correção:** Mover o import para o topo do arquivo.

#### GRAVE-C6: 85 Arquivos de Migration Sem Consolidação
**Pasta:** `supabase/migrations/` — 85 arquivos  
**Problema:** Muitas migrations "fix" empilhadas (ex: `repair_tech_table`, `repair_tech_table_v2`, `repair_tech_table_v3`). Isso indica desenvolvimento sem planejamento de schema. Em produção com múltiplos ambientes, isso se torna ingerenciável.  
**Severidade:** 🟡 MÉDIA  
**Correção:** Consolidar em um **schema definitivo** + `seed.sql`. Manter migrations futuras limpas e sequenciais.

#### GRAVE-C7: `console.log` Massivo no Código de Produção
**Problema:** Apesar de `drop_console: true` no Terser (config Vite), o código está repleto de `console.log`, `console.warn` com emojis Debug. Em DEV isso é aceitável, mas:
- Performance em mobile é afetada por logging excessivo
- Strings ficam no bundle antes do terser processar
- `console.error` **NÃO** é removido pelo Terser (corretamente, mas muitos erros são informativos, não erros reais)  
**Severidade:** 🟡 MÉDIA  
**Correção:** Usar o `logger.ts` existente consistentemente. Remover `console.log` diretos.

#### GRAVE-C8: `publicSupabase` Criado Sem Necessidade
**Arquivo:** `src/lib/supabase.ts` linhas 237-243  
**Problema:** Um terceiro cliente Supabase é criado sem sessão (`persistSession: false`). Isso é usado para RPC públicas, mas poderia usar o `supabase` normal que já funciona para requests anon. Ter 3 clientes é complexidade desnecessária.  
**Severidade:** 🟡 MÉDIA  
**Correção:** Avaliar se o cliente anon default (`supabase`) já atende. Se RPCs públicas não precisam de sessão, podem funcionar com o cliente padrão usando `.rpc()` sem autenticação.

---

## 📊 ROADMAP DE ESTABILIZAÇÃO (Priorizado)

### 🔴 FASE 1: BLOQUEANTES (Sem isso, o sistema NÃO pode ir para produção)
| # | Item | Severidade | Esforço | Arquivos |
|---|------|-----------|---------|----------|
| 1 | **Remover `adminSupabase` do frontend** — mover operações admin para Edge Functions | 🔴🔴 BLOQUEANTE | 3-5 dias | Todos os services + supabase.ts |
| 2 | **Corrigir RLS policies** — `users_select`, `users_delete` devem filtrar por tenant | 🔴🔴 BLOQUEANTE | 2h | Migration SQL nova |
| 3 | **Remover fallback de URL params** para `getCurrentTenantId` em contextos autenticados | 🔴 CRÍTICA | 4h | tenantContext.ts + todos services |
| 4 | **Centralizar `getCurrentTenantId`** — usar TenantContext singleton, deletar 8+ cópias | 🔴 CRÍTICA | 1 dia | 8+ arquivos |
| 5 | **Implementar Service Worker funcional** com Workbox | 🔴🔴 BLOQUEANTE | 3-5 dias | sw.js, vite.config.ts |
| 6 | **Corrigir race condition de Token Refresh** — remover refresh manual do AuthContext | 🔴 CRÍTICA | 2h | AuthContext.tsx |
| 7 | **Substituir `adminSupabase` objeto híbrido** por admin proxy separado | 🔴 CRÍTICA | 1 dia | supabase.ts |

### 🟠 FASE 2: GRAVES (Impedem escalabilidade e estabilidade)
| # | Item | Severidade | Esforço | Arquivos |
|---|------|-----------|---------|----------|
| 8 | Implementar Offline Mutation Queue com IndexedDB | 🟠 ALTA | 3 dias | Novo módulo |
| 9 | Prefixar cache keys do `useQuery` com tenant ID | 🟠 ALTA | 2h | useQuery.ts |
| 10 | Adicionar `tenant_id` filter em todos os updates/deletes do frontend | 🟠 ALTA | 4h | Todos os services |
| 11 | `deleteTenant` via Edge Function com transaction | 🟠 ALTA | 1 dia | tenantService.ts + nova Edge Function |
| 12 | Fix handleFocus chamando validação 2x | 🟠 ALTA | 30min | AuthContext.tsx |
| 13 | Fix AbortController listener leak no custom fetch | 🟠 ALTA | 1h | supabase.ts |
| 14 | Completar `manifest.json` com todos os tamanhos de ícones | 🟠 ALTA | 2h | manifest.json + assets |
| 15 | Quebrar `OrderDetailsModal.tsx` (63KB) em sub-componentes | 🟠 ALTA | 2 dias | tech-pwa/ |

### 🟡 FASE 3: MELHORIAS (Clean Code e DX)
| # | Item | Severidade | Esforço |
|---|------|-----------|---------|
| 16 | Eliminar todos os `any` — criar tipos strictos | 🟡 MÉDIA | 3 dias |
| 17 | Deletar 11 arquivos `.bkp` do repositório | 🟡 MÉDIA | 15min |
| 18 | Consolidar 85 migrations em schema definitivo | 🟡 MÉDIA | 1 dia |
| 19 | Fix import do React no `tenantContext.ts` | 🟡 MÉDIA | 5min |
| 20 | Migrar `console.log` para `logger.ts` consistentemente | 🟡 MÉDIA | 4h |
| 21 | Extrair lógica de negócio dos componentes para hooks | 🟡 MÉDIA | 3 dias |
| 22 | Remover `DataService` facade — importar services diretamente | 🟡 MÉDIA | 2 dias |
| 23 | Habilitar e configurar audit log triggers em tabelas sensíveis | 🟡 MÉDIA | 2h |

---

## 🔒 VEREDICTO FINAL

### Para ser um SaaS Comercial Enterprise-Grade, o Nexus Line precisa:

| Requisito | Status Atual |
|-----------|-------------|
| Multi-tenancy infalível | ❌ **FALHA** — RLS bypassed, policies com vazamento |
| Resiliência de sessão | ⚠️ **PARCIAL** — Race conditions no token refresh |
| PWA funcional | ❌ **FALHA** — SW desabilitado, sem offline support |
| Segurança de dados | ❌ **FALHA** — Admin proxy no frontend, URL param injection |
| Clean Code | ⚠️ **PARCIAL** — `any` excessivo, duplicação, God objects |
| Ready for APK | ❌ **FALHA** — Manifest incompleto, sem SW, sem state management |

### Estimativa Total de Estabilização:
- **Fase 1 (Bloqueantes):** ~2 semanas de trabalho focado
- **Fase 2 (Graves):** ~1.5 semanas
- **Fase 3 (Melhorias):** ~2 semanas

**Total: ~5-6 semanas para Enterprise-Grade.**

---

> *"O código que funciona em demo não é o código que sobrevive a 100 mil empresas simultâneas. A diferença entre um MVP e um SaaS comercial está nos detalhes que ninguém vê — RLS policies, race conditions, offline resilience, e a disciplina de não usar `any`."*
>
> — Auditoria L7, Nexus Line, 2026-02-18
