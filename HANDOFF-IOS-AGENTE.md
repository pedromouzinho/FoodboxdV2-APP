# Handoff: levar o Foodboxd à App Store

**Para quem é:** um agente (Claude Code ou equivalente) a correr no Mac do dono
do produto, com Xcode, sessão do Firebase e um browser autenticado.

**Porque existe:** o trabalho web foi feito num contentor isolado, sem Xcode,
sem consolas e sem iOS. Tudo o que falta precisa de uma dessas três coisas.

**Como ler:** cada bloco diz **quem executa** e termina numa **prova** — um
comando ou um clique com resultado observável. Não avances sem a prova. Um passo
falhado que passa despercebido custa mais adiante do que custa aqui.

> ⚠️ **Antes de tudo, lê o [`CLAUDE.md`](CLAUDE.md).** Somos dois agentes no
> mesmo ramo: puxa antes de começar, publica logo a seguir a cada commit, e
> nunca trabalhes a partir de um zip. Já custou um rebase evitável a alguém.

---

## Estado atual (agosto de 2026)

| | |
| --- | --- |
| Produção | https://foodboxd.pt — service worker `foodboxd-v77` |
| Ramo de trabalho | `claude/beautiful-davinci-vsyokk` |
| Projeto Firebase | `app-restaurantes-499400` (número `909243049168`) |
| Bundle ID | `pt.foodboxd.app` (em `capacitor.config.json`) |
| Publicar | GitHub Actions → **Deploy (produção)** → *Run workflow* |

**Já feito e em produção:** apagar conta (5.1.1v), textos de permissão redigidos,
haptics, barra de estado, splash, chave da Anthropic no Secret Manager.

**Feito mas ainda no ramo, por publicar:** o botão de Sign in with Apple no ecrã
de sessão (commit `ad86cda`).

**Por fazer:** tudo o que está neste documento.

> **Contexto que poupa tempo:** a app é vanilla JS sem framework nem build. Um
> `index.html`, um `css/style.css`, módulos IIFE em `js/`. Não introduzas
> frameworks nem bibliotecas de componentes — é decisão do dono, não descuido.

---

## Bloco 0 — Preflight · **agente**

```bash
git fetch origin claude/beautiful-davinci-vsyokk
git checkout claude/beautiful-davinci-vsyokk && git pull
npm install
```

Confirma que existe o que os blocos seguintes precisam:

```bash
node --version                      # 20+
xcodebuild -version                 # Xcode instalado
xcode-select -p                     # command line tools apontadas
pod --version                       # CocoaPods
echo "LANG=[$LANG]"                 # NÃO pode estar vazio — ver Bloco 2
```

**Prova:** os quatro comandos devolvem valores, nenhum erra.

Se algum falhar, **pára e diz qual**. Falhar aqui custa um minuto; falhar a meio
do `cap add ios` deixa um projeto meio gerado que é chato de limpar.

**Opcional — Firebase CLI.** Nenhum passo deste handoff precisa dele: o deploy
corre em GitHub Actions com o segredo `FIREBASE_SERVICE_ACCOUNT`, a prova do
Anexo A é `curl`, e o Bloco 1 é browser. A única coisa que se perde sem ele é o
emulador (`npm run emu:start`) — ver a nota no Bloco 4.2 sobre testar o apagar
conta. Instala-o só se quiseres essa rede de segurança.

> Esta linha era obrigatória na primeira versão deste documento, e não devia:
> mandava instalar uma ferramenta para correr um teste que não desbloqueava
> nada. Foi o primeiro agente a executá-lo que reparou.

**Nota:** o `package-lock.json` **está versionado** (commit `f1948ba`, que fixou
as versões de desenvolvimento). Se o `npm install` o alterar, decide: commita se
a mudança for real, ou `git checkout package-lock.json` se for só reordenação.
Não o deixes pendurado.

---

## Bloco 1 — Consolas · **humano executa, agente guia e verifica**

O agente **não consegue** fazer este bloco: o portal da Apple e a consola do
Firebase exigem autenticação de dois fatores. O que o agente faz é ditar os
valores exatos e, no fim, provar que resultou.

### 1.1 App ID (Apple)

developer.apple.com/account/resources → **Identifiers** → **+** → *App IDs* → *App*

- Description: `Foodboxd`
- Bundle ID (Explicit): **`pt.foodboxd.app`** — tem de ser igual ao do
  `capacitor.config.json`, senão o build não assina
- Capacidades: liga **Sign in with Apple**
- Continue → Register

### 1.2 Services ID (Apple)

