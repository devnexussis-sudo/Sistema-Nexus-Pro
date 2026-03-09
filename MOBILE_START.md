# 📱 NEXUS MOBILE - Guia de Execução

Detectei o projeto mobile em `APP Nexus/nexus-mobile`.
Estou tentando rodá-lo automaticamente, mas devido ao tamanho das instalações (npm install) e a versão do Node, pode demorar.

## 🚀 Opção Rápida (Recomendada)
Para ver o QR Code instantaneamente e manter o log visível, rode no seu terminal:

```bash
cd "APP Nexus/nexus-mobile"
npm install
npx expo start --tunnel
```

## ⚠️ Sobre Versão do Node
Seu ambiente está com **Node v18**, mas o React Native novo prefere **Node v20+**.
Se der erro de `EBADENGINE`, use:

```bash
npm install --legacy-peer-deps
```
ou atualize seu Node.
