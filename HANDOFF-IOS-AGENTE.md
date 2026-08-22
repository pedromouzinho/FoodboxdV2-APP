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
| Produção | https://foodboxd.pt — service worker `foodboxd-v83` |
| Ramo de trabalho | `claude/beautiful-davinci-vsyokk` |
| Projeto Firebase | `app-restaurantes-499400` (número `909243049168`) |
| Bundle ID | `pt.foodboxd.app` (em `capacitor.config.json`) |
| Publicar | GitHub Actions → **Deploy (produção)**, ou pela API do GitHub |

**Blocos 0, 1 e 2: feitos.** Falta o 3 e o 4.

**Em produção:** apagar conta (5.1.1v), **Sign in with Apple**, a marca nova em
toda a app, favicon, haptics, barra de estado, splash, a chave da Anthropic no
Secret Manager, a rede de segurança do arranque (a app já não precisa do Google
Maps para arrancar), e o `/api/` absoluto no nativo.

**Por fazer:** o Bloco 3 (metade feita — falta o `GoogleService-Info.plist`, que
é do dono; ver lá) e o Bloco 4. Os `UsageDescription` estão feitos (`7daabcd`):
vivem em `ios-info.json` e o `scripts/ios-info.mjs` escreve-os a cada sync.

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

**Assim que o `.plist` estiver na raiz:** `npm run sync`, reinstalar o plugin, e
ligar o `signInWithCredential` ao Auth que agora inicializa.

**Mantém a interface do bridge.** `window.FirebaseAuth` expõe `signIn`,
`signInApple`, `signOut`, `onChange`, `getToken`, `current`, e o `js/auth.js` e o
`js/app.js` só falam com ela. A troca fica contida no `index.html`.

**Critério de feito:** entrar com Google **e** com Apple no simulador. A metade
da Apple depende também do App ID com a capacidade ligada — mesmo turno de
consolas.

E atenção ao nome vindo da Apple no caminho nativo: ver o ponto 4 da secção
final. O plugin devolve-o noutro sítio.

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

## O que esta sessão apurou

Cinco coisas que só se souberam a correr a app, e que não estão em mais lado
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

---

## O que falta, por ordem

1. **O plugin nativo** (Bloco 3). Aprovado pelo dono. É o que desbloqueia tudo o
   resto: sem login não há sessão, e sem sessão não se testa nada que dependa de
   conta.
2. ~~Os `UsageDescription` a partir de fonte versionada.~~ **Feito** em
   `7daabcd`: `scripts/ios-info.mjs` escreve-os no `Info.plist` a partir de fonte
   versionada, e o `ios/` pode continuar no `.gitignore` sem se perder material
   de App Review.
3. **Registar visita com foto, e apagar conta** — com uma conta acabada de
   criar, sem amigos e sem grupos (ver Bloco 4.2). Depende do ponto 1.
4. **Bloco 4** — assinatura, build, etiquetas de privacidade, submissão.

**Fora do iOS, por decidir com o dono:** a procura numa porta só, o ecrã de
entrada, e o perfil público. Estão analisados; falta a decisão.

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