**Identifiers** → **+** → *Services IDs*

- Description: `Foodboxd Web`
- Identifier: **`pt.foodboxd.web`**
- Register. **Volta a abri-lo**, liga *Sign in with Apple* → **Configure**:
  - Primary App ID: `pt.foodboxd.app`
  - Domains: `app-restaurantes-499400.firebaseapp.com`
  - Return URLs: `https://app-restaurantes-499400.firebaseapp.com/__/auth/handler`

> ⚠️ **Aqui é onde isto costuma emperrar.** A Apple pode exigir verificação do
> domínio, e `firebaseapp.com` não é do dono para verificar. Se isso acontecer,
> **salta para o Anexo A** — não tentes contornar.

### 1.3 Chave (Apple)

**Keys** → **+** → nome `Foodboxd Sign in with Apple` → liga *Sign in with Apple*
→ *Configure* → Primary App ID `pt.foodboxd.app` → Continue → Register

- **Descarrega o `.p8`.** Só se descarrega **uma vez**. Fechar a página sem
  guardar significa apagar a chave e criar outra.
- Aponta o **Key ID** (na página da chave) e o **Team ID** (canto superior
  direito do portal, 10 caracteres).

### 1.4 Provider (Firebase)

Firebase → **Authentication → Sign-in method → Add new provider → Apple → Enable**

- Services ID: `pt.foodboxd.web`
- Apple team ID / Key ID: os do passo anterior
- Private key: o conteúdo **inteiro** do `.p8`, incluindo `-----BEGIN PRIVATE KEY-----`
  e `-----END PRIVATE KEY-----`
- Save

Confirma também **Authentication → Settings → Authorized domains**: têm de lá
estar `foodboxd.pt`, `app-restaurantes-499400.web.app`,
`app-restaurantes-499400.firebaseapp.com` e `localhost`.

### 1.5 Referrer do Google Maps para a app nativa

**Faz isto no mesmo turno que o resto, é consola.** A WKWebView do Capacitor
serve de `capacitor://localhost`, que não está na lista de referrers da chave do
Maps. A própria Google diz o valor a autorizar na consola do browser:

```
Google Maps JavaScript API error: RefererNotAllowedMapError
Your site URL to be authorized: capacitor://localhost
```

Consola do Google Cloud → **APIs e serviços → Credenciais** → a chave do Maps →
*Restrições de aplicação* → acrescenta `capacitor://localhost`.

> Não se contorna por configuração. Mudar o `server.hostname` do Capacitor para
> `foodboxd.pt` faria o handler local intercetar `/api/ai` e `/api/conta`, e
> partia o "Pergunta-me" e o apagar conta. Testado e descartado.

### 1.6 Publicar o botão

O código do botão está no ramo mas não em produção. GitHub Actions →
**Deploy (produção)** → *Run workflow*, ref `claude/beautiful-davinci-vsyokk`,
**funções desligadas** (é só hosting).

**Prova do bloco 1** — e é a única que conta:

```bash
curl -s https://foodboxd.pt/index.html | grep -c signin-apple-btn   # 1
```

Depois, no browser: foodboxd.pt → **Entrar** → **Iniciar sessão com a Apple**.
Tem de abrir o ecrã da Apple e voltar com sessão iniciada. Confirma no Firebase
→ Authentication → Users que apareceu um utilizador com provider `apple.com`
**e com nome preenchido** (ver a nota do nome no Anexo B).

---

## Bloco 2 — Projeto nativo · **agente**

```bash
npx cap add ios
```

> ⚠️ **Define o `LANG` antes de correr isto.** É o que rebenta, e o erro engana:
>
> ```
> Unicode Normalization not appropriate for ASCII-8BIT (Encoding::CompatibilityError)
> ```
>
> Com `LANG` vazio e `LC_CTYPE=C`, o CocoaPods 1.17 sobre Ruby 4 morre assim — e
> morre **a meio**: o `cap add ios` já gerou o `.xcodeproj`, o `.xcworkspace` e o
> `Podfile`, e só depois falha no `pod install`. Quem vir o erro vai suspeitar do
> Ruby, do Homebrew ou do CocoaPods; a correção é uma variável de ambiente.
>
> ```bash
> export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
> ```
>
> Não é preciso limpar nada: basta correr `pod install` por cima.
>
> **O deployment target NÃO é problema.** Uma versão anterior deste documento
> avisava que o Xcode 26 recusaria o target iOS 13 do Capacitor 6. Está errado —
> compilou sem um único aviso. Era uma suspeita minha escrita como se fosse
> diagnóstico, e o primeiro agente a executá-la refutou-a.

