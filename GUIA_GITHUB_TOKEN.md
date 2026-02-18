# 🔐 COMO DISPARAR O DEPLOY NO GITHUB

O GitHub não aceita mais sua senha pessoal de login. Você precisa de um **Token (PAT)**.

## 1. Gere o Token no Painel do GitHub
1.  Acesse: [https://github.com/settings/tokens](https://github.com/settings/tokens)
2.  Clique em **"Generate new token (classic)"**.
3.  No campo "Note", digite: `Nexus Deploy`.
4.  **Marque a caixa `repo`** (Dá permissão total ao repositório).
5.  Clique em **"Generate token"** no final da página.
6.  **COPIE O TOKEN** (começa com `ghp_...`).

## 2. No seu Terminal
Execute o comando de envio novamente:

```bash
git push origin main
```

Quando pedir:
*   **Username for 'https://github.com':** Digite `devnexussis-sudo` (ou seu usuário correto).
*   **Password for ...:** **Cole o Token** que você copiou (o cursor não vai andar, é normal). Dê Enter.

---
🚀 **Assim que der Enter, o código sobe e o Vercel inicia o deploy automaticamente!**
