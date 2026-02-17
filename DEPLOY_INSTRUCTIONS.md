# Guia de Deploy Profissional - Nexus Pro

Este documento detalha o procedimento para implantar o **Nexus Pro** em ambiente de produção usando **Vercel** (Frontend) e **Supabase** (Backend & Edge Functions).

---

## 🏗️ 1. Arquitetura de Deploy

- **Frontend**: Hospedado na **Vercel**. Responsável pela interface visual.
- **Backend (Banco de Dados)**: Hospedado no **Supabase**. Armazena dados e autenticação.
- **Edge Functions**: Hospedadas no **Supabase**. Executam lógica de negócio segura (ex: criação sequencial de OS) no lado do servidor.

---

## 🚀 2. Deploy das Edge Functions (Supabase)

Antes de subir o site, precisamos garantir que as funções de backend ("cérebro" do sistema) estejam ativas.

### Pré-requisitos
- [Supabase CLI](https://supabase.com/docs/guides/cli) instalado.
- Login realizado (`npx supabase login`).

### Passo a Passo

1. **Vincular Projeto**: Conecte sua pasta local ao projeto remoto do Supabase.
   ```bash
   npx supabase link --project-ref <seu-project-id>
   ```
   *(Você encontra o Reference ID no painel do Supabase, nas configurações da URL)*

2. **Deploy das Funções**:
   Suba as funções `create-order` e `get-orders` para a nuvem.
   ```bash
   npx supabase functions deploy create-order
   npx supabase functions deploy get-orders
   ```

3. **Definir Segredos (Opcional)**:
   Se suas funções precisarem de chaves extras (além das padrão do Supabase), use:
   ```bash
   npx supabase secrets set MINHA_VARIAVEL=valor
   ```

---

## 🌐 3. Deploy do Frontend (Vercel)

A Vercel hospedará a aplicação React.

1. **Repositório**: Suba este código para o GitHub/GitLab.
2. **Novo Projeto**: No painel da Vercel, clique em "Add New..." -> "Project" e importe o repositório.
3. **Configuração de Build**:
   - **Framework Preset**: Vite
   - **Root Directory**: `./` (raiz)
   - **Build Command**: `vite build` (ou `npm run build`)
   - **Output Directory**: `dist`

4. **Variáveis de Ambiente (Environment Variables)**:
   Configure as seguintes variáveis no painel da Vercel:

   | Variável | Valor | Descrição |
   | :--- | :--- | :--- |
   | `VITE_SUPABASE_URL` | `https://<seu-projeto>.supabase.co` | URL do seu projeto Supabase |
   | `VITE_SUPABASE_ANON_KEY` | `<sua-chave-anon>` | Chave pública (anon) do Supabase |
   | `VITE_SUPABASE_SERVICE_ROLE_KEY` | `<sua-chave-service>` | **(OPCIONAL/CUIDADO)** Usado apenas se for habilitar recursos de super-admin no front |

   > **Nota**: O arquivo `vercel.json` na raiz do projeto já configura o roteamento para garantir que o redirecionamento de páginas (SPA) funcione corretamente (evitando erros 404 ao atualizar a página).

---

## 🛡️ 4. Verificações Pós-Deploy

Após o deploy, faça os seguintes testes para garantir a "qualidade NASA":

1. **Login e Acesso**: Tente logar com um usuário existente.
2. **Criação de OS**: Crie uma nova ordem de serviço. Isso testará:
   - Conexão do Frontend com Supabase.
   - Chamada da Edge Function `create-order`.
   - Geração de ID sequencial no Banco de Dados.
3. **Listagem de OS**: Verifique se a lista carrega (teste da função `get-orders`).

---

## 📦 Estrutura de Arquivos Relevante

- `src/` - Código Fonte React (Frontend)
- `supabase/functions/` - Código das Edge Functions (Backend)
- `vercel.json` - Configuração de roteamento da Vercel

---
**Suporte**: Em caso de falha nas Edge Functions, verifique os logs no Dashboard do Supabase em *Edge Functions > Logs*.
