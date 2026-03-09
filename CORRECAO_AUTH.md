# 🛡️ CORREÇÃO DE AUTENTICAÇÃO (Erro 400)

O erro `400 Bad Request` na rota `/auth/v1/token` acontecia porque o sistema estava tentando renovar a sessão manualmente ao mesmo tempo que o Supabase tentava automaticamente, causando conflito.

## 🔧 O QUE FOI FEITO
1.  **Simplificação do AuthProvider**: Removida a lógica agressiva de "Refresh Manual" no `AuthContext.tsx`.
2.  **Limpeza de Estado**: Agora, se a sessão estiver inválida, o usuário é deslogado imediatamente para evitar erros em cadeia, em vez de tentar forçar uma recuperação que falha.
3.  **Supabase Client**: Ajustado para não tentar refresh manual em `ensureValidSession`.

## 🚀 O QUE VOCÊ DEVE FAZER
Execute o deploy final:

```bash
git push origin main
```

Isso deve limpar os erros do console e tornar a navegação mais estável. Se o usuário for deslogado na primeira vez, é normal (limpeza de cache), mas depois deve funcionar perfeitamente.
