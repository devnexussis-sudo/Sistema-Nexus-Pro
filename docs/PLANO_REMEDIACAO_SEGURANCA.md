# Plano Estratégico de Remediação de Segurança — Duno (dunoup.com.br)

> **Data do Pentest:** 08/10/2026  
> **Classificação:** Confidencial / Engenharia de Segurança  
> **Status:** Pronto para Execução  
> **Objetivo:** Sanar todas as vulnerabilidades e inconsistências apontadas no relatório de segurança black-box sem causar tempo de inatividade (*zero downtime*) ou quebrar integrações existentes.

---

## 1. Visão Geral e Matriz de Riscos

| Item | Vulnerabilidade Identificada | Severidade | Superfície | Impacto Real |
| :--- | :--- | :---: | :--- | :--- |
| **01** | Webhook Asaas sem validação de assinatura/token | **CRÍTICO / ALTO** | Edge Function (`asaas-webhook`) | Possibilidade de forjar eventos de pagamento e marcar ordens/faturas como pagas. |
| **02** | Domínio sem DMARC e DKIM (SPF softfail `~all`) | **MÉDIO / ALTO** | DNS Umbler / Registro.br | Terceiros podem enviar e-mails falsos se passando por `@dunoup.com.br` (phishing de faturas/senhas). |
| **03** | CSP permissiva com `unsafe-inline` e `unsafe-eval` | **MÉDIO** | `vercel.json` e `index.html` | Reduz proteção contra ataques de injeção de script (XSS). |
| **04** | Site institucional (`www.dunoup.com.br`) sem headers | **BAIXO / MÉDIO** | Vercel (Projeto WWW) | Falta de `nosniff`, `X-Frame-Options` e HSTS sem `includeSubDomains`. |
| **05** | CORS aberto (`*`) na Edge Function `api_v1` | **BAIXO** | Edge Function (`api_v1`) | Preflights aceitos de qualquer origem de navegador. |
| **06** | Enumeração de schema no PostgREST (`anon`) | **INFO** | Supabase Postgres (RLS) | Dicas de erro e retorno `200 []` para `form_rules` e `service_types`. |
| **07** | Ausência de registro DNS CAA | **INFO** | DNS Umbler / Registro.br | Qualquer autoridade certificadora mundial pode emitir SSL para o domínio. |

---

## 2. Fase 1: Proteção Financeira — Webhook Asaas (Execução Prioritária)

### Diagnóstico Técnico
O arquivo `supabase/functions/asaas-webhook/index.ts` processa requisições `POST` diretamente sem checar:
1. O cabeçalho de autenticação do webhook do Asaas (`asaas-access-token`).
2. A assinatura HMAC SHA-256 (`asaas-signature`).
3. Responde HTTP `200 OK` mesmo com evento ausente (`!event`).

### Procedimento de Correção

#### Passo 1.1: Definir o Token de Webhook no Painel Asaas
1. Acesse o painel do Asaas (**Configurações > Integrações > Webhooks**).
2. Na configuração do Webhook de Cobranças / Contas a Receber, gere ou defina um token forte no campo **Token de Autenticação** (exemplo: `whsec_duno_prod_9f8a3b2c1e`).
3. Salve a configuração. O Asaas enviará esse token em todas as chamadas no cabeçalho:
   ```http
   asaas-access-token: whsec_duno_prod_9f8a3b2c1e
   ```

#### Passo 1.2: Salvar o Segredo no Supabase
Via terminal do projeto ou painel do Supabase:
```bash
npx supabase secrets set ASAAS_WEBHOOK_TOKEN="whsec_duno_prod_9f8a3b2c1e" --project-ref esrwwaoirlhcptbxtlsu
```

