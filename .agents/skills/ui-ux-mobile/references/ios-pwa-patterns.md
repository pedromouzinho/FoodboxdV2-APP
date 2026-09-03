# iOS PWA Patterns & Gotchas

> Referencia para o agente ui-ux-mobile sobre comportamentos especificos de PWAs no iOS.

## Safari/WebKit Standalone Mode

### Comportamentos Unicos
- **Sem barra de navegacao** — nao ha back button nativo; precisas de fornecer
- **100vh != viewport real** — usar `100dvh` (dynamic viewport height)
- **Pull-to-refresh nativo** — desactivar com `overscroll-behavior-y: none` no body
- **Rubber band scroll** — `overflow: hidden` no body + scroll interno nos containers
- **Sem API de haptics** — `navigator.vibrate()` nao funciona no iOS Safari
- **3D touch / long-press** — pode abrir menus contextuais indesejados
- **Status bar overlap** — `viewport-fit=cover` + `env(safe-area-inset-top)`

### Meta Tags Obrigatorias
```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Foodboxd" />
<link rel="apple-touch-icon" href="icons/icon-192.png" />
```

### Splash Screens (iOS)
- Necessario um `<link rel="apple-touch-startup-image">` por resolucao
- Deve corresponder EXACTAMENTE ao device pixel ratio + orientation
- Se falhar, mostra ecra branco longo no startup
- Resoluces em uso no Foodboxd: 750x1334, 828x1792, 1125x2436, etc.

### Service Worker no iOS
- Cache limit: ~50MB por origin (iOS pode purgar se o device ficar sem espaco)
- Background sync: NAO suportado
- Push notifications: suportado desde iOS 16.4 (mas so em standalone mode)
- A app "morre" quando sai do multitasking — estado em memoria perde-se
  - Mitigacao: persistir estado critico em localStorage/sessionStorage
  - Restaurar scroll position, tab activo, filtros activos ao reload

### Teclado Virtual
- `visualViewport.height` muda quando o teclado abre
- Inputs fixed no bottom: ficam tapados! Usar `position: sticky` ou scroll into view
- `inputmode="numeric"` abre numpad; `inputmode="search"` abre teclado com "Go"
- iOS faz zoom em inputs com font-size < 16px — SEMPRE >= 16px em inputs

### Safe Areas
```css
/* Notch (iPhone X+) */
padding-top: env(safe-area-inset-top);      /* ~47px */
padding-bottom: env(safe-area-inset-bottom); /* ~34px (home indicator) */
padding-left: env(safe-area-inset-left);     /* 0 em portrait */
padding-right: env(safe-area-inset-right);   /* 0 em portrait */
```
- Tab bar DEVE incluir o inset bottom (ou o home indicator tapa botoes)
- Modais full-screen: top inset para nao ficar atras da status bar

### Gestos iOS vs App
- **Swipe from left edge** — iOS interpreta como "back" (navega para pagina anterior)
  - Nao usar gestos custom perto da edge esquerda (< 20px)
- **Swipe from bottom** — iOS mostra o home indicator
  - Nao colocar alvos de toque nos ultimos 10px do ecra
- **Pinch** — pode activar zoom se `user-scalable=no` nao estiver no viewport
  - O Foodboxd usa `width=device-width, initial-scale=1.0` sem no-scale (OK)

## Capacitor (iOS Nativo)

### Diferencas vs PWA pura
- **WKWebView** — comportamento muito similar ao Safari standalone
- **Google Sign-In** — `signInWithPopup` FALHA em WKWebView!
  - Solucao: usar `@capacitor-firebase/authentication` plugin
  - Ou `signInWithRedirect` (menos fluido mas funciona)
- **Camera** — usar `@capacitor/camera` para melhor UX (nao `<input capture>`)
- **Status bar** — controlar via `@capacitor/status-bar` (overlay ou nao)
- **Splash** — controlar via `@capacitor/splash-screen` (esconder apos load)

### Build/Deploy
- `npm run build:www` → gera pasta `www/` com assets
- `npx cap sync ios` → copia www/ para o projecto Xcode
- Build e assinatura: SO no Mac com Xcode
- Apple Developer: 99 USD/ano obrigatorio para App Store

## Padroes Testados no Foodboxd

### Detalhe como Bottom Sheet
- Abre de baixo para cima com `transform: translateY(0)` (was 100%)
- Drag handle visivel no topo (40px area)
- Swipe down: threshold > 100px de deslocamento → fecha
- Velocidade: se swipe rapido (> 0.5px/ms) fecha mesmo sem threshold
- Background: mapa visivel atras (dark overlay parcial)

### Pull to Refresh
```javascript
let startY = 0;
element.addEventListener('touchstart', e => {
  if (element.scrollTop === 0) startY = e.touches[0].clientY;
}, { passive: true });

element.addEventListener('touchmove', e => {
  const diff = e.touches[0].clientY - startY;
  if (diff > 80 && element.scrollTop === 0) {
    triggerRefresh();
  }
}, { passive: true });
```
- Mostrar indicador visual (spinner ou pull indicator)
- Desactivar durante o refresh (prevenir double-trigger)
- `overscroll-behavior-y: none` no body para prevenir o pull nativo do browser

### A2HS (Add to Home Screen)
- iOS nao tem evento `beforeinstallprompt`
- Mostrar banner manual com instrucoes ("Partilhar > Ecra principal")
- Guardar dismissal em `foodboxd.a2hsDismissed`
- So mostrar apos 2+ sessoes (nao no primeiro uso)