Depois edita `ios/App/App/Info.plist` e acrescenta os três textos de permissão.
**Copia-os de `SETUP_IOS.md`, ponto 3 — não os reescrevas.** Foram redigidos
para a App Review, que rejeita justificações genéricas, e estão na linguagem da
app (tratamento por tu, português europeu).

Ícone e splash: ver `SETUP_IOS.md`, ponto 2.

```bash
npm run sync     # build:www + cap sync ios
```

**Prova:**

```bash
test -d ios/App && echo "projeto gerado"
plutil -p ios/App/App/Info.plist | grep -c UsageDescription    # 3
```

E abre `ios/App/App.xcworkspace` no Xcode: tem de compilar para simulador sem
erros (ainda sem assinatura de device).

---

## Bloco 3 — Login dentro da app nativa · **agente** · ⚠️ o trabalho a sério

**Lê isto antes de começar.** É o único ponto do handoff onde o que está escrito
no código **não foi verificado por ninguém**.

O `index.html` autentica com `signInWithPopup`, para Google e para Apple. Dentro
da WKWebView do Capacitor, `signInWithPopup` **frequentemente não funciona** — é
o ponto 1 do `SETUP_IOS.md`, escrito antes de o Apple existir. Ou seja:
provavelmente **nenhum dos dois logins funciona na app nativa**, e sem login não
há app: o diário, os amigos e o perfil vivem todos de ter conta.

A parte web está certa e é a que a diretriz 4.8 exige — mas é meio caminho.

**Mas mede antes de reescrever.** O primeiro agente a correr isto testou dentro
da WKWebView e encontrou o contrário do que este documento receava:

```
import gstatic: OK (22 exports) · fetch gstatic: 200
FirebaseAuth existe? true · configured? true
```

O SDK carrega e o Auth inicializa. O login não funcionava por outra razão — o
arranque da app morria antes de lá chegar, por causa do referrer do Maps (ver
1.5). **Autoriza o referrer, volta a testar, e só depois decide.** Pode ser que
não seja preciso plugin nenhum.

**Se for preciso:** `@capacitor-firebase/authentication`, com login nativo para
os dois providers e a web a continuar em popup. Alternativa mais barata:
`signInWithRedirect`.

Onde pendurar a bifurcação — já existe deteção de contexto:

- `index.html:671` — põe `is-native` no `<html>` quando `Capacitor.isNativePlatform()`
- `js/app.js:1904` — `matchMedia("(display-mode: standalone)")` para a PWA

O bridge do Firebase está em `index.html`, à volta da linha 800: `window.FirebaseAuth`
expõe `signIn`, `signInApple`, `signOut`, `onChange`, `getToken`, `current`.
**Mantém esta interface** — `js/auth.js` e `js/app.js` só falam com ela, por isso
a troca pode ficar contida no bridge sem tocar no resto da app.

Atenção ao nome vindo da Apple: ver Anexo B. A lógica atual está no bridge
(`guardarNomeDaApple`) e o caminho nativo precisa do equivalente — o plugin
devolve o nome noutro sítio.

**Prova:** no simulador, entrar com Google **e** com Apple, e em ambos os casos
o nome aparecer no separador Perfil. Sem isto o Bloco 4 não vale a pena.

---

## Bloco 4 — Build e submissão · **humano decide, agente prepara**

### 4.1 Assinatura — humano
Xcode → target **App** → *Signing & Capabilities* → escolher a equipa. Ligar a
capacidade **Sign in with Apple** também aqui (é separada do portal).

### 4.2 Build — agente
Simulador primeiro, device depois. Testar: entrar, registar uma visita com foto,
"Pergunta-me" (pede localização — confirmar que o texto da permissão aparece e
que é pedida **só aí**, nunca no arranque), e **apagar conta**.

> **Testa o apagar conta com uma conta acabada de criar, sem amigos e sem
> grupos.** É irreversível e, sem emulador, corre contra a base de dados real. A
> eliminação não se limita à conta: apaga também arestas de `follows` e mexe em
> grupos. Numa conta virgem o raio de ação é zero; na tua conta do dia a dia,
> não é.
>
> Se instalaste o Firebase CLI (opcional no Bloco 0), testa antes no emulador:
> `npm run emu:start` e `npm run emu:seed`.

### 4.3 Etiquetas de privacidade — agente prepara, humano submete

A App Store Connect obriga a declarar isto item a item. Levantado do código, não
de memória:

