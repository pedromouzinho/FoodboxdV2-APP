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

## Estado atual (21 de agosto de 2026)

| | |
| --- | --- |
| Produção | https://foodboxd.pt — service worker `foodboxd-v83` (por publicar: **v85**) |
| Ramo de trabalho | `claude/beautiful-davinci-vsyokk` |
| Projeto Firebase | `app-restaurantes-499400` (número `909243049168`) |
| Bundle ID | `pt.foodboxd.app` (em `capacitor.config.json`) |
| Publicar | GitHub Actions → **Deploy (produção)**, ou pela API do GitHub |

**Blocos 0, 1, 2 e 3: feitos.** Falta o 4.

**Em produção:** apagar conta (5.1.1v), **Sign in with Apple**, a marca nova em
toda a app, favicon, haptics, barra de estado, splash, a chave da Anthropic no
Secret Manager, a rede de segurança do arranque (a app já não precisa do Google
Maps para arrancar), e o `/api/` absoluto no nativo.

**Por fazer:** ver a tabela **"O que falta, por ordem"**, no fim — é o estado, e
é lá que se atualiza. Em resumo: o login nativo funciona com a **Google e com a
Apple**, com sessão real e nome certo no Perfil. Falta o Bloco 4.

> **Lê a secção "O que esta sessão apurou"**, no fim deste documento, antes de
> começares. Tem cinco coisas que só se souberam a correr a app, e três delas
> poupam-te trabalho que já está feito.

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

## Bloco 1 — Consolas · ✅ **FEITO em 21/08/2026**

O dono fez as três consolas. **Não precisas de repetir nada disto** — fica como
referência, e para a próxima app.

**A prova:** existe no Firebase um utilizador com provider `apple.com`, criado a
21 de agosto, e o `capacitor://localhost` está autorizado nos referrers da chave
do Maps (o mapa carrega no simulador).

**Duas coisas que vale a pena saber para não voltares a duvidar:**

- A Apple **não** exigiu verificação do domínio no passo 1.2. O `firebaseapp.com`
  passou. **O Anexo A nunca foi preciso.**
- O `http://localhost` **não** foi autorizado, e não faz falta: os arneses
  deixaram de precisar da chave do Maps.

O agente **não conseguia** fazer este bloco: o portal da Apple e a consola do
Firebase exigem autenticação de dois fatores. O que fez foi ditar os valores e
provar o resultado.

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

### 1.4b App iOS no Firebase, e o `GoogleService-Info.plist`

**Sem isto o login nativo não arranca**, e o modo de falha não é suave: o
`@capacitor-firebase/authentication` chama `FirebaseApp.configure()` ao carregar,
não encontra o ficheiro, levanta uma exceção não apanhada e a **app morre no
arranque** — ecrã preto, antes de mostrar o que quer que seja. Medido: instalei
o plugin, a app deixou de abrir, desinstalei-o e voltou.

Firebase → **Definições do projeto → Os teus apps → Adicionar app → iOS**

- Bundle ID: **`pt.foodboxd.app`** — o mesmo do `capacitor.config.json` e do
  App ID da Apple, senão o ficheiro que sai não serve
- Nome (App nickname): `Foodboxd iOS`
- App Store ID: deixa vazio, ainda não existe
- **Descarrega o `GoogleService-Info.plist`** e põe-no na **raiz do
  repositório**, não dentro de `ios/`

A raiz é de propósito: `ios/` é gerada e está no `.gitignore`, portanto o que lá
estiver desaparece no clone seguinte. O `npm run sync` copia-o para
`ios/App/App/` sozinho — e enquanto não existir, diz que não existe em vez de
falhar em silêncio.

> Sem sair da consola: o registo da app iOS também cria o **OAuth client ID de
> iOS** que o login nativo com a Google usa. É por isso que este passo pertence
> ao bloco das consolas e não ao trabalho do agente.

**Prova:** `npm run sync` diz `GoogleService-Info.plist copiado para o projeto
iOS`, e a app abre no simulador com o plugin instalado.

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

## Bloco 3 — Login dentro da app nativa · **agente**

**Metade está feita e commitada.** A outra metade está bloqueada num ficheiro de
consola. Não repitas a investigação — foi feita duas vezes, e a primeira resposta
estava errada.

### O que já está resolvido (`99abd8f`)

O problema **nunca foi o `signInWithPopup`**. Era mais cedo: a instância de Auth
nunca chegava a inicializar.

```
_isInitialized=false   _deleted=false
authStateReady: PENDURADO em 10s
onChange: NUNCA disparou
```

Sem erro, sem aviso, sem rejeição — o objeto existe, responde a tudo, e nunca
fica pronto. Foi descartado antes o que parecia mais provável: o `localStorage`
escreve, o `indexedDB` abre, o SDK vem do gstatic com 200, o
`firebase-auth-ready` dispara. Nada disso era.

**A causa:** o resolver de popup/redirect que o `getAuth()` do bundle browser
regista por omissão valida a origem, e `capacitor://` não é http(s). Com
`initializeAuth(app, { persistence })` **sem resolver**:

```
_isInitialized=true
onChange DISPAROU  user=null
authStateReady RESOLVEU
```

E na app: o botão "Entrar" na barra, e o convite com as duas opções.

> **Isto ainda não é entrar** — é o que vinha antes. A sessão passa a poder
> existir, o Firestore e o Storage ficam com token, e o `signInWithCredential` do
> plugin tem onde assentar. **Sem isto**, o plugin entraria nativamente e o SDK
> web ficaria sem saber de nada — e a camada de dados teria de migrar toda para
> `@capacitor-firebase/firestore` e `/storage`. Já não precisa.

**Também já foi fechada a porta ao atalho:** `iosScheme: "https"`, com a config
confirmada dentro do bundle compilado e a app reinstalada de fresco — a origem
continuou `capacitor://localhost`. O Capacitor 6 ignora-o sem dizer nada. Não
voltes a tentar.

### O que falta, e onde parou

O `@capacitor-firebase/authentication@6.3.1` instala, compila, os pods entram —
**e a app deixa de abrir**:

```
*** Terminating app due to uncaught exception 'com.firebase.core'
    `FirebaseApp.configure()` could not find a valid GoogleService-Info.plist
```

Ecrã preto no arranque. O plugin chama `FirebaseApp.configure()` no `load()`, e
sem o ficheiro isso é exceção não apanhada. **Foi desinstalado de propósito** —
não se deixa o ramo com a app morta.

**O desbloqueio é do dono e é consola:** registar a app iOS no Firebase e pôr o
`GoogleService-Info.plist` na raiz do repositório. Ver o **passo 1.4b**. Esse
mesmo registo é o que cria o OAuth client ID de iOS que o login com a Google usa.

A canalização já está feita: o `scripts/ios-info.mjs` copia o `.plist` da raiz
para `ios/App/App/` a cada `npm run sync`, e enquanto não existir avisa:

```
ios-info: sem GoogleService-Info.plist na raiz — o login nativo fica por ligar
```

### Onde parou de verdade (`667eecc`) — o `.plist` já lá está

O `.plist` entrou e **a app já não morre no arranque**: instalação limpa, zero
exceções. Copiar o ficheiro para a pasta **não chega** — se não estiver nos
recursos do projeto Xcode não entra no bundle e o `FirebaseApp.configure()`
continua a não o encontrar. Custou um build a descobrir. O `ios-info.mjs` passou
a fazer as três: copia, regista no `project.pbxproj`, e escreve o URL scheme do
login com a Google lido do `REVERSED_CLIENT_ID` do próprio plist — para não haver
dois sítios com o mesmo valor a divergir.

**A ponte está escrita e revista.** O plugin devolve uma credencial, ela entra no
SDK web por `signInWithCredential`, e daí para a frente é tudo igual à web: mesmo
`currentUser`, mesmo token, Firestore e Storage sem saberem que houve caminho
diferente. Com `skipNativeAuth: true` de propósito — sem isso ficavam dois
estados de sessão lado a lado, e quem manda é o SDK web, que é quem a app lê.
O nome da Apple no caminho nativo vem em `r.user.displayName`, do resultado do
plugin, e é guardado no mesmo sítio. O `signOut` fecha os dois lados.

### O pod que não ligava — **resolvido** (`b27febe`)

Eram **duas** causas encadeadas, e nenhuma delas era a que se suspeitava. Ficam
escritas porque as duas falham em silêncio: nenhuma dá erro, aviso ou rejeição.

> ⚠️ **A suspeita do `static_framework = true` × `use_frameworks!` estava
> ERRADA.** O `build_type` é `static framework` também nas variantes que
> funcionam. Não voltes a esse caminho.

**Causa 1 — a linha do Podfile fazia o pod não compilar nada.**

O podspec declara `s.source_files` só na spec **raiz**, e no `cocoapods-core` o
`source_files` **não é um atributo herdado** pelas subspecs
(`Attribute#inherited?` é falso; `consumer.rb` corta a herança). Quando o Podfile
pede só subspecs, a raiz nunca entra no target: ele fica com **zero** ficheiros,
o `PodTarget#should_build?` dá falso, e o CocoaPods instala um
**`PBXAggregateTarget` de placeholder** — um target que não compila nada e não
produz produto. Daí o `nm` a zero e a ausência no `OTHER_LDFLAGS`.

| Linha no Podfile | `should_build?` | source files |
|---|---|---|
| `:subspecs => ['Google']` | falso | 0 |
| `:subspecs => ['Lite', 'Google']` | falso | 0 |
| **raiz + `/Google`, em duas linhas** | **verdadeiro** | **26** |

Depois da correção: `PBXNativeTarget` do tipo framework, `-framework
"CapacitorFirebaseAuthentication"` no `OTHER_LDFLAGS`, e **22 símbolos** de
`FirebaseAuthenticationPlugin` no binário, onde antes eram 0.

A linha do subspec vive no `# Add your Pods here`, **dentro do target e fora do
`def capacitor_pods`**: o `cap sync` regenera esse `def` a cada corrida e
apagava-a de lá.

**Causa 2 — o plugin não criava o handler da Google.**

Mesmo ligado e compilado, o `signInWithGoogle` continuava a não voltar. O plugin
só instancia o `GoogleAuthProviderHandler` **se** `config.providers` contiver o
provider (`FirebaseAuthentication.swift:654`). Sem a lista declarada, a chamada
vai para um handler nulo e a promessa fica pendurada — outra vez sem erro. O
`capacitor.config.json` passa a declarar:

```json
"FirebaseAuthentication": { "skipNativeAuth": true, "providers": ["apple.com", "google.com"] }
```

**Um conflito que aparece mesmo num clone de raiz**, e que o `ios-info.mjs` já
trata sozinho: o `cap sync` resolve os pods **antes** de a linha do subspec
existir, prende o `GTMSessionFetcher` em 4.5.0, e o `GoogleSignIn` 7.1.0 recusa.
O script apanha o conflito pelo nome e corre `pod update GTMSessionFetcher`, que
resolve para 3.5.0.