#### Passo 1.3: Atualizar a Edge Function `asaas-webhook`
No início da função em `supabase/functions/asaas-webhook/index.ts`:
```typescript
const webhookSecret = Deno.env.get('ASAAS_WEBHOOK_TOKEN');
const receivedToken = req.headers.get('asaas-access-token') || req.headers.get('Asaas-Access-Token');

// Se o secret estiver configurado no ambiente, a validação é estrita e mandatória:
if (webhookSecret && receivedToken !== webhookSecret) {
  console.warn(`[Asaas Webhook Security] ⛔ Tentativa não autorizada bloqueada. IP/Header inválido.`);
  return new Response(JSON.stringify({ error: 'Unauthorized: Token de webhook inválido ou ausente.' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Rejeitar payloads sem evento com 400 Bad Request (nunca 200 OK)
if (!event) {
  return new Response(JSON.stringify({ error: 'Bad Request: Evento obrigatório ausente.' }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

---

## 3. Fase 2: Blindagem de E-mail e Emissão de SSL (DNS Umbler / Registro.br)

### Diagnóstico Técnico
O domínio `dunoup.com.br` não possui política DMARC nem chave pública DKIM publicadas, e o SPF está com flag permissiva `~all` (softfail).

### Procedimento de Correção no Painel DNS

#### Passo 2.1: Ativar DKIM no Painel da Umbler
1. Acesse o painel da Umbler > Gerenciar E-mails > Domínio `dunoup.com.br`.
2. Clique na aba **DKIM** e selecione **Ativar**.
3. A Umbler gerará uma entrada DNS TXT (ou CNAME) no formato:
   - **Nome:** `umbler._domainkey` (ou seletor indicado pelo painel)
   - **Tipo:** `TXT` (ou CNAME)
   - **Valor:** Chave pública fornecida pela Umbler.

#### Passo 2.2: Criar Registro DMARC
No painel de DNS da Umbler ou do Registro.br (onde a zona DNS estiver delegada):
- **Nome do Host:** `_dmarc` (ou `_dmarc.dunoup.com.br`)
- **Tipo:** `TXT`
- **TTL:** `3600`
- **Valor Inicial (Quarentena):**
  ```text
  v=DMARC1; p=quarantine; rua=mailto:seguranca@dunoup.com.br; pct=100; sp=quarantine; adkim=r; aspf=r
  ```
  *(Nota: Após 15 a 30 dias de monitoramento sem falsos positivos, altere `p=quarantine` para `p=reject`).*

#### Passo 2.3: Restringir o SPF para Hardfail (`-all`)
Atualize o registro TXT existente do SPF:
- **De:**
  ```text
  v=spf1 include:spf.umbler.com ~all
  ```
- **Para:**
  ```text
  v=spf1 include:spf.umbler.com -all
  ```
  *(Se utilizar provedores externos para disparos transacionais como Resend ou SendGrid, adicione `include:...` antes do `-all`).*

#### Passo 2.4: Adicionar Registro CAA (Certificate Authority Authorization)
Adicionar duas entradas do tipo `CAA` na raiz do domínio `dunoup.com.br`:
- **Entrada 1:**
  - **Nome:** `@` (ou vazio / `dunoup.com.br`)
  - **Tipo:** `CAA`
  - **Valor:** `0 issue "letsencrypt.org"`
- **Entrada 2 (Wildcard):**
  - **Nome:** `@` (ou vazio / `dunoup.com.br`)
  - **Tipo:** `CAA`
  - **Valor:** `0 issuewild "letsencrypt.org"`

---

## 4. Fase 3: Endurecimento de Front-end e Headers de Segurança

### Diagnóstico Técnico
1. `vercel.json` declara `script-src 'self' 'unsafe-inline' 'unsafe-eval'`.
2. `unsafe-eval` não é necessário pelo bundle de produção.
3. `unsafe-inline` é disparado por dois blocos `<script>` dentro de `index.html` (registro do PWA e remoção da tela de splash `#nexus-loading-screen`).
4. O site `www.dunoup.com.br` não possui cabeçalhos de segurança replicados.

### Procedimento de Correção

#### Passo 3.1: Desacoplar Scripts Inline do `index.html`
1. Mover o script de PWA (linhas 95–173 de `index.html`) para um arquivo estático externo:
   `public/pwa-init.js`
   E chamar via:
   ```html
   <script type="module" src="/pwa-init.js"></script>
   ```
2. Mover a lógica da tela de carregamento (linhas 186–208 de `index.html`) para dentro do ponto de entrada do bundle (`src/index.tsx`) ou em `public/splash-init.js`.
3. Com isso, **não existirá mais nenhum `<script>` inline no HTML**.

#### Passo 3.2: Atualizar a CSP no `vercel.json`
Modificar o header `Content-Security-Policy` no `vercel.json`:
- **Remover:** `'unsafe-inline'` e `'unsafe-eval'`.
- **Manter:** Suporte a Leaflet, Google Maps, Fontes e Supabase.
- **Resultado:**
  ```json
  {
    "key": "Content-Security-Policy",
    "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.supabase.co https://*.r2.dev https://ui-avatars.com https://images.unsplash.com https://*.tile.openstreetmap.org https://server.arcgisonline.com https://unpkg.com https://cdnjs.cloudflare.com https://*.google.com https://*.googleapis.com https://*.gstatic.com https://*.basemaps.cartocdn.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.r2.dev https://*.uazapi.com https://*.google.com https://*.googleapis.com; frame-ancestors 'none';"
  }
  ```

