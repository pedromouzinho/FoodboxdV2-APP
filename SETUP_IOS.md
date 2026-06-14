# Foodboxd — app iOS nativa (Capacitor)

Esta pasta já tem o **scaffold Capacitor** preparado. O projeto nativo iOS
(`ios/`) e as dependências (`node_modules/`) **geram-se no teu Mac** — não vêm
no repositório. Segue os passos abaixo **no teu Mac M3**, no teu clone local da
branch.

> **Conceito-chave:** o que a app empacota é só o **código/UI** (HTML/CSS/JS).
> Os **dados** (restaurantes da comunidade, fotos, críticas, atividade dos
> amigos) continuam **sempre live do Firebase** pela rede — empacotar não
> congela os dados. Só mudar o **código** exige `npm run sync` + recompilar
> (ou um sistema de OTA, ver no fim).

---

## Pré-requisitos (uma vez)

- **Xcode** (App Store) — abre uma vez para instalar os componentes.
- **Node 18+**.
- **CocoaPods**: `brew install cocoapods` (ou `sudo gem install cocoapods`).
- **Apple Developer Program** (99 USD/ano) para TestFlight/App Store.

## 1. Instalar + gerar o projeto iOS (uma vez)

```bash
cd <pasta-do-repo>
npm install
npm run build:www          # cria www/ a partir do código web
npx cap add ios            # gera a pasta ios/ (projeto Xcode + Pods)
npx cap sync ios
```

## 2. Ícone e splash nativos

```bash
# Coloca um ícone 1024x1024 em  resources/icon.png
# e um splash 2732x2732 (logo centrado em #f6f1e8) em  resources/splash.png
npm install -D @capacitor/assets
npx capacitor-assets generate --ios
```

## 3. Abrir no Xcode e correr

```bash
npx cap open ios
```

No Xcode:
- Target **App** → **Signing & Capabilities** → escolhe o teu **Team** (a tua
  conta Apple Developer). O **Bundle Identifier** já está como `pt.foodboxd.app`.
- Corre num **simulador** (▶) ou num iPhone real ligado.

## 4. Sempre que mudares o código web

```bash
npm run sync     # reconstrói www/ e copia para o iOS
# ou:  npm run ios   (sync + abre o Xcode)
```

## 5. Submeter à App Store

1. No **App Store Connect**, cria a app com o bundle id `pt.foodboxd.app`,
   preenche nome (**Foodboxd**), descrição, screenshots, política de
   privacidade, etc.
2. No Xcode: **Product → Archive → Distribute App → App Store Connect**.
3. Submete para revisão (≈ 1–3 dias).

---

## ⚠️ Pontos a resolver para o build nativo

1. **Login Google dentro do WKWebView:** a app web usa `signInWithPopup`, que
   muitas vezes **não funciona** dentro da webview do Capacitor. Para o nativo,
   o caminho recomendado é o plugin **`@capacitor-firebase/authentication`**
   (Google Sign-In nativo) ou `signInWithRedirect`. A **web/PWA não é afetada**.
2. **Domínios autorizados no Firebase Auth:** confirma que `foodboxd.pt`,
   `app-restaurantes-499400.web.app` e `localhost` estão em
   *Authentication → Settings → Authorized domains*.
3. **Permissões iOS (Info.plist):** se usares câmara/galeria para fotos, junta
   `NSPhotoLibraryUsageDescription` / `NSCameraUsageDescription`.
4. **Guideline 4.2 (App Review):** a app tem funcionalidade real (mapa, social,
   fotos, leaderboards), o que costuma passar; ainda assim convém destacar essas
   features na nota para o revisor.

## Atualizar código sem resubmeter (opcional, OTA)

Para empurrar mudanças de **código** (JS/HTML/CSS) sem passar pela App Store,
podes adicionar **Live Updates**:
- **Capgo** (open-source/self-host ou pago) — `@capgo/capacitor-updater`.
- **Ionic Appflow** (Live Updates) — serviço pago da Ionic.

A Apple permite (guideline 3.3.1) desde que não alteres código nativo. Posso
preparar isto quando quiseres.
