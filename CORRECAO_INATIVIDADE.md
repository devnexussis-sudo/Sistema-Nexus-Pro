# 🛡️ CORREÇÃO DE AUTENTICAÇÃO + INATIVIDADE

O problema de telas parando de carregar após inatividade acontece porque o token expirava e o sistema não percebia ao retornar.

## 🔧 O QUE FOI FEITO (PARTE 2)
1.  **Check Proativo de Token**: Adicionei lógica no `AuthContext` que detecta se o token de sessão expirou (ou vai expirar em < 1 minuto) assim que o usuário volta a interagir.
2.  **Refresh Seguro**: Se o token estiver vencido, o sistema força uma renovação imediata antes de permitir chamadas de dados.
3.  **Logout Defensivo**: Se a renovação falhar, o usuário é deslogado para evitar erros e loops.

## 🚀 O QUE VOCÊ DEVE FAZER
Execute o deploy final para aplicar ambas as correções:

```bash
git push origin main
```

Agora o sistema deve ser resiliente a inatividade e manter a sessão ativa corretamente.