#### Passo 3.3: Replicar Cabeçalhos no Site Institucional (`www.dunoup.com.br`)
No repositório ou configuração do projeto Vercel de `www.dunoup.com.br`, adicionar os cabeçalhos:
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "SAMEORIGIN" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" }
      ]
    }
  ]
}
```

---

## 5. Fase 4: Proteção de API e Banco de Dados (Postgres / RLS)

### Diagnóstico Técnico
1. `supabase/functions/api_v1/index.ts` possui `Access-Control-Allow-Origin: *`.
2. Tabelas `public.form_rules` e `public.service_types` permitem `SELECT` pelo role `anon`, retornando `200 []`.
3. Consultas a tabelas inexistentes com `anon` retornam sugestões de tabelas existentes nos erros do PostgREST.

### Procedimento de Correção

#### Passo 4.1: Restringir CORS na Edge Function `api_v1`
No arquivo `supabase/functions/api_v1/index.ts`, validar dinamicamente a origem:
```typescript
const allowedOrigins = [
  'https://app.dunoup.com.br',
  'https://dunoup.com.br',
  'https://www.dunoup.com.br'
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin');
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}
```
*(Nota: Chamadas de servidores como cURL, Python ou backends de clientes não enviam header `Origin`, portanto continuam funcionando normalmente sem qualquer restrição de CORS).*

#### Passo 4.2: Revogar Permissões do Role `anon` em Tabelas Não Públicas
Criar e executar a migration SQL no Supabase:
```sql
-- Revoga privilégios do visitante anônimo nas tabelas que não possuem visualização pública
REVOKE ALL ON public.form_rules FROM anon;
REVOKE ALL ON public.service_types FROM anon;

-- Recarregar o schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
```
*(Resultado: O PostgREST responderá `401 Unauthorized` / `Permission Denied` de imediato para o role `anon`, igual ao comportamento de `orders` e `customers`).*

---

## 6. Procedimento de Testes e Validação Pós-Implementação

Após aplicar as fases, execute os testes não destrutivos de validação:

### Teste 1: Webhook Asaas
```bash
# 1. Teste sem token (Deve retornar 401 Unauthorized):
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://esrwwaoirlhcptbxtlsu.supabase.co/functions/v1/asaas-webhook -H "Content-Type: application/json" -d '{"event":"PAYMENT_RECEIVED"}'
# Esperado: 401

# 2. Teste com token correto mas sem evento (Deve retornar 400 Bad Request):
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://esrwwaoirlhcptbxtlsu.supabase.co/functions/v1/asaas-webhook -H "Content-Type: application/json" -H "asaas-access-token: whsec_duno_prod_9f8a3b2c1e" -d '{}'
# Esperado: 400
```

### Teste 2: Registros DNS DMARC e CAA
```bash
# Validar DMARC:
dig +short TXT _dmarc.dunoup.com.br

# Validar SPF:
dig +short TXT dunoup.com.br

# Validar CAA:
dig +short CAA dunoup.com.br
```

### Teste 3: Cabeçalhos do App
```bash
curl -I https://app.dunoup.com.br | grep -i "content-security-policy"
# Verificar se 'unsafe-inline' e 'unsafe-eval' não estão mais presentes.
```

---

## 7. Checklist de Execução

- [ ] **Fase 1:** Gerar token no painel Asaas e salvar no Supabase (`ASAAS_WEBHOOK_TOKEN`).
- [ ] **Fase 1:** Atualizar e fazer deploy da Edge Function `asaas-webhook`.
- [ ] **Fase 2:** Ativar DKIM no painel da Umbler.
- [ ] **Fase 2:** Inserir entrada TXT `_dmarc` no DNS.
- [ ] **Fase 2:** Atualizar SPF para `-all` e adicionar registros CAA da Let's Encrypt.
- [ ] **Fase 3:** Mover scripts inline de `index.html` para arquivos externos.
- [ ] **Fase 3:** Atualizar CSP no `vercel.json` e aplicar cabeçalhos no `www`.
- [ ] **Fase 4:** Ajustar CORS no `api_v1` e revogar privilégios de `form_rules` e `service_types` para `anon`.
- [ ] **Fase 4:** Rodar testes cURL de validação.