### Causa 3 — o `keychain error`, o mais mudo dos três

Com tudo o resto ligado, a folha da Google abria, a pessoa autenticava-se, a
folha fechava — **e a app não mudava de estado**. O que chegava ao JS era:

```
FALHOU: code=undefined msg=keychain error
```

Nada sobre entitlements. O GoogleSignIn guarda o token no keychain, e sem grupo
de acesso o `SecItemAdd` não passa. A app compilava **sem entitlements nenhuns**:
não há identidade de assinatura na máquina (`security find-identity` → *0 valid
identities*) e o `cap add ios` gera o projeto sem `CODE_SIGN_ENTITLEMENTS`.

Ficam em `ios-entitlements.plist`, na raiz, e o `ios-info.mjs` copia-os e aponta
lá a definição. O `$(AppIdentifierPrefix)` serve os dois mundos: com equipa
resolve para `TEAMID.pt.foodboxd.app`, que é o que o build assinado exige; sem
equipa fica vazio e dá `pt.foodboxd.app`, que é o que o simulador aceita.

> ⚠️ **Duas armadilhas aqui, ambas custaram tempo.**
>
> `codesign -d --entitlements` mostra um **dict vazio** nesta app, mesmo quando
> os entitlements estão a funcionar. Num build de simulador sem equipa o Xcode
> não os embute na assinatura, mas o simulador aplica-os à mesma. Não acredites
> nesse comando — confirma no log do `securityd`, que mostra
> `inserted <genp,acct=OAuth,svce=auth,agrp=pt.foodboxd.app,...>`.
>
> A definição `CODE_SIGN_ENTITLEMENTS` tem de ir **só nas configurações do
> target da app**. Passá-la na linha de comandos aplica-a também aos Pods, e aí
> o caminho relativo não resolve: o build rebenta com *"Build input file cannot
> be found"* em cada pod.

### Onde o login está agora, medido no simulador

**Google: ✅ FEITO.** Com a `ios/` apagada e regenerada do zero, `npm run sync`,
build e instalação limpos:

```
plugin devolveu: idToken len=1233 · accessToken len=253
onChange -> SESSAO <conta>@gmail.com
signInWithCredential OK -> uid=...
```

E no ecrã: o avatar na barra, o Perfil com nome e foto reais, 13 restaurantes,
17 pratos, 8 amigos, os sítios visitados preenchidos no mapa. Dados do Firestore
real, autenticados.

**Apple: ✅ FEITO.** Com um Apple ID nas Definições do simulador, o login passa e
o Perfil mostra o nome certo — não o "Amigo" do fallback.

O que o plugin devolve, medido (sem valores de token):

```
raiz: credential,additionalUserInfo,user
user: (null)
credential: nonce,idToken,providerId,authorizationCode
  idToken=str(914)  nonce=str(32)  accessToken=undefined
signInWithCredential OK -> uid=iPxT5...  displayName="Pedro Mouzinho"
```

Três coisas que isto fecha:

- **O `rawNonce` não parte.** O plugin devolve o nonce em claro, 32 caracteres, e
  o Firebase aceita-o. Era o sítio onde isto costuma dar `auth/invalid-credential`.
- **O `signInWithCredential` funciona** com a credencial da Apple, tal como com a
  da Google.
- **O `accessToken` vem `undefined`** — a Apple não devolve um neste fluxo, e não
  faz falta. Só o caminho da Google o usa.

> ⚠️ **O `user: (null)` não é defeito, e enganou-me à primeira.** Com
> `skipNativeAuth: true` o plugin devolve `user` **nulo quando a Apple não manda
> nome**, e `{ displayName: "..." }` quando manda — está em
> `FirebaseAuthenticationHelper.createUserResult`, no `guard let user = user else`.
> Ou seja: `r.user.displayName` **é** o sítio certo a ler no caminho nativo. Eu
> cheguei a escrever que era código morto; não é.

### A conta da Apple, lida da própria app

Não é preciso ir à consola para saber com que conta se está: o objeto do
utilizador do Firebase traz tudo. Medido com a sessão da Apple aberta:

```
uid            iPxT5Ywxd7QMGbAvQajbadxWYcg2
displayName    "Pedro Mouzinho"
email          …@privaterelay.appleid.com
emailVerified  true
criada em      Fri, 21 Aug 2026 10:15:22 GMT
providers      apple.com
  [apple.com]  nome=null
```

**É a mesma conta criada a 21 de agosto**, com *Ocultar o meu email* ligado.

O par que interessa é o último: o `providerData[apple.com].displayName` está a
**`null`** — a Apple nunca preencheu o nome no registo do provider — mas o
`user.displayName` de topo tem o nome certo. Em Firebase o de topo só lá chega
por `updateProfile`. **Logo, algum código guardou o nome**, e a conta não estava
assim a 21 de agosto, quando o Perfil mostrava "Amigo".

**O dono confirmou que NÃO fez o *parar de usar*.** Isso põe de pé a única
explicação que resta: a Apple mandou o nome numa autorização posterior à de 21 de
agosto, e um dos dois caminhos guardou-o. O mais provável é o nativo, na primeira
vez que correu — e isso descobriu o defeito abaixo.

### O "Amigo" era a interface a mentir, não a captura a falhar

O Perfil mostrou "Amigo" logo a seguir a um login com a Apple em que o nome foi
guardado na conta. As duas coisas são verdade ao mesmo tempo, por causa de uma
corrida:

```
signInWithCredential resolve
  -> onAuthStateChanged dispara JÁ, com displayName ainda a null
  -> a interface desenha "Amigo"
  -> só DEPOIS corre o updateProfile
```

E o `onAuthStateChanged` **não volta a disparar** quando só o perfil muda — ele
avisa mudanças de SESSÃO, não de perfil. Resultado: o nome fica certo na conta e
errado no ecrã **até ao arranque seguinte**.

Não é só do nativo. O caminho da web tem a mesma corrida —
`signInWithPopup(...).then(guardarNomeDaApple)` — e **esse está em produção**:
quem entrar com a Apple pela primeira vez em `foodboxd.pt` vê "Amigo" até
recarregar, mesmo tendo o nome guardado.

**Corrigido na ponte, que serve os dois**, com um canal **separado**:
`onProfileChange`. O `nomeGuardado()` faz `updateProfile` → `user.reload()` →
avisa **só** esse canal, e o `js/auth.js` regista lá o `renderUI` e mais nada.

> ⚠️ **A separação não é arrumação, é o que impede um estrago.** A primeira
> versão desta correção reavisava os ouvintes do `onChange` — e esse ouvinte não
> desenha só, corre o `onAuthChange` inteiro. O `onAuthChange` faz
> `await UserData.setUser(...)` e, a seguir, `startOnboarding()` se a conta não
> estiver marcada. Com o primeiro ainda pendurado no await, as duas passagens
> viam `isOnboarded()` falso — a marca só se escreve depois do `setUser` — e **o
> onboarding arrancava duas vezes**. Precisamente na primeira autorização da
> Apple, que é a única que existe, e a única onde a primeira impressão conta.

Medido no simulador:

```
ouvintes de perfil: 2  (a app + o de teste)
disparou o desenho?      SIM
disparou o onAuthChange? NAO (bom)
cancelar remove mesmo?   SIM (2 -> 1)
```

**E o chip é só metade.** O nome que os AMIGOS veem não sai do chip — sai do
`UserData`, pelo `upsertProfile`, e o `UserData` só o calcula uma vez, dentro do
`setUser`:

```js
displayName = user.displayName || emailUsavel || "Amigo";   // userdata.js
DB.upsertProfile(uid, { displayName, photoURL }, token);
```

Com *Ocultar o meu email* o `emailUsavel` é vazio, portanto o que vai para o
Firestore é **"Amigo"** — no perfil público, no `persistNow()` de cada gravação e
no `syncMineToGroup()`. Durante a primeira sessão inteira era assim que os amigos
dessa pessoa a viam. Curava-se no arranque seguinte, e é precisamente a primeira
sessão de uma conta acabada de criar que isso não serve.

O `UserData` ganhou `nomeMudou(novo)`: atualiza o nome em memória, refaz o
`syncMineToGroup()`, avisa o `onChange` do UserData para o Perfil se redesenhar,
e volta a escrever o `upsertProfile`. O `js/auth.js` chama-o do canal de perfil —
nunca pelo `onAuthChange`, pela razão do aviso acima.

Corrido primeiro contra o defeito, com o ramo como estava:

```
UserData.nomeMudou existe?  undefined
o UserData foi recalculado? NAO
>>> NAO HA CAMINHO do nomeGuardado ate ao UserData
```

E depois da correção, com a divergência forçada em memória para imitar a primeira
sessão da Apple:

```
antes:  auth="Pedro Mouzinho"  ·  UserData="Amigo"
  upsertProfile -> "Pedro Mouzinho"
recalculou? SIM · escreveu no Firestore? SIM · disparou o onAuthChange? NAO
```

> **Uma armadilha pelo caminho, e já estava anotada noutro sítio.** A primeira
> versão da guarda era `window.UserData && UserData.nomeMudou`, e nunca corria:
> o `UserData` é um `const` de topo, e um `const` de topo é **global léxico — não
> é propriedade do `window`**. É a mesma nota que está no `js/config.js` sobre o
> `CONFIG`. Falhava em silêncio, e só o ensaio contra o defeito é que a apanhou.

> **O que continua por exercitar** é a captura em si numa primeira autorização,
> com nome à frente. O caminho está lido no código do plugin e a re-emissão está
> medida, mas nunca correu de ponta a ponta com a Apple a mandar um nome. Se
> alguém fizer o *parar de usar*, faça-o com a instrumentação ligada — é a única
> passagem.

**Nota de produto, não defeito:** entrar com a Apple e entrar com a Google dão
**duas contas Firebase diferentes**, com uid e dados separados. Ver a secção
seguinte — isto não é trabalho futuro, já está publicado.

Para compilar com as flags certas sem as ter de lembrar: `npm run ios:build`.

**Uma porta que já está fechada, e convém saber porquê:** o `signInWithRedirect`
parecia a alternativa barata ao plugin. Não é — precisa do resolver de
popup/redirect, que é exatamente o que teve de sair para o Auth inicializar (ver
acima). Tirar o resolver e usar redirect são coisas incompatíveis. **O plugin é o
caminho.**

**Critério: metade cumprida.** Entrou-se com Google no simulador, com sessão
real e dados reais. A Apple falta só porque o simulador não tem Apple ID — não
por código.

**Nota para a Apple**, quando o resto destrancar: além disto, precisa da
capacidade *Sign in with Apple* ligada **no target do Xcode**, e isso exige a
equipa escolhida — é o Bloco 4.1, do dono. Com `CODE_SIGNING_ALLOWED=NO`, que é
como se compila aqui, o entitlement não se aplica.

**Mantém a interface do bridge.** `window.FirebaseAuth` expõe `signIn`,
`signInApple`, `signOut`, `onChange`, `getToken`, `current`, e o `js/auth.js` e o
`js/app.js` só falam com ela. A troca fica contida no `index.html`.

