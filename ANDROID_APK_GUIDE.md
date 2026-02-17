# 📱 Como Gerar APK Android para o Nexus Tech (via Bubblewrap)

Este guia explica como transformar seu PWA Técnico em um aplicativo Android (.apk / .aab) real e assinado, pronto para a Play Store ou instalação direta.

> **Nota:** Como eu sou uma IA rodando em servidor, não tenho acesso ao Android SDK para compilar o binário final, mas preparei todo o ambiente para você rodar apenas **3 comandos** e pegar seu APK.

## Pré-requisitos
Você precisa ter instalado no seu computador:
1. **Node.js** (v14+)
2. **JDK 8+** (Java Development Kit)
3. **Android Studio** (ou apenas o Android CLI Tools configurado)

## Passo a Passo Rápido

### 1. Instale o Bubblewrap CLI
Abra seu terminal e rode:
```bash
npm install -g @bubblewrap/cli
mkdir nexus-android
cd nexus-android
```

### 2. Inicialize o Projeto Android
O Bubblewrap vai baixar seu manifesto e configurar o projeto Java/Kotlin automaticamente.
Use a URL de produção onde seu PWA já está rodando:

```bash
bubblewrap init --manifest https://app.nexusline.com.br/tech-manifest.json
```

**Responda às perguntas:**
*   **Domain:** `app.nexusline.com.br`
*   **Application Name:** Nexus Tech
*   **Short Name:** Nexus Tech
*   **Application ID:** `br.com.nexusline.tech` (Sugerido)
*   **Version:** 1.0.0
*   **Maskable Icon:** Yes (O manifesto já está configurado)

### 3. Compile o APK
Agora gere o arquivo:

```bash
bubblewrap build
```

O Bubblewrap vai pedir para criar uma chave de assinatura (Keystore) na primeira vez. Guarde a senha e o arquivo `android.keystore` em local seguro! Sem eles você não consegue atualizar o app na Play Store depois.

## Onde estará o arquivo?
Ao final, você terá dois arquivos na pasta:
*   `app-release.apk` -> Para instalar diretamente em celulares (sideload).
*   `app-release-bundle.aab` -> Para subir na Google Play Store.

---

## 🔧 Ajustes que já fiz para você
Já deixei configurado no projeto:
1.  **Manifesto Exclusivo (`tech-manifest.json`):** Garante que o app abra direto na tela de login técnico, isolado do Admin.
2.  **Ícones Mascaráveis:** Configurados para se adaptar a ícones redondos/quadrados do Android.
3.  **Service Worker:** Otimizado para cache offline no Android.