| Dado | Onde acontece | Declarar como |
| --- | --- | --- |
| Nome e email | Google/Apple Sign-In (`js/userdata.js:56`) | Identificadores · associado ao utilizador |
| Fotografia de perfil | `photoURL` do provider | Dados de contacto · associado |
| Fotos de pratos | `FirebaseStorage.upload` (`js/app.js:1301,1770,2126`) | Conteúdo do utilizador · associado |
| Críticas, notas, pratos | `userData/{uid}` no Firestore | Conteúdo do utilizador · associado |
| **Localização precisa** | `navigator.geolocation` (`js/app.js:2312`) | Localização · associado · **usado só a pedido**, dentro do "Pergunta-me" |

**Não te esqueças da partilha com terceiros.** O "Pergunta-me" envia as notas
pessoais e o texto do perfil de gosto para a **Anthropic**, através da função
`ai`. Isso é partilha de conteúdo do utilizador com um terceiro e tem de ser
declarado — é o item mais fácil de esquecer e dos que a Apple verifica.

### 4.4 Nota para o revisor — humano
Conta de teste com dados dentro (uma conta vazia parece uma app vazia), e uma
linha a dizer onde estão o mapa, o social, as fotos e os leaderboards
(guideline 4.2 — ver `SETUP_IOS.md`, ponto 6).

---

## Anexo A — se a Apple exigir verificação do domínio

Passa-se a autenticar por `foodboxd.pt`, que é do dono e pode ser verificado.

1. Apple, na configuração do Services ID: domínio `foodboxd.pt`, return URL
   `https://foodboxd.pt/__/auth/handler`. Descarrega o ficheiro de verificação.
2. Põe-no em `.well-known/apple-developer-domain-association.txt` na raiz do
   repositório.

   ⚠️ **O `firebase.json` tem `'**/.*'` na lista `ignore`.** Isso exclui tudo o
   que começa por ponto — incluindo o `.well-known/`. Se publicares sem mexer
   nisso, o ficheiro **nunca chega ao site** e a Apple falha a verificação com
   uma mensagem que não diz porquê. Acrescenta uma exceção antes de publicar:

   ```json
   "ignore": ["...", "!.well-known/**", "**/.*"]
   ```

   (A ordem conta: a negação tem de vir **antes** do padrão que a apanharia.)
   Não há rewrites de catch-all neste projeto — só `/api/ai` e `/api/conta` —
   por isso o problema é mesmo só o `ignore`.
3. Publica o hosting e confirma:
   `curl -s https://foodboxd.pt/.well-known/apple-developer-domain-association.txt`
4. Verifica na Apple.
5. Em `index.html`, no `initializeApp`, troca
   `authDomain: CONFIG.FIREBASE_PROJECT_ID + ".firebaseapp.com"` por
   `authDomain: "foodboxd.pt"`.
6. Confirma que `foodboxd.pt` está nos *Authorized domains* do Firebase Auth.

**Testa o login com a Google depois desta troca.** Mudar o `authDomain` afeta os
dois providers, não só o Apple.

---

## Anexo B — o nome que a Apple só dá uma vez

A Apple devolve o nome da pessoa **na primeira autorização e nunca mais**, e o
Firebase **não** o grava sozinho no perfil. Sem tratar disto, todas as contas
criadas por Apple ficam sem nome para sempre — e com *"Ocultar o meu email"*
ativo, o fallback é um endereço `@privaterelay.appleid.com`, que não serve como
nome de pessoa num ecrã de amigos.

A app já trata disto no caminho web (`guardarNomeDaApple`, em `index.html`): lê
`getAdditionalUserInfo(cred).profile.name` e chama `updateProfile`.

**Para testar de novo depois de mexeres:** não chega apagar o utilizador no
Firebase. É preciso ir a *appleid.apple.com → Início de sessão e segurança →
Iniciar sessão com a Apple* e **parar de usar** a app — só assim a próxima
autorização volta a ser "a primeira" e a devolver o nome.

---

## O que este documento não sabe

- **Se o Bloco 3 resolve mesmo o login na WKWebView.** A recomendação vem da
  documentação e do que estava escrito no `SETUP_IOS.md`; não foi corrida em iOS
  por ninguém. Se o plugin não servir, o plano seguinte é `signInWithRedirect`.
- **Se a Apple aceita o domínio do Firebase sem verificação** (ver Anexo A).
- **Quanto tempo demora a App Review** nem o que ela vai levantar.

Se alguma destas se resolver, vale a pena voltar aqui e escrever a resposta.
Este documento existe porque a informação anterior vivia numa conversa e
perdeu-se.