**Critério de feito:** entrar com Google **e** com Apple no simulador. A metade
da Apple depende também do App ID com a capacidade ligada — mesmo turno de
consolas.

E atenção ao nome vindo da Apple no caminho nativo: ver o ponto 4 da secção
final. O plugin devolve-o noutro sítio.

## Bloco 4 — Build e submissão · **humano decide, agente prepara**

### 4.1 Assinatura — ✅ a equipa já está no projeto (25/08)

**Não é preciso abrir o Xcode para isto.** O Team ID vive em
[`ios-build.json`](ios-build.json), versionado, e o `scripts/ios-info.mjs`
escreve-o no `project.pbxproj` a cada `npm run sync` — pelo mesmo motivo dos
textos de permissão e dos entitlements: a pasta `ios/` é gerada e descartável, e
o que se escolhe à mão no Xcode desaparece no clone seguinte.

```
ios-info: equipa de assinatura LGN8A4342T escrita em 2 configurações
ios-info: equipa de assinatura já era LGN8A4342T      <- na segunda corrida
```

Confirmado no ficheiro (duas configurações, Debug e Release) e com
`npm run ios:build` a passar depois de a pôr. O Team ID não é segredo: vai
dentro de todos os perfis de aprovisionamento.

**O que pode sobrar para o dono:** a capacidade **Sign in with Apple** é separada
do portal. Com o `applesignin` já no `ios-entitlements.plist`, a assinatura
automática costuma registá-la sozinha. Só se o build para **dispositivo** falhar
com *"provisioning profile doesn't include the com.apple.developer.applesignin
entitlement"* é que é preciso ir ao portal ligá-la — e isso ainda não foi
tentado, porque até agora só se compilou para simulador.

### 4.2 Build — agente
Simulador primeiro, device depois. Testar: entrar, registar uma visita com foto,
"Pergunta-me" (pede localização — confirmar que o texto da permissão aparece e
que é pedida **só aí**, nunca no arranque), e **apagar conta**.

#### O que já está medido no simulador (24/08/2026)

| O quê | Estado |
| --- | --- |
| Entrar com Google e com Apple | ✅ sessão real, nome certo, dados do Firestore |
| Localização **não** pedida no arranque | ✅ |
| Localização pedida **só** no "Pergunta-me" | ✅ |
| Texto da permissão de localização | ✅ igual ao de `ios-info.json`, palavra por palavra |
| "Pergunta-me" de ponta a ponta | ✅ resposta real da IA, com o perfil de gosto lá dentro |
| Leitura de fotos do Storage | ✅ o Diário mostra 15 sítios com fotos |
| Carregar foto para um sítio | ✅ sobe e aparece na ficha |
| Apagar conta | ✅ apaga, incluindo ficheiros do Storage |

O "Pergunta-me" a responder prova de caminho o `CONFIG.API_BASE`: o pedido saiu
de `capacitor://localhost` para `https://foodboxd.pt/api/ai` e voltou com
sugestões que citam o perfil de gosto da conta.

> ⚠️ **Aparecem DOIS pedidos de localização seguidos, e o segundo diz
> "localhost".** O primeiro é o nativo, com o texto certo. O segundo é da própria
> WKWebView:
>
> > *"localhost" would like to use your current location.*
>
> É a webview a tratar a página como um site e a pedir a sua própria permissão
> por cima da nativa. Duas caixas seguidas já é mau; a segunda dizer **localhost**
> a um utilizador é pior — não quer dizer nada a ninguém e parece avaria. **Não
> bloqueia a submissão, mas é dos detalhes que a App Review comenta.**
>
> A saída habitual é usar o `@capacitor/geolocation`, que faz a localização pelo
> lado nativo e entrega-a ao JS, e assim a webview nunca chega a pedir nada. É
> mudar o `navigator.geolocation` do `submitSmartSuggest` para o plugin, só no
> caminho nativo.

#### ✅ 3b — o segundo pedido de localização caiu (24/08)

**O dono decidiu adicionar o plugin.** Está feito, compila, e está medido:

- `@capacitor/geolocation@6.1.1` — a major certa; o Capacitor fica no 6 (§12 do
  `CONTEXT.md` diz porquê).
- `js/app.js` ganhou o `ondeEstou()`, que o `submitSmartSuggest` passa a usar. Na
  app nativa vai ao plugin; na web continua o `navigator.geolocation`, que é
  também a rede de segurança de um build nativo sem o plugin — melhor duas
  caixas do que nenhuma localização.
- Recusar a permissão devolve `null` e o "Pergunta-me" responde à mesma, só sem
  o "perto de mim". É o mesmo comportamento de antes.

**Que compila e vai lá dentro:**

```
$ npm run sync
[info] Found 6 Capacitor plugins for ios:  …  @capacitor/geolocation@6.1.1  …
$ xcodebuild … build
** BUILD SUCCEEDED **
```

E no `.app` instalado: `Frameworks/CapacitorGeolocation.framework`,
`public/js/app.js` com o `ondeEstou`, e o `NSLocationWhenInUseUsageDescription`
do `Info.plist` igual ao do `ios-info.json` palavra por palavra.

**✅ E está medido no simulador (24/08), com a permissão reposta.** Duas metades,
porque uma sozinha não chegava:

| O quê | Resultado |
| --- | --- |
| Quantas caixas de localização aparecem | **Uma.** A segunda, a dizer `"localhost"`, desapareceu |
| O que a caixa diz | `Allow "Foodboxd" to use your location?` + o texto do `ios-info.json` |
| As coordenadas chegam ao "Pergunta-me" | **Sim** — a resposta veio com distâncias reais |

Depois de *Allow While Using App*, o painel foi direto a "A pensar na melhor
escolha…" — **sem nada pelo meio**. E a resposta, com o simulador posto em
Lisboa, cita as distâncias, que é o que prova que o `near` não veio vazio:

```
Peixe fresco em Lisboa não falta. Da tua lista, a Guelra em Belém é aposta segura…
  Guelra        Belém, Lisboa · a 6 km
  Gambrinus     a menos de 1 km
  O alcochetano a 16 km
```

**Como se repete:**

```bash
xcrun simctl privacy booted reset location pt.foodboxd.app   # a caixa volta a aparecer
xcrun simctl location booted set 38.7223,-9.1393             # senão não há posição nenhuma
```

Depois: entrar → topbar, o botão das estrelinhas → escrever e enviar → **contar
as caixas**. Se voltar a aparecer a segunda a dizer `"localhost"`, o plugin não
está a ser usado, e o sítio a olhar é o `CONFIG.NATIVO` e o
`window.Capacitor.Plugins.Geolocation` dentro do `ondeEstou`.

> ⚠️ **O segundo comando não é um extra — é o que evita uma conclusão errada.**
> Um simulador acabado de arrancar **não tem posição nenhuma**. Sem ele, o
> plugin devolve erro, o `ondeEstou` devolve `null`, e a IA responde *"Sem a tua
> localização não consigo garantir o que está mesmo perto de ti"* — que é
> exatamente o que se veria se o plugin estivesse partido. Aconteceu na primeira
> passagem desta medição, e a leitura óbvia era a errada.

> **Nota de método para o registo de visita com foto:** o botão "foto" do
> formulário não é um seletor — a app diz "Podes acrescentar fotos depois". A
> foto entra pelo "Mudar foto" da ficha do sítio, ou pelo separador "A minha
> experiência" depois de a visita estar gravada. Quem testar isto conta com uma
> gravação real no diário da conta usada.

> **A fototeca não pede permissão, e isso é normal.** O carregamento usa um
> `<input type="file">`, que na WKWebView abre o `PHPickerViewController`. Esse
> seletor corre **fora do processo** da app e devolve só a imagem escolhida —
> por isso **nunca** dispara o `NSPhotoLibraryUsageDescription`. Não é sinal de
> que a permissão já tenha sido dada. O `NSCameraUsageDescription` só entra se
> alguém usar o caminho da câmara.

#### ✅ Apagar a conta — RESOLVIDO em 24/08

**A diretriz 5.1.1(v) exige que apagar a conta funcione.** Funciona, desde que os
papéis IAM foram dados. Medido no log da função:

```
16:05:17  conta: conta apagada iPxT5Ywxd7QMGbAvQajbadxWYcg2
  {"comentarios":0,"fotos":0,"sigo":0,"seguemMe":0,"convitesEnviados":0,
   "convitesRecebidos":0,"grupos":0,"ficheirosRestaurantes":0,
   "ficheirosAvatar":1,"conta":"apagada"}
```

Repara no `ficheirosAvatar: 1`: **a cascata apagou também um ficheiro do
Storage**, o que prova que o `roles/storage.objectAdmin` pegou — não só o
Firestore. E o `conta: "apagada"` fecha o `admin.auth().deleteUser()`.

A conta apagada foi a da **Apple** (`iPxT5Ywxd7…`), que estava a 0/0/0 e sem
amigos — o candidato descartável certo. Nenhum dado real foi tocado.

**O limite diário da IA também voltou:** houve chamadas ao `ai` às 17:53 e 18:53,
e o log **não** tem mais nenhum `rate-limit skipped` depois das 14:24, que é
anterior aos papéis.

#### ✅ 1b — o que acontece quando o Storage falha (decidido 24/08)

**A pergunta era:** o apagar conta devia falhar alto quando as fotos não saem?

**A decisão do dono: alto, mas não bloqueante.** A conta é apagada de qualquer
maneira. Prender quem quer sair porque uma foto ficou presa seria trocar a
diretriz 5.1.1(v) — que se acabou de derrubar — por arrumação.

O que mudou é que a falha deixou de se poder confundir com sucesso:

| Antes | Agora |
| --- | --- |
| `apagarFicheiros` devolvia `null` e seguia | devolve `{contagem, erro}` e tenta **duas vezes** |
| o `.catch(() => {})` engolia cada `delete` | os ficheiros que não saem são **contados e nomeados** |
| o `null` ia parar ao `console.log("conta apagada")` | `console.error("conta apagada COM ficheiros orfaos")` |
| não ficava registo nenhum | fica `apagarPendente/{uid}` com os prefixos e a data |

O `apagarPendente` é onde se vai buscar o que varrer. Nenhuma regra do
`firestore.rules` o menciona e não há regra catch-all, por isso nenhum cliente
lhe chega — só o Admin SDK. Guarda o mínimo: uid, prefixos, erro, data.

**Porque é que o `null` sozinho não chegava** — e isto é a parte que interessa a
quem vier: o `null` de uma falha e o `0` de quem nunca enviou uma foto iam parar
à **mesma linha de log de sucesso**. Foi assim que a falta do
`storage.objectAdmin` passou dias sem ninguém reparar. Não foi falta de registo,
foi registo indistinguível.

**Medido**, com o `getFiles` a recusar como recusava sem o papel IAM:

