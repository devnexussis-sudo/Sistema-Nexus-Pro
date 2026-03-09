# 🕵️‍♂️ GUIA DE DIAGNÓSTICO (TELEMETRIA)

Implementei um sistema completo de logs internos ("Telemetria") para capturar exatamente o que acontece quando o sistema para de responder, além de uma proteção contra travamentos.

## 🛡️ O QUE MUDOU NO NÚCLEO DO SISTEMA
1.  **Correção de Deadlock (Travamento)**: Identifiquei que, às vezes, uma requisição de dados falhava silenciosamente (por queda de rede momentânea) e deixava o sistema "esperando para sempre". Adicionei um **timeout de 15 segundos**: se travar, ele destrava sozinho e tenta de novo.
2.  **Sistema de Telemetria**: Agora o Nexus grava internamente tudo o que acontece (login, busca de dados, erros de rede).

## 📝 COMO EXTRAIR OS LOGS
Se o sistema parar de novo, você agora pode extrair o "Log Absoluto" para me enviar:

1.  Clique no ícone de **Escudo** (🛡️) no topo direito da tela (Saúde do Sistema).
2.  Clique no botão **"Baixar Logs"**.
3.  Um arquivo de texto será salvo no seu computador.

## 🚀 O QUE FAZER AGORA
Apenas faça o deploy. A correção de travamento já deve resolver o problema sozinha.

```bash
git push origin main
```