```
$ npm run test:apagar
apagar: ficheiros orfaos restaurants/ conta-a-apagar Missing or insufficient permissions.
apagar: ficheiros orfaos avatars/ conta-a-apagar Missing or insufficient permissions.
  contagem (storage em baixo): {…,"ficheirosRestaurantes":null,"ficheirosAvatar":null,
   "ficheirosPorApagar":["restaurants/","avatars/"],"conta":"apagada"}
PASS o Storage em baixo não impede a conta de ser apagada
PASS e os dados do Firestore saem à mesma
PASS fica registo de que ficaram ficheiros por apagar
PASS o registo diz quais foram os prefixos afetados
PASS a contagem denuncia a falha a quem lê o log
```

As três últimas **falharam primeiro** contra o código com o defeito, que é a
única forma de saber que afirmam alguma coisa. As duas primeiras passavam já
antes — de propósito: se falhassem, o teste seria um espantalho.

**✅ Publicado em produção a 24/08**, com autorização do dono:

```
firebase deploy --only functions:conta --project app-restaurantes-499400
  ✔ functions[conta(europe-west1)] Successful update operation.
```

Só a `conta`. A `ai` não foi tocada — e não precisava de o ser: a chave da
Anthropic é um segredo do Secret Manager declarado apenas na função que a usa
(`defineSecret` em `functions/index.js:19`), por isso não há `.env` nenhum a
faltar neste Mac.

Confirmado a seguir, sem chamar a cascata destrutiva contra a base real:

```
POST /api/conta sem token                  -> HTTP 401 {"error":"auth"}
OPTIONS /api/conta de capacitor://localhost -> HTTP 204
                                              access-control-allow-origin: capacitor://localhost
```

> **O que isto NÃO prova:** que o caminho novo funciona em produção. Ele só se
> mostra quando o Storage falha a sério, e com os papéis IAM dados isso já não
> acontece. A prova do comportamento é a do emulador (`test:apagar`, 26/26);
> aqui prova-se que a versão nova está no ar e responde.

> ⚠️ **Prazo que apareceu no deploy e ninguém tinha visto:**
>
> ```
> functions: Runtime Node.js 20 was deprecated on 2026-04-30 and will be
> decommissioned on 2026-10-30, after which you will not be able to deploy
> ```
>
> **A partir de 30/10/2026 não se publica mais nenhuma função** sem migrar o
> runtime. As duas funções (`ai` e `conta`) estão em `nodejs20`. Não afeta a
> submissão à App Store, e a app não deixa de funcionar nesse dia — o que deixa
> de haver é a possibilidade de corrigir seja o que for do lado do servidor.
> Migrar é mudar o `engines` no `functions/package.json` e voltar a publicar;
> o aviso pede também um `firebase-functions` mais recente, que traz mudanças
> que partem. **Vale a pena fazer antes de outubro e com calma, não em cima de
> um incidente.**

> **Consequência a ter em conta:** apagar a conta do Firebase **não** revoga a
> autorização do lado da Apple. O próximo login com a Apple cria uma conta nova
> mas continua a ser uma autorização **repetida** — a Apple não manda o nome, e o
> Perfil mostra "Amigo". Para o nome vir é preciso o *parar de usar* em
> appleid.apple.com. É também a única forma de exercitar a captura do nome, que
> continua por correr (ver o Bloco 3).

<details>
<summary>Como era antes de os papéis serem dados (fica para referência)</summary>

Não funcionava:

```
Perfil → Apagar a conta → escrever APAGAR → Apagar a minha conta
  → "falha ao apagar"
```

A mensagem **não é do cliente**. O `js/auth.js` só mostra o campo `error` que o
servidor devolve, e o `"falha ao apagar"` está em `functions/index.js:678` — o
`catch` do endpoint `conta`. Ou seja: a cascata `apagarConta()` lançou, e o
servidor respondeu **500**.

**O que já foi descartado, lendo o código:**

- não é o bucket do Storage: o `admin.initializeApp` já usa
  `…firebasestorage.app` explicitamente, que é o correto neste projeto;
- não é o `apagarFicheiros`: apanha os próprios erros e devolve `null`, não pode
  ser ele a lançar;
- não é o `deleteUser` já não existir: o `user-not-found` está tratado de
  propósito;
- não é CORS nem o `API_BASE`: o preflight de `/api/conta` responde com
  `access-control-allow-origin: capacitor://localhost`, e o `/api/ai` do
  "Pergunta-me" funciona pelo mesmo caminho.

**A causa, medida no log da função** (`firebase functions:log --only conta`):

```
apagar conta iPxT5Ywxd7QMGbAvQajbadxWYcg2  7 PERMISSION_DENIED: Missing or insufficient permissions.
```

O **7** é o código gRPC do **Firestore**, não do Firebase Auth. Não é o
`deleteUser` — a minha aposta estava errada. É a **conta de serviço de execução
sem acesso ao Firestore**:

```
serviceAccountEmail: app-restaurantes-499400@appspot.gserviceaccount.com
```

#### E não é só o apagar conta — o limite diário da IA também está desligado

A mesma falta de permissões atinge o `ai`, e **em silêncio**, porque o
`checkRateLimit` foi escrito para falhar aberto:

```js
// Fails OPEN: if Firestore is unreachable (e.g. the runtime SA lacks
// datastore access), we skip the cap rather than block the request.
```

O log confirma que é isso que acontece, em **todas** as chamadas:

```
ai: rate-limit skipped: 7 PERMISSION_DENIED: Missing or insufficient permissions.
```

Ou seja: o `AI_DAILY_CAP` de 120 pedidos por pessoa por dia **nunca foi aplicado
em produção**. Não é um defeito de submissão, é exposição de custo — cada pessoa
pode chamar a Anthropic sem limite nenhum. O comentário no código previu o
cenário; ninguém tinha ido ver que era o cenário real.

#### A correção: dar permissões à conta de serviço — ✅ **DADAS pelo dono (24/08)**

> **Os três papéis abaixo já foram dados.** Falta **confirmar** que resultou, e
> isso são dois comandos — ver "Como confirmar", no fim desta secção. Enquanto a
> confirmação não estiver feita, o apagar conta continua a contar como por
> verificar.

Provavelmente é herança de uma mudança da Google: desde 2024 a conta
`…@appspot.gserviceaccount.com` **deixou de receber o papel Editor por omissão**
em projetos novos. Este projeto é novo — o bucket é `.firebasestorage.app`, que é
a convenção nova. A `RUNTIME_SA` aponta para uma conta que existe e não pode
nada.

**Google Cloud → IAM e Administração → IAM**, e dar a
`app-restaurantes-499400@appspot.gserviceaccount.com` três papéis:

| Papel | Para quê | Sem ele |
| --- | --- | --- |
| `roles/datastore.user` | Firestore | é este que está a falhar agora |
| `roles/firebaseauth.admin` | `admin.auth().deleteUser()` | falha o passo final do apagar |
| `roles/storage.objectAdmin` | apagar as fotos do Storage | as fotos ficam órfãs, **em silêncio** |

Por linha de comandos, se preferires:

```bash
for P in roles/datastore.user roles/firebaseauth.admin roles/storage.objectAdmin; do
  gcloud projects add-iam-policy-binding app-restaurantes-499400 \
    --member=serviceAccount:app-restaurantes-499400@appspot.gserviceaccount.com \
    --role=$P
done
```

#### Como confirmar que os papéis pegaram

Os dois são rápidos, e o segundo não precisa do simulador:

```bash
# 1. o limite da IA volta a ser aplicado: usa o "Pergunta-me" uma vez e vê
firebase functions:log --only ai --project app-restaurantes-499400 | grep "rate-limit skipped"
#    -> deixa de haver linhas novas depois da hora em que os papéis foram dados

# 2. o apagar conta deixa de dar 500
firebase functions:log --only conta --project app-restaurantes-499400 | tail -5
#    -> não deve aparecer PERMISSION_DENIED numa tentativa nova
```

O teste de ponta a ponta continua a ser apagar **uma conta descartável** no
simulador — ver o aviso do ponto 3 da tabela. Uma conta acabada de criar, sem
amigos e sem grupos.

> **Atenção ao tempo de propagação:** uma alteração de IAM pode demorar alguns
> minutos a chegar às instâncias já a correr. Se falhar logo a seguir, esperar e
> repetir vale mais do que voltar a mexer nos papéis.

</details>

> ⚠️ **Uma segunda coisa a decidir, e é de produto.** O `apagarFicheiros` apanha
> os próprios erros e devolve `null` — se o Storage falhar, **a conta é apagada à
> mesma e as fotos ficam lá**, sem ninguém saber. O ecrã de confirmação promete
> que "as fotografias que enviaste" desaparecem. Enquanto o
> `roles/storage.objectAdmin` não estiver dado, essa promessa não se cumpre e
> nada o diz. Vale a pena decidir se isso deve passar a falhar alto.

**O caminho seguro para testar sem tocar em produção** é o emulador, e o ensaio
já existe: `npm run test:apagar` corre a cascata direta contra
`exports.__test.apagarConta`. Precisa de `npm run emu:start`, que precisa do
**Java** — não instalado nesta máquina (`brew install openjdk`).

> **Testa o apagar conta com uma conta acabada de criar, sem amigos e sem
> grupos.** É irreversível e, sem emulador, corre contra a base de dados real. A
> eliminação não se limita à conta: apaga também arestas de `follows` e mexe em
> grupos. Numa conta virgem o raio de ação é zero; na tua conta do dia a dia,
> não é.
>
> Se instalaste o Firebase CLI (opcional no Bloco 0), testa antes no emulador:
> `npm run emu:start` e `npm run emu:seed`.

### 4.3 Etiquetas de privacidade — ✅ levantadas do código

Levantamento feito ficheiro a ficheiro, não de memória. **Nada aqui é palpite:**
cada linha tem o sítio onde acontece.

#### O que se recolhe

| Dado | Onde, no código | Declarar como | Associado? | Tracking? |
| --- | --- | --- | --- | --- |
| Nome | `setUser` (`js/userdata.js`), do provider | Contactos · **Nome** | sim | não |
| Email | idem — com a Apple pode ser `@privaterelay` | Contactos · **Email** | sim | não |
| Fotografia de perfil | `photoURL` do provider, ou upload próprio | Conteúdo do utilizador · **Fotos** | sim | não |
| Fotos de sítios e pratos | `FirebaseStorage.upload` (`js/app.js:1301, 1770, 2130`) | Conteúdo do utilizador · **Fotos** | sim | não |
| Notas, críticas, estrelas, pratos, histórico de visitas | `persistNow()` → `userData/{uid}` | Conteúdo do utilizador · **Outro** | sim | não |
| Perfil de gosto escrito pela pessoa (`tasteNote`) | `persistNow()` | Conteúdo do utilizador · **Outro** | sim | não |
| Lista de amigos / grupos / quem segue | `userData/{uid}`, `follows` | **Contactos** ou Identificadores · a app não lê a agenda | sim | não |
| **Localização precisa** | `ondeEstou()` (`js/app.js`) — `@capacitor/geolocation` no nativo, `navigator.geolocation` na web | **Localização precisa** | sim | não |
| ID de utilizador | `uid` do Firebase | Identificadores · **ID de utilizador** | sim | não |

**Não há tracking nenhum a declarar.** Não existe SDK de analytics, de anúncios
nem de atribuição: procurados `gtag`, `analytics`, `mixpanel`, `sentry`,
`posthog` — zero ocorrências. O `GoogleService-Info.plist` vem com
`IS_ANALYTICS_ENABLED = false` e `IS_ADS_ENABLED = false`.

#### Partilha com terceiros — é aqui que se erra

A app fala com **quatro** destinos externos. Estão todos no código:

| Terceiro | O que lhe vai | Onde |
| --- | --- | --- |
| **Anthropic** (função `ai`) | perfil de gosto, notas pessoais, nomes de pratos, o nome da pessoa, e **distâncias** aos sítios | `js/ai.js` + `aiProfile()`/`aiCatalog()` |
| **Google** (Maps, Places, Geocoding) | a **localização precisa**, em bruto | `Geocode.reverse(lat,lng)`, `js/places.js:134` |

> **Nota de 24/08:** a mudança para o `@capacitor/geolocation` **não altera** nenhuma etiqueta. A localização continua a ser precisa, continua a ser recolhida, e continua a ser partilhada com a Google e (por triangulação de distâncias) com a Anthropic. O que mudou foi só quem a vai buscar dentro do telemóvel.
| **Google** (Firebase) | tudo o que é conta e conteúdo | Firestore + Storage |
| **OpenStreetMap** (Nominatim) | só o texto pesquisado, **não** a localização | `js/geocode.js:166` |

> ⚠️ **A localização precisa É partilhada com a Anthropic, ainda que
> indiretamente — e isto não é óbvio a olhar para o código de uma vez.** O
> `smartSuggest` manda `near` como um simples booleano e a `area` como rótulo de
> zona, o que dá a impressão de que as coordenadas não saem. Mas o
> `aiCatalog(near)` acrescenta um `distKm` a **cada** restaurante, e distâncias a
> vários pontos de coordenadas conhecidas localizam a pessoa por triangulação.
>
> Declara-se **Localização precisa · partilhada com terceiros**. Dizer o
> contrário seria uma declaração falsa, e é dos itens que a Apple verifica.

> **O `tasteNote` é texto livre que a pessoa escreve sobre si**, e vai inteiro
> para a Anthropic. É conteúdo do utilizador partilhado com um terceiro — o item
> mais fácil de esquecer.

#### Finalidades a marcar

Para **todos** os itens acima: *Funcionalidade da app* e *Personalização*. Nunca
*Publicidade* nem *Analytics* — não há nada disso na app.

### 4.0 ⛔ Diretriz 1.2 — conteúdo gerado por utilizadores sem moderação

**Encontrado a 25/08, e não estava em lado nenhum.** É o risco de rejeição mais
provável dos que aqui estão, e é o único que exige **código novo**.

A app tem conteúdo gerado por utilizadores e visível entre estranhos:

| O quê | Onde | Quem vê |
| --- | --- | --- |
| Críticas (texto livre) | `comments/{id}` | toda a gente — `read: if true` |
| Fotos de pratos e de sítios | `photos/{id}` + Storage | toda a gente — `read: if true` |
| Nome e foto de perfil | `userData/{uid}` | quem abrir o perfil |
| Nomes de pratos, notas de visita | `userData/{uid}` | quem segue |

A ficha de cada restaurante mostra as críticas e as fotos de **qualquer** pessoa,
sem ser preciso segui-la. Ou seja: é uma app social com UGC público, e a
diretriz **1.2 (Safety — User-Generated Content)** aplica-se por inteiro.

**O que a 1.2 exige, e o que existe:**

| Exigido pela Apple | Existe? |
| --- | --- |
| Filtrar material questionável | ❌ nada |
| **Denunciar** conteúdo ofensivo | ❌ nada — procurado, não há |
| **Bloquear** utilizadores abusivos | ❌ nada — procurado, não há |
| Responder às denúncias em tempo útil | — depende do dono |
| Contacto publicado | ⚠️ é o *Support URL* da loja, ainda por definir |
| Apagar o que é meu | ✅ o autor apaga a sua crítica e a sua foto |

> **Porque é que isto rejeita e a falta de moderação de outras apps não.** A
> App Review testa isto à mão em apps sociais: abre uma crítica de outra pessoa
> e procura o botão de denunciar. Não estando lá, é *Guideline 1.2* e volta para
> trás. Não adianta argumentar que são oito pessoas conhecidas — a app está numa
> loja aberta a toda a gente, e é assim que é avaliada.

#### ✅ Construído a 25/08 — e o que falta é medi-lo

| Peça | Onde |
| --- | --- |
| Denunciar um comentário | botão de bandeira em cada comentário de outra pessoa |
| Denunciar uma fotografia | *Denunciar* no visualizador, só em fotos de outra pessoa |
| Bloquear uma pessoa | na mesma folha do denunciar |
| Desbloquear | Perfil → *Pessoas bloqueadas*, que só aparece havendo alguma |
| Onde vão as denúncias | `reports/{id}` no Firestore, consultado na consola |
| Onde vivem os bloqueios | `blocked[]` no meu `userData`, filtrado no cliente |

**Decisões que valem a pena não reabrir:**

- **O filtro dos bloqueados é no `applyGroupFilter`**, e não em cada sítio que
  usa o grupo. O feed, os rankings, os contadores e os «visitado por N» passam
  todos por `group` — filtrar num sítio só é o que evita esquecer um deles. O
  `canSeeUser` fecha a segunda porta, a das fotos.
- **Bloquear também deixa de seguir.** Sem isso a pessoa continuava a ser
  descarregada a cada arranque só para ser filtrada a seguir.
- **As denúncias são só de escrita.** As regras deixam criar e mais nada:
  ninguém as lê, edita ou apaga pela app. Uma interface de gestão que ninguém
  abre é pior do que uma coleção que se consulta quando é preciso.
- **Bloquear não avisa ninguém e não apaga nada.** Não há mensagens diretas
  nesta app, portanto não há nada a impedir — só a esconder.

#### Medido pelo dono a 25/08 — e apanhou tres defeitos

| O quê | Resultado |
| --- | --- |
| Bloquear uma pessoa a partir de uma foto | ✅ funciona, some na hora |
| Desbloquear em Perfil → Pessoas bloqueadas | ✅ funciona, volta |
| **Denunciar** | ❌ *"Não consegui enviar. Tenta outra vez."* |

**O denunciar falhar era o esperado**, e é boa notícia por duas razões: as
regras do `reports` ainda não estavam publicadas, portanto a escrita foi
recusada — e a app **disse-o**, em vez de fingir que tinha enviado. Um
`catch` que engolisse o erro teria dado uma denúncia perdida em silêncio, que é
exatamente o que não se pode ter num mecanismo de segurança.

**Os três defeitos que só se viram no ecrã**, e nenhum deles aparecia em
nenhum arnês:

1. **Os botões da folha estavam azuis.** A classe `.btn` sozinha não define cor
   nenhuma — as variantes é que definem — e a WKWebView pintava-os com o azul
   de sistema. Passaram a `btn-ghost`, como os outros da app.
2. **A lista de bloqueados mostrava o identificador em bruto**
   (`OW3B2oJHkONxk40J3AE0Hben5pl1`) em vez do nome. Ir buscá-lo ao `profiles`
   não servia: bloquear deixa de seguir, e nem todas as contas lá têm
   documento. O nome passa a ser **guardado no momento em que se bloqueia** —
   está à mão, é o que está escrito por cima da foto ou do comentário.
3. **A dica «Bloquear esconde tudo o que esta pessoa publica» aparecia na lista
   de bloqueados**, a explicar a bloquear a quem já tinha bloqueado.

#### ✅ Publicado em produção a 25/08

```
firebase deploy --only hosting,firestore:rules --project app-restaurantes-499400
  ✔ cloud.firestore: rules file firebase/firestore.rules compiled successfully
  ✔ firestore: released rules to cloud.firestore
  ✔ hosting: release complete        (48 ficheiros)
```

Verificado a seguir, do lado de fora:

```
GET /privacidade            -> HTTP 200, <title>Privacidade · Foodboxd</title>
GET /sw.js                  -> const CACHE = "foodboxd-v87"    (estava v84)
GET /ios-build.json       -> HTTP 404                        (deixou de ser publicado)
```

> **O que isto ainda NÃO prova:** que uma denúncia é aceite. Uma escrita
> **sem** sessão era recusada antes e continua a ser recusada agora — o
> resultado é o mesmo com regra e sem regra, portanto não distingue nada. A
> única prova é uma escrita **autenticada**, ou seja tocar em *Denunciar*
> dentro da app com sessão. Fica por fazer, e é o passo seguinte.

#### O denunciar falhava por minha causa, não das regras

**Duas medições foram gastas a culpar o sítio errado.** Depois de publicar as
regras, o *Denunciar* continuou a dar *«Não consegui enviar»*. A causa não
estava no Firestore:

```js
const token = await window.FirebaseAuth.getIdToken();   // <- não existe
```

O `window.FirebaseAuth` exporta **`getToken`**. Todas as outras onze chamadas
do ficheiro usam `fb ? await fb.getToken() : null` — foi só aqui que inventei
outro nome. A chamada rebentava com um `TypeError` **antes de haver pedido**, e
o `catch` disfarçava-o de falha de envio.

> **A lição não é o erro de nome, é a mensagem.** *«Não consegui enviar. Tenta
> outra vez»* mandava a pessoa repetir um gesto que ia falhar sempre, e mandava
> quem diagnosticava olhar para as regras do Firestore — que estavam bem. A
> mensagem passou a levar a causa (`Não consegui enviar — ${e.message}`) e a
> escrever no `console.error`. **Num `catch` que engole tudo, a mensagem é o
> único instrumento que resta: se ela não disser o que aconteceu, o defeito
> seguinte custa duas medições outra vez.**

**E faltava metade do sítio.** As fotos do feed dos Amigos não levavam
`data-photo-uid` nem `data-photo-badge`, portanto o visualizador não sabia de
quem era a foto e escondia o *Denunciar* — só as fotos abertas a partir da
ficha do restaurante o mostravam. O feed é o sítio mais provável para alguém
ver conteúdo alheio, e era exatamente onde não havia botão.

#### ✅ Medido a 25/08, com sessão real

| O quê | Resultado |
| --- | --- |
| *Denunciar* aparece numa foto do feed de outra pessoa | ✅ |
| A folha diz de quem é (`De Leonor Marques.`) | ✅ |
| Botões com a cor da app, não o azul de sistema | ✅ |
| Enviar a denúncia | ✅ **segue o caminho do sucesso** |

> **Sobre a última linha, com precisão:** o que se observou foi a folha a
> **fechar-se sozinha ~1,4 s depois**, que é o que só acontece quando o
> `addReport` resolve. Na falha a folha **fica aberta** com a mensagem — foi
> assim que se viu falhar, duas vezes. A distinção é real e observável, mas o
> texto «Denúncia recebida» não chegou a ser fotografado: some antes de o
> screenshot voltar.
>
> **✅ Fechado pelo dono:** foi à consola do Firestore e **apagou as duas
> denúncias de teste**. Havia documentos para apagar — portanto as denúncias
> chegaram mesmo ao Firestore, e a prova que faltava está feita pelo único
> caminho que existia. As regras são `read: false` para clientes, de propósito,
> por isso nem a app nem o agente lá chegam.

> ⚠️ **O que continua por medir:** o *Denunciar* a resultar depois das regras
> irem para produção, denunciar **um comentário** (a foto já foi
> exercitada), e o percurso de ponta a
> ponta nunca correu. O botão só existe em conteúdo de **outra** pessoa, e a
> conta que está no simulador é nova — as fichas que abri não tinham
> comentários de ninguém. O que está verificado é: sintaxe das três camadas, o
> `audit` sem erros de JavaScript, o `test:update` 7/7, o build a passar e a
> app a arrancar sem exceções novas no log.
>
> **Como se mede, e são três minutos:** abrir um restaurante onde outra pessoa
> tenha comentado, confirmar a bandeira ao lado do comentário dela, tocar,
> *Denunciar* → aparece «Denúncia recebida» e nasce um documento em `reports`;
> voltar atrás, tocar outra vez, *Bloquear* → o comentário desaparece na hora e
> o Perfil passa a ter *Pessoas bloqueadas*. Depois *Desbloquear* e confirmar
> que volta.
>
> **E há um passo que não é da app:** publicar as regras novas do Firestore
> (`firebase deploy --only firestore:rules`). Sem elas a coleção `reports` não
> aceita escritas e o *Denunciar* falha com permissão negada.

**O caminho que se seguiu**, e é o mesmo que estava escrito aqui antes:

1. **Denunciar** — um item no menu de cada crítica e de cada foto que escreve
   em `reports/{id}` `{ tipo, alvoId, autorUid, denuncianteUid, quando }` e
   agradece. Não é preciso interface de gestão: o dono vê no Firestore.
2. **Bloquear** — uma lista `blocked[]` no `userData/{uid}`; quem lá está deixa
   de aparecer no feed, nas críticas e nas fotos. Filtra-se no cliente, que é
   onde o resto do social já é filtrado.
3. **Termos** com uma linha a dizer que não se tolera conteúdo ofensivo — a
   Apple pede o compromisso, e ele vive ao lado da política de privacidade.

É meio dia de trabalho, e é do agente. **Mas a decisão de o fazer agora ou de
arriscar a rejeição é do dono** — há quem submeta sem isto e passe à primeira,
e há quem volte para trás e perca uma semana de revisão.

### 4.3b ⛔ Política de privacidade — NÃO EXISTE, e é bloqueador

**Procurada a 24/08 e não existe em lado nenhum:** não há página no
`foodboxd.pt`, não há ficheiro no repositório, não há link no `index.html`. O
`SETUP_IOS.md` menciona-a de passagem no ponto 6 ("preenche nome, descrição,
screenshots, política de privacidade, etc.") e mais nada — ficou por fazer sem
ninguém reparar, porque nunca esteve nesta tabela.

**Porque é que isto para tudo:** o campo *Privacy Policy URL* na App Store
Connect é **obrigatório para todas as apps**. Não é um aviso, é um campo que não
deixa submeter vazio. Não há como contornar, e não há versão curta que sirva:

- tem de estar num **URL público e estável** — `foodboxd.pt/privacidade` serve;
- tem de **bater certo com as etiquetas da 4.3**. As etiquetas dizem que se
  recolhe localização precisa e que ela é partilhada com terceiros; se a
  política não o disser, são duas declarações em contradição sobre a mesma app,
  e é dos itens que a Apple confere;
- tem de cobrir o que a 4.3 já apurou e é o mais fácil de esquecer: o
  **`tasteNote`** (texto livre que a pessoa escreve sobre si) vai inteiro para a
  **Anthropic**, e a localização precisa chega lá por triangulação dos `distKm`.

**A boa notícia é que o trabalho difícil está feito.** A tabela da 4.3 é um
levantamento ficheiro a ficheiro, com o sítio de cada dado e os quatro destinos
externos — é exatamente o conteúdo de uma política, por escrever em prosa.

**✅ Escrita a 25/08** — [`privacidade.html`](privacidade.html), servida em
`/privacidade` por um rewrite no `firebase.json` (sem ligar `cleanUrls` global,
que mudaria o comportamento de todos os endereços).

Não é texto genérico: sai da tabela da 4.3, linha a linha. Diz o que a maioria
das políticas esconde — que a localização precisa **é** partilhada com a
Anthropic pelas distâncias, e que o `tasteNote` vai inteiro no pedido.

**Duas afirmações minhas estavam erradas e foram apanhadas antes de publicar**,
a ler o código em vez de confiar no que eu próprio tinha escrito:

- escrevi que as notas de visita eram privadas. **Não são:** o
  `buildFriendsFeed()` mete o `note` nos itens do feed, portanto quem te segue
  lê-as. A página diz agora isso, e diz que não é um caderno privado.
- escrevi que o perfil de gosto nunca sai. Sai — vai à Anthropic no
  «Pergunta-me», e viaja dentro do documento da conta para quem te segue
  (ver a nota abaixo).

> **A ficar para decidir, e é de minimização de dados:** o `fetchUsersByIds`
> traz o documento inteiro de cada pessoa que segues, e o `js/db.js:268`
> descodifica lá o `tasteNote`. Nada na interface o mostra, mas ele chega ao
> dispositivo de quem te segue. Ninguém o vê; simplesmente não devia lá ir.
> Tirá-lo da descodificação de terceiros é pequeno — mas é código, e fica para
> o dono decidir se entra antes ou depois da submissão.

**O link na app está feito e o mecanismo está medido.** Perfil → *Privacidade*
chama `window.open(..., "_blank")`, e no simulador isso abre a página **fora**
da WKWebView, numa vista do Safari com barra de endereço e com «◀ Foodboxd»
para voltar. Era o risco: dentro da webview não há barra nem botão de recuar, e
a pessoa ficaria presa numa página estática sem saída a não ser matar a app.

> Na medição a página deu **Page Not Found** do Firebase Hosting, e isso é o
> resultado certo: a página existe no repositório e ainda não foi publicada. O
> que se estava a medir era para onde o toque leva, não o que lá está.

**O que falta, e de quem é:**

| Passo | De quem | Estado |
| --- | --- | --- |
| Escrever o texto a partir da tabela da 4.3 | agente | ✅ feito |
| Link na app, a abrir fora da webview | agente | ✅ feito e medido |
| **Dar o nome do responsável e o email de contacto** — a página tem `[[NOME DO RESPONSÁVEL]]` e `[[EMAIL DE CONTACTO]]` por preencher, e não os invento: são dados pessoais que vão para uma página pública | **dono** | por fazer |
| **Ler e assumir o que lá está** — é um compromisso legal, não um ficheiro | **dono, e só o dono** | por fazer |
| Publicar em `foodboxd.pt/privacidade` | agente dispara, dono autoriza | por fazer |
| Colar o URL na App Store Connect | dono | por fazer |

> Vale a pena um link no ecrã Perfil, ao lado do "Apagar a conta". Não é exigido
> pela App Store, mas é onde as pessoas o procuram, e o RGPD aplica-se — há oito
> pessoas em Portugal com dados lá dentro.

### 4.4 Nota para o revisor — humano decide, texto já escrito

> 🔴 **ATENÇÃO: esta secção inteira ficou obsoleta a 25/08.**
>
> Foi escrita quando a app se via toda sem conta, e a conclusão era «não é
> precisa conta de teste, e o `Sign-in required` é NO». **A app passou a exigir
> conta** — ecrã de entrada, decisão do dono — e portanto:
>
> - o `Sign-in required` passa a **YES**;
> - a conta de teste **é precisa**, e existe (criada pelo dono a 25/08, com
>   email e palavra-passe, que é precisamente o caminho que se acrescentou para
>   a poder entregar);
> - a nota em inglês mais abaixo **está falsa em três parágrafos** e tem de ser
>   refeita antes de ser colada.
>
> Fica por baixo, e não apagada, porque o raciocínio continua a valer para a
> parte que não mudou: o problema de a app só ter login social, e porque é que
> entregar credenciais Google à App Review costuma dar rejeição. Foi esse
> raciocínio que levou ao email/palavra-passe.

#### Primeiro, o problema que esta secção não via

**A app só tem Google e Apple.** Não há email/palavra-passe em lado nenhum
(`index.html`: `signin-apple-btn` e `signin-modal-btn`, mais nada). Ou seja: a
"conta de teste com dados dentro" que estava aqui escrita **não existe como
coisa que se possa entregar**. As saídas seriam todas más:

- dar as credenciais de uma conta Google real à App Review — a Google costuma
  travar uma entrada de um dispositivo novo com um desafio de segurança, e isso
  aparece como *"we were unable to sign in"*, que é rejeição;
- ou acrescentar email/palavra-passe só para o revisor, que é código novo num
  caminho de autenticação, à conta de uma submissão.

#### E a saída boa, que estava aqui à frente: **não é preciso conta nenhuma**

Medido no `foodboxd.pt`, com sessão nenhuma, a 24/08:

| Sem entrar | Estado |
| --- | --- |
| Os 68 restaurantes, com zona, região, categorias e especialidade | ✅ visíveis |
| Mapa, Lista, Filtros, pesquisa | ✅ funcionam |
| Ficha do restaurante | ✅ abre — avaliação `4.6 (759)`, preço `€€€`, telefone |
| Convite de sessão | fecha-se com "Agora não" e não volta a estorvar |

Portanto, no formulário *App Review Information*, o **"Sign-in required" é
`NO`**. A app não esconde o conteúdo atrás de uma conta; a conta serve para
guardar o que é teu. Isto elimina a exigência de conta de teste.

**E se o revisor quiser ver a parte social**, entra com a Apple usando o Apple ID
dele — não há credenciais para entregar.

> ⚠️ **Aqui estava escrita uma afirmação errada, e fica o rasto de propósito.**
> Dizia que a conta nova do revisor **não** ficaria vazia, porque sem grupo
> ativo o `applyGroupFilter()` põe `group = allUsers`. Está medido no simulador
> a 25/08 com uma conta acabada de criar, e é o contrário:
>
> ```
> Amigos → Atividade     "Sozinho sabe pior"
> Amigos → Leaderboard   "Ainda não há atividade suficiente"
> Perfil                 0 restaurantes · 0 pratos · 0 amigos
> ```
>
> **O erro foi parar um nível cedo demais.** Li o `applyGroupFilter` e dei o
> `allUsers` por adquirido. Mas o `allUsers` **não são todos os utilizadores** —
> é `fetchUsersByIds(followIds)`, quem eu sigo mais eu (`js/userdata.js:185`).
> Uma conta nova não segue ninguém, logo o conjunto é vazio e **"Todos
> (global)" quer dizer "sem filtro de grupo por cima de quem sigo"**, não "toda
> a gente da app". O `CONTEXT.md` §5 ainda descrevia o modelo antigo e ajudou a
> confirmar a suposição errada — está corrigido no mesmo commit.
>
> Ter marcado a afirmação como *lida no código, não medida* foi o que a apanhou
> um dia depois em vez de a mandar para dentro da nota ao revisor. **Vale a pena
> continuar a marcá-las.**

**O que isto muda na prática, e não é mau:** o argumento para o revisor deixa de
ser "cria uma conta e vais ver gente" e passa a ser mais simples e mais forte —
**não crie conta nenhuma.** A app tem o conteúdo todo à vista sem entrar, e é aí
que ela se avalia. Os separadores sociais vazios numa conta acabada de criar são
o comportamento correto de um diário social: enche-se seguindo pessoas.

#### A nota, escrita (copiar para *App Review Information → Notes*)

```
Foodboxd is a restaurant diary for Portugal: a map of places, and a private
log of what you ate and what you thought of it.

NO ACCOUNT IS NEEDED TO REVIEW THE APP. All 68 restaurants, the map, the
list, the filters and every restaurant page (rating, price range, phone,
signature dishes) are fully available without signing in. Just dismiss the
sign-in invitation with "Agora não" (= "Not now").

Signing in only adds the personal features: marking a place as visited,
rating it, logging dishes, uploading photos, and the friends activity feed.
If you would like to try those, please use "Iniciar sessão com a Apple"
(Sign in with Apple) with your own Apple ID — we cannot supply a demo
account because the app offers only Google and Apple sign-in, and no
email/password path exists.

A brand-new account starts with an empty Amigos tab. That is intended: the
social feed is built from the people you choose to follow, so it fills up
once you follow someone (Amigos -> "Descobrir pessoas"). The restaurant
content above is not affected and needs no account at all.

Where to find things:
  Mapa    — the map and the restaurant list (tap any pin or card)
  Diário  — your own visits, reviews and dishes
  Amigos  — activity feed and leaderboards
  Perfil  — your account, and "Apagar a conta" (account deletion, 5.1.1(v))

Location is requested only inside "Pergunta-me" (the sparkle button in the
header), never at launch, and the app works without granting it.

The app is in Portuguese.
```

> **Antes de colar, confirma duas coisas** que só o dono pode confirmar: que o
> texto está de acordo com o que a app faz na build submetida, e que o "Agora
> não" ainda é o rótulo do botão de dispensar o convite.

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

## O que esta sessão apurou

Seis coisas que só se souberam a correr a app, e que não estão em mais lado
nenhum. As três primeiras poupam-te trabalho que já está feito.

**1. O `/api/` já está resolvido no nativo — não lhe toques.**
Verificado na camada de rede: preflight CORS das duas funções a partir de
`capacitor://localhost`, ambas devolvem
`access-control-allow-origin: capacitor://localhost`. **A prova de ponta a ponta
fica atrás do login** — o "Pergunta-me" exige sessão, e tocar-lhe sem sessão só
abre o convite. Não é por verificar: é verificado até onde dá sem conta.

O `js/ai.js` e o `js/auth.js` devolviam `/api/ai` e `/api/conta` relativos, que
em `capacitor://localhost` resolvem para o handler local de ficheiros e dão 404.
O "Pergunta-me" e o apagar conta não podiam funcionar na app. Passou a absoluto
via `CONFIG.API_BASE` (`js/config.js`), só quando `isNativePlatform()`. As
funções já respondem com `cors: true`, por isso **não é preciso republicá-las**.
Confirma no simulador que o "Pergunta-me" responde; se não responder, é outra
coisa.

**2. O deploy não precisa do dono.** O agente da nuvem dispara o *Deploy
(produção)* pela API do GitHub. O workflow tem guarda anti-retrocesso (compara a
versão do service worker com a que está no ar) e uma caixa `funcoes` que só se
liga quando `functions/` mudou. **Publicar sem pedir é que não se faz.**

**3. Os arneses deixaram de depender da rede.** Os quatro correm em qualquer
máquina. O `audit`, o `preview` e o `test-update` servem o `js/config.js` com a
chave do Maps vazia; o `test-map` **não** leva essa mudança de propósito, porque
interceta o pedido e responde com um script que chama o `initApp`. Está tudo
comentado no código. Ver também as cinco dependências de ambiente no `CLAUDE.md`.

**4. O nome vindo da Apple chega num sítio não documentado.**
`cred._tokenResponse.firstName` / `.lastName` — **não** em
`getAdditionalUserInfo().profile`, que para a Apple traz as claims do token
(email, sub) e nunca o nome. Procurei-o no sítio errado e a conta do dono ficou a
mostrar `b7r5f2k72k@privaterelay.appleid.com` no Perfil. Corrigido no bridge
(`guardarNomeDaApple`), e o fallback deixou de aceitar endereços de
reencaminhamento como nome.

> **A conta que já existe não se repara sozinha.** A Apple só devolve o nome na
> **primeira** autorização. Para a recuperar: `appleid.apple.com` → *Início de
> sessão e segurança* → *Iniciar sessão com a Apple* → Foodboxd → **parar de
> usar**, e entrar de novo. Vale a mesma armadilha ao testar o plugin nativo.

**5. O convite de sessão trancava a app numa versão antiga.**
O `ocupado()` (no `index.html`) suspende o recarregamento enquanto houver algo
aberto. O convite de sessão **abre-se sozinho** a quem não tem sessão, e ninguém
o fecha — a app ficava ocupada para sempre e nunca aplicava uma atualização.
Passou a ser a única exceção do `ocupado()`. Tudo o que a pessoa **abre**
continua a suspender.

**6. `xcrun simctl install` por cima da app APAGA a sessão.** Custou dois logins
ao dono em 24/08 antes de ficar escrito. Não é o contentor de dados que se
perde — é o *data store* da WKWebView, onde a persistência do Firebase Auth vive.
A app volta ao onboarding como se fosse uma instalação limpa.

Consequência prática, e vale planear em volta dela: **o agente não pode repor a
sessão sozinho.** A app só tem Google e Apple, e as palavras-passe não são do
agente para escrever. Portanto, antes de reinstalar para medir alguma coisa que
exija sessão, conta com um login do dono a seguir — ou mede primeiro tudo o que
não precisa de conta.

---

## O que falta, por ordem

**Esta tabela é o estado.** Ao fechares um passo, atualiza-a no mesmo commit —
quem chegar a seguir lê o repositório, não o chat.

| # | O quê | De quem | Estado |
| --- | --- | --- | --- |
| — | Os `UsageDescription` a partir de fonte versionada | agente | ✅ `7daabcd` |
| — | O plugin nativo a ligar, e entrar com **Google** | agente | ✅ `f202bbc` |
| — | Guardas nos `replace` do `pbxproj`, destino genérico no build | agente | ✅ |
| — | Apple ID nas Definições do simulador | dono | ✅ feito |
| — | A ponte da Apple: `rawNonce` e `signInWithCredential` | agente | ✅ medidos |
| — | **A captura do nome da Apple** numa primeira autorização | dono destrancou, agente mediu | ✅ **fechado 25/08** — `nome="Pedro Mouzinho"` |
| — | Equipa de assinatura no projeto (4.1) | agente | ✅ `LGN8A4342T`, versionada em `ios-build.json` |
| 2 | Capacidade *Sign in with Apple* — só se o build para dispositivo a pedir | dono, se preciso | por confirmar |
| — | "Pergunta-me" + permissão de localização (4.2) | agente | ✅ medido |
| — | Carregar foto para um sítio (4.2) | agente | ✅ sobe e aparece |
| — | Dar 3 papéis IAM à conta de serviço | dono | ✅ dados 24/08 |
| — | Confirmar que os papéis pegaram | agente | ✅ confirmado 24/08 |
| — | O apagar falhar alto quando o Storage falha (1b) | dono decidiu, agente fez | ✅ decidido e medido 24/08 |
| — | Publicar a função `conta` (1b) | dono autorizou, agente disparou | ✅ publicada 24/08 |
| — | O 2.º pedido de localização diz "localhost" (3b) | dono decidiu, agente fez | ✅ resolvido e medido 24/08 |
| — | Etiquetas de privacidade (4.3) | agente | ✅ levantadas do código |
| — | **Diretriz 1.2 — denunciar e bloquear** (4.0) | agente construiu, dono e agente mediram | ✅ **fechado** — denunciar, bloquear e desbloquear, e em produção |
| **0** | 🔴 **As páginas no ar contradizem a app** — a `/privacidade` e a `/ajuda` dizem que funciona sem conta | agente reescreve, dono autoriza publicar | **por fazer** |
| **0** | ⛔ **Política de privacidade** (4.3b) — escrita, com dois campos por preencher e por publicar | agente escreveu; **dono dá nome+email, lê e autoriza publicar** | **por decidir** |
| 4 | **Submeter** as etiquetas na App Store Connect (4.3) | dono | por fazer |
| 5 | 🔴 Nota ao revisor (4.4) — **a que está escrita ficou FALSA** com o bloqueio; refazer antes de colar | agente refaz, dono cola | por fazer |
| — | Conta de teste (4.4) | dono | ✅ criada 25/08 — **e agora É precisa**, ver 4.4 |
| — | ⚠️ **Contas Apple e Google separadas — já em produção** | dono decide o quê, agente executa | ver abaixo |
| — | A procura numa porta (item 7) | dono decidiu, agente fez | ✅ `+` na barra, escolha no fim |
| — | O ecrã de entrada (item 7) | dono decidiu, agente fez | ✅ com email/palavra-passe |
| 7 | O perfil público (item 7) — visibilidade escolhida por pessoa | dono decidiu, agente a fazer | em curso |
| 6 | **Submeter** — passo a passo em [`loja/submissao.html`](loja/submissao.html), com cada campo pronto a copiar; valores em [`loja/README.md`](loja/README.md) | agente preparou; **dono executa** | por fazer |

### ⚠️ Duas contas para a mesma pessoa — e já está no ar

**Isto não é uma funcionalidade a mais, é um incidente de suporte à espera de
acontecer.** O Sign in with Apple está em produção no `foodboxd.pt` desde o v83,
com oito pessoas lá dentro. Quem entrou com a Google e um dia toque no botão da
Apple vê **0 restaurantes, 0 pratos, 0 amigos** — e a conclusão natural é que
perdeu tudo.

E não há rede de segurança nenhuma, o que está medido:

```
conta Google   pedromouzinho812@gmail.com    uid OW3B2oJHk…
conta Apple    …@privaterelay.appleid.com    uid iPxT5Ywxd…   providers: apple.com
```

Com *Ocultar o meu email* ligado — que é o que está — a Apple devolve um
`@privaterelay.appleid.com`. É um **email diferente** do da Google, portanto a
proteção *one account per email address* do Firebase **nunca as pode juntar**:
para ele são duas pessoas. Não há colisão para detetar.

Não é defeito de código e não bloqueia a submissão. Mas está publicado, e a
decisão do que fazer é do dono:

### ✅ Decidido: não fazer nada, de propósito

O dono decidiu **não ligar as contas nem avisar**. Fica escrito como decisão, não
como esquecimento, com a razão e com o que a reabriria.

**A razão:** são oito pessoas, todas entram pela Google, e o Sign in with Apple
só existe porque a diretriz 4.8 obriga a tê-lo onde há login social de terceiros.
O caminho que produz o problema — entrar pela Google e um dia tocar no botão da
Apple — não é o caminho de ninguém hoje.

**O que reabre isto**, e vale a pena vigiar:

- alguém aparecer com duas contas a sério, e perguntar pelo diário que "perdeu";
- ou a base de utilizadores deixar de ser oito pessoas conhecidas.

Nesse dia as opções continuam a ser as mesmas: `linkWithCredential` para juntar
os diários (com o cuidado de já poderem existir dados dos dois lados), ou um
aviso antes de entrar a dizer que a conta é por método de entrada.

---

**No 1:** é a única passagem que existe. A Apple só manda o nome na **primeira**
autorização, e o `parar de usar` é o que faz a próxima contar como primeira. Se o
código estiver errado, o nome queima-se e não volta — por isso mede-se com a
instrumentação ligada, não à sorte.

**✅ A instrumentação está ligada (24/08).** Antes não estava, e sem ela a
passagem gastava-se sem se saber porquê: uma conta sem nome é **indistinguível**
de uma autorização repetida, que também não traz nome e é o caso normal. O
`registarRespostaDaApple` (no `index.html`, nos dois caminhos) usa o `isNewUser`
para separar os dois casos.

Lê-se com um comando:

```bash
npm run ios:apple-diag
```

> ⚠️ **A primeira versão desta instrumentação era inútil, e este documento
> mandava lê-la com um comando que não funciona.** Escrevia para o
> `console.log`, e o handoff dizia:
>
> ```bash
> xcrun simctl spawn booted log stream --predicate 'process == "App"' | grep -i "apple:"
> ```
>
> **O `console.log` de dentro da WKWebView não chega ao log do sistema.**
> Procurado em 17 mil linhas do log do processo `App`, à volta de uma entrada
> com a Apple mesmo a sério: não há lá nada. É a mesma família do `codesign` —
> uma ferramenta que não sabe responder à pergunta que se lhe faz — mas com uma
> agravante: **dava a sensação de estar coberto.** Eu escrevi o comando, dei a
> instrumentação por ligada, e ela não registava nada em lado nenhum.
>
> Agora o registo fica no **`localStorage`**, que sobrevive à sessão e se lê do
> disco sem depender de ninguém ter uma consola aberta no momento certo. Guarda
> as últimas cinco entradas, para uma tentativa não apagar a prova da anterior.

#### ✅ FECHADO a 25/08 — a Apple mandou o nome e a app guardou-o

O dono fez o *parar de usar* em `appleid.apple.com` e entrou outra vez. O
registo, lido com `npm run ios:apple-diag`:

```
2026-08-25T01:10:42.048Z  [nativo]
   nome="Pedro Mouzinho"  displayNameDoPlugin="Pedro Mouzinho"  temUser=true
   chavesDoUser=["displayName"]
   chavesDoPerfil=[]
```

**A ponte funciona de ponta a ponta.** O nome veio do plugin em
`r.user.displayName` — o único sítio de onde se podia salvar no caminho nativo
— e o `nomeGuardado` levou-o ao `profiles`: "Pedro Mouzinho" aparece agora com
nome na lista de *Descobrir pessoas*, onde antes aparecia "Amigo".

**O `chavesDoUser=["displayName"]` confirma o que se tinha lido no Swift do
plugin:** com `skipNativeAuth` não há sign-in nativo, portanto o `user` do
resultado não é um utilizador — é um objeto com **um campo só**, feito à mão
para transportar o nome. Se o nome não vier, o objeto inteiro é `null`.

> ⚠️ **E o registo classificou-o mal, o que é um defeito do instrumento.**
> Dizia *"repetida, mas veio nome (inesperado)"* numa autorização que foi
> mesmo a primeira. A causa: eu lia o `isNewUser` do resultado do **plugin**,
> e com `skipNativeAuth: true` o plugin não fala com o Firebase — não tem
> `additionalUserInfo` nenhum para devolver. Quem sabe se a autorização é
> primeira é o `signInWithCredential`. Corrigido: passa a ler
> `getAdditionalUserInfo(res)`.
>
> Repara no que se salvou por sorte: **o dado estava certo e a etiqueta
> errada.** Se a etiqueta fosse o que se lia — e era, era essa a razão de o
> instrumento existir — a conclusão teria sido "a Apple mandou o nome numa
> autorização repetida", que é falso e mandaria o próximo a reescrever código
> que está bom.

<details>
<summary>O que se sabia da tentativa de 24/08, antes disto (fica para referência)</summary>

**O que se sabe da tentativa de 24/08, e o que não se sabe:**

| | |
| --- | --- |
| Sessão gravada | Apple (`apple.com`), uid `Ick0DnjF…`, email `@privaterelay.appleid.com` |
| Nome | **não veio** — o Perfil mostra "Amigo" |
| Foi primeira autorização ou repetida? | **não se sabe** — a instrumentação da altura não deixou rasto |

Ou seja: **a tentativa não conta como medição.** Não se pode dizer que a captura
falhou nem que funcionou; só que não houve nome, o que é o esperado numa
autorização repetida e um defeito numa primeira.

</details>

**A passagem renova-se, e isso confirmou-se.** O *parar de usar* pode fazer-se
outra vez, e outra: cada re-autorização depois de uma revogação conta como
primeira e a Apple volta a mandar o nome. O que não se pode é gastá-la sem
instrumento — e agora há um.

> ⚠️ **E há uma armadilha nova, lida no Swift do plugin, que estreita isto mais
> do que o documento dizia.** No `AppleAuthProviderHandler.swift` o nome só é
> composto **se vierem os dois**:
>
> ```swift
> if let givenName = fullName.givenName, let familyName = fullName.familyName {
>     displayName = "\(givenName) \(familyName)"
> }
> ```
>
> Se a pessoa apagar o apelido na folha da Apple — que é editável — o plugin
> deita o nome inteiro fora, e com `skipNativeAuth` o `r.user` vem **`null`**.
> Daí não há recuperação nossa: a credencial que mandamos ao Firebase é
> construída em JS e não leva `fullName`, ao contrário da que o plugin constrói
> do lado nativo. **Quem gastar a passagem: deixa os dois campos como a Apple os
> preenche.**

**De caminho, e de graça:** ao entrar com a conta nova, **olha para o separador
Amigos antes de fazer seja o que for.** É a única oportunidade de confirmar o que
a 4.4 afirma a partir do código — que uma conta acabada de criar não aparece
vazia.

#### O upload de 25/08 passou, com um aviso — e o aviso tem data

```
App Store Connect Warning
MinimumOSVersion too low. This app has a MinimumOSVersion of 13.0. Starting in
Spring 2027, all iOS apps must have a MinimumOSVersion of 15.0 or later in
order to be uploaded to App Store Connect or submitted for distribution.
```

**Não bloqueou nada** — a build subiu e é submissível. O 13.0 é o que o
Capacitor 6 gera.

**Resolvido na fonte, e não à mão**, porque à mão desaparecia no clone seguinte:
o `deploymentTarget` passou a viver em [`ios-build.json`](ios-build.json) (o
antigo `ios-signing.json`, renomeado agora que guarda mais do que assinatura), e
o `scripts/ios-info.mjs` escreve-o **nos dois sítios que têm de concordar**: o
`project.pbxproj`, que manda na app, e o `Podfile`, que manda nas dependências.
Um Podfile mais baixo faz o CocoaPods avisar em cada pod.

```
ios-info: mínimo de iOS 15.0 no projeto (4 configurações)
ios-info: mínimo de iOS 15.0 no Podfile (era 13.0) — é preciso pod install
```

Confirmado com `pod install` e `npm run ios:build` a passar. **Não custa alcance
nenhum:** o iPhone 6s e tudo o que veio depois chega ao iOS 15.

> **Não vale a pena voltar a arquivar por causa disto.** A build que está lá em
> cima serve para esta submissão; a mudança entra sozinha na próxima, porque
> corre a cada `npm run sync`.

**Nos metadados da loja:** esta tabela sempre tratou do que faz a app funcionar,
e nunca do que a App Store Connect pede ao lado. São coisas diferentes e ambas
bloqueiam a submissão. O que falta levantar, e não está levantado:

- **screenshots** nos tamanhos exigidos — isto é trabalho de agente, sai do
  simulador com a app a correr;
- **descrição, subtítulo, palavras-chave, URL de suporte** — o agente rascunha,
  o dono decide;
- **classificação etária** (questionário) e **conformidade de exportação** (a app
  só usa HTTPS; normalmente cai na isenção) — respostas do dono;
- **conta de programador Apple ativa** — o item 2 (equipa no Xcode) pressupõe uma
  subscrição paga do Apple Developer Program. Se ainda não existir, é o primeiro
  passo de todos e demora a ser aprovada.

**No 2:** com o `applesignin` já no `ios-entitlements.plist`, a assinatura
automática costuma registar a capacidade sozinha ao escolher a equipa — e o 4.1
fica feito de graça. Se em vez disso o build falhar com *"provisioning profile
doesn't include the com.apple.developer.applesignin entitlement"*, é isso e não
o código: a capacidade tem de ser ligada no portal.

**No 3:** o apagar conta é o único passo destrutivo do plano todo, e corre
contra a base de dados real, onde estão oito pessoas. Não se limita à conta —
apaga arestas de `follows` e mexe em grupos. **Conta acabada de criar, sem
amigos e sem grupos**, ou o emulador (`npm run emu:start`, `npm run emu:seed`).

---

## O que este documento não sabe

- ~~Se o Bloco 3 resolve mesmo o login na WKWebView.~~ **Resolvido.** O plugin
  serve, e o `signInWithRedirect` está fechado (precisa do resolver que teve de
  sair para o Auth inicializar). Falta só medir a metade da Apple.
- **Se a ponte da Apple funciona.** É código diferente do da Google e **nunca
  correu**. O `rawNonce` é onde isto costuma partir: se o plugin devolver o nonce
  já em SHA256, o Firebase recusa com `auth/invalid-credential`. E o
  `r.user.displayName`, o único sítio de onde o nome se salva no caminho nativo,
  também nunca correu — e a Apple não o volta a dar.
- **Se a Apple aceita o domínio do Firebase sem verificação** (ver Anexo A).
- **Quanto tempo demora a App Review** nem o que ela vai levantar.

Se alguma destas se resolver, vale a pena voltar aqui e escrever a resposta.
Este documento existe porque a informação anterior vivia numa conversa e
perdeu-se.
