# CONTEXT.md — Foodboxd handoff (estado completo do projeto)

> Documento de continuidade. Captura tudo o que é preciso para retomar o projeto
> sem perder contexto. Última atualização: **2026‑08‑24**.

## Se chegaste agora, lê isto primeiro

**Três minutos, por esta ordem:**

1. **[`CLAUDE.md`](CLAUDE.md)** — as regras. Somos **dois agentes no mesmo ramo**
   (um em contentor na nuvem, outro no Mac do dono). Só um trabalha de cada vez,
   puxa-se antes de começar e publica-se logo a seguir a cada commit. Tem também
   uma lista de **arneses que já mentiram** — vale a pena, poupa horas.
2. **Esta secção e a 9** — onde o projeto está hoje.
3. **[`HANDOFF-IOS-AGENTE.md`](HANDOFF-IOS-AGENTE.md)** — se o teu trabalho é
   iOS. É a ordem de trabalhos, com a tabela "O que falta, por ordem" no fim, que
   **é o estado** e é lá que se atualiza.

**O que está no ar agora:** `foodboxd.pt`, service worker `foodboxd-v85`, oito
pessoas com dados lá dentro. Nada vai a produção sem pedir.

**O que a app é, em duas linhas:** vanilla JS sem framework nem build — um
`index.html`, um `css/style.css`, módulos IIFE em `js/`. Isso é **decisão do
dono**, não descuido. Não introduzas frameworks, bundlers nem bibliotecas de
componentes.

**A regra que governa tudo o resto:** o que vive só numa janela de contexto morre
com ela. Ao fechares um passo, escreve-o no repositório **no mesmo commit** — na
tabela do handoff se for iOS, aqui se for do projeto, no `CLAUDE.md` se for uma
lição sobre ferramentas que enganam.

**E não chames provado ao que não mediste.** Nesta saga houve quatro diagnósticos
confiantes e errados — um por sessão, em média — e todos foram desfeitos por uma
medição de dois minutos.

## 1. O que é

**Foodboxd** — "Letterboxd para restaurantes": mapa interativo + diário social
onde avalias sítios, registas os pratos, guardas memórias/experiências, e vês a
atividade e leaderboards dos amigos.

- **Produção:** https://foodboxd.pt (domínio custom no Firebase Hosting) e
  https://app-restaurantes-499400.web.app (mesmo deploy).
- **Repo:** `pedromouzinho/dbdeai`. Working dir: `/home/user/dbdeai`.
- **Branch de trabalho:** `claude/beautiful-davinci-vsyokk`. **PR aberto: #7**
  (base `claude/portugal-restaurant-map-kuz2w2`, que é o default do repo).
- **Stack:** vanilla JS (sem framework, sem build), PWA. Firebase
  (Hosting + Firestore + Storage + Auth) via REST/SDK. Google Maps/Places.
- **Plano Google Cloud:** **Blaze** (pay‑as‑you‑go; ~0 €/mês a esta escala).

## 2. Arquitetura / ficheiros

Sem bundler. `index.html` carrega os scripts por ordem. Cada módulo é um IIFE
(`const X = (() => { ... })()`).

- `index.html` — markup, sprite SVG de ícones (`#i-*`), modais, bootstrap do
  Firebase Auth/Storage (módulos ES inline no fim), tabbar, screens.
- `css/style.css` — design system (tokens `--*`), tudo num ficheiro.
- `js/config.js` — `window.CONFIG`: `GOOGLE_MAPS_API_KEY`, `FIREBASE_PROJECT_ID`
  (`app-restaurantes-499400`), `FIREBASE_API_KEY`. (Chaves de cliente, públicas.)
- `js/app.js` — **núcleo** (App IIFE): estado, render da lista/cartões, filtros,
  pesquisa, mapa-glue, **detalhe do restaurante** (`openDetail`, tabs internas),
  **screens globais** + router por hash, leaderboards, tutorial, modais
  (sign‑in/sucesso/perfil/foto), gestos (swipe/pull‑to‑refresh), remover
  restaurante. É grande (~1.9k linhas).
- `js/db.js` — Firestore REST: `fetchAll/add/deleteRestaurant`, `fetchOverrides/
  setOverride`, `fetchUserDoc/saveUserDoc/fetchAllUsers`, `fetchComments/
  fetchCommentsByUser/fetchRecentComments/addComment`, `fetchPhotos/
  fetchRecentPhotos/addPhoto`. Encode/decode de "typed values" (`encodeValue`
  trata bool/array/map; `decodeValue` o inverso).
- `js/userdata.js` — UserData IIFE: sessão, `mine` (visited/priority/ratings/
  history), grupo (`others()`, `everyone()`), `setRating(id,stars,note,dishes)`,
  `addVisit/removeVisit`, `setPhotoURL`, persistência debounced (`saveUserDoc`).
- `js/auth.js` — AuthModule: liga `window.FirebaseAuth` (definido em index.html)
  à topbar; exporta `init`, `signIn`.
- `js/map.js` — MapModule: Google Maps, markers, `focusRestaurant`,
  `saveCamera/restoreCamera`.
- `js/places.js` — PlacesModule: `fetchDetails(r)` (Places: rating, reviews,
  fotos, telefone, horário…); cache em localStorage 1 semana. `isAvailable()`.
- `js/geocode.js` — Geocode: `locate(name,town)` → `{lat,lng,region}`. Mapeia
  distrito→região (NUTS‑II) via `REGION_BY_DISTRICT` e tem fallback por
  localidade (`regionForTown`) para evitar que falhas de geocoding caiam
  silenciosamente em Alentejo.
- `js/addRestaurant.js` — formulário "Adicionar restaurante" (+ botão IA
  "Sugerir tipo e especialidade" → `categorize`).
- `js/ai.js` — **AIModule**: cliente fino da camada de IA. `call(action, payload)`
  → `POST /api/ai` com `Authorization: Bearer <Firebase ID token>`. Helpers:
  `recommend/planner/summarizeReviews/draftReview/nlSearch/categorize` e
  `available()` (true se o Firebase Auth estiver configurado).
- `functions/` — **backend de IA** (Cloud Function 2.ª gen `ai`, Node 20,
  `europe-west1`): `index.js` (auth via `verifyIdToken`, rate-limit por uid em
  `aiUsage/{uid}`, `AnthropicVertex` → Claude no **Vertex AI**, `tool_use`
  forçado para JSON + prompt caching do catálogo), `package.json`, `.gitignore`.
  Ver **`AI_SETUP.md`** para pré-requisitos GCP/IAM e deploy.
- `js/storage.js` — localStorage helpers (visited, custom restaurants, places
  cache, overrides). `removeCustomRestaurant` existe.
- `js/planner.js` — planeador de viagem: encontra restaurantes perto da rota
  direta e desenha opções de percurso com waypoint
  (`origem → restaurante → destino`).
- `data/restaurants.json` — lista curada (todos `region: "Alentejo"`).
- `sw.js` — service worker (cache). `manifest.webmanifest` — PWA.
- `firebase/firestore.rules`, `firebase/storage.rules` — regras.
- `firebase.json` — hosting (`public: "."`) com `ignore` para www/ios/scripts/
  package.json/etc. (mantém o deploy web limpo); firestore/storage rules.
- **Capacitor (iOS):** `capacitor.config.json`, `package.json`,
  `scripts/build-www.js`, `SETUP_IOS.md`. (Ver §10.)

## 3. Deploy (como eu faço, a partir deste ambiente Linux)

A service account vem de um ficheiro carregado pelo utilizador (em
`/root/.claude/uploads/.../*apprestaurantes*.json`) que **tem texto a seguir ao
JSON** — é preciso extrair só o 1.º objeto `{...}`. Padrão usado:

```bash
node -e 'const fs=require("fs");const src="<UPLOAD>.json";const raw=fs.readFileSync(src,"utf8");
const s=raw.indexOf("{");let d=0,e=-1,q=false,esc=false;for(let i=s;i<raw.length;i++){const c=raw[i];
if(q){if(esc)esc=false;else if(c=="\\")esc=true;else if(c=="\"")q=false;continue;}
if(c=="\"")q=true;else if(c=="{")d++;else if(c=="}"){d--;if(!d){e=i;break;}}}
fs.mkdirSync("/tmp/fbcred",{recursive:true});fs.writeFileSync("/tmp/fbcred/sa.json",raw.slice(s,e+1));'
export GOOGLE_APPLICATION_CREDENTIALS=/tmp/fbcred/sa.json
firebase deploy --only hosting --project app-restaurantes-499400 --non-interactive
rm -rf /tmp/fbcred   # apagar SEMPRE a credencial no fim
```

- `firebase-tools` instala-se com `npm install -g firebase-tools` (já feito).
- Targets: `--only hosting`, `--only firestore:rules`, `--only storage`,
  `--only functions` (ou combinados). A função `ai` exige Blaze + Model Garden +
  IAM — ver `AI_SETUP.md`; a SA `claude-deploy` pode precisar de papéis extra
  (Functions/Cloud Build/Artifact Registry/Run) — se o deploy falhar por IAM,
  pedir ao utilizador para os conceder (ou correr o deploy).
- **Convenção do service worker:** a cada mudança de assets, **bump `CACHE`** em
  `sw.js` (`foodboxd-vN`). **Atual: `foodboxd-v22`.** (Histórico: restaurantes-v4
  → … v10 → foodboxd-v11 … v20 → v21 (onboarding cloud) → v22 (camada de IA).)
- Em PWA instalada, o utilizador pode precisar de **fechar/reabrir 2x** para
  apanhar a versão nova.
- **NUNCA** commitar a service account (está em `.gitignore`: `*serviceaccount*`,
  `sa.json`). As chaves em `js/config.js` são de cliente (públicas) — ok.
- Trailer dos commits desta sessão: `https://claude.ai/code/session_01L7MiCTXxY4RuUACQMUSnhp`.

## 4. Operações admin (Firestore/Storage via service account)

Quando é preciso ler/apagar/patchar dados ou pôr CORS, faço scripts Node que:
1) assinam um JWT RS256 com a private key da SA; 2) trocam por access token
(`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`); 3) chamam a REST API.

- **Scopes:** Firestore → `https://www.googleapis.com/auth/datastore`;
  Storage admin (CORS) → `https://www.googleapis.com/auth/devstorage.full_control`.
- **Firestore REST:** `https://firestore.googleapis.com/v1/projects/app-restaurantes-499400/databases/(default)/documents/...`
  - listar: GET `/restaurants?pageSize=300`; query: POST `:runQuery`.
  - apagar: DELETE `/restaurants/{id}`.
  - patch parcial: PATCH `/restaurants/{id}?updateMask.fieldPaths=region&updateMask.fieldPaths=verified` com `{fields:{...}}`.
- **Storage CORS** (para download/partilha de fotos cross‑origin): já configurado
  no bucket `app-restaurantes-499400.firebasestorage.app` (PATCH
  `storage.googleapis.com/storage/v1/b/{bucket}?fields=cors`, origin `*`, GET/HEAD).
- **Já executado nesta sessão:** apagados 2 utilizadores de teste vazios
  (mantida a conta principal `OW3B2oJHkONxk40J3AE0Hben5pl1` = Pedro Mouzinho);
  corrigida região dos restaurantes da comunidade, incluindo os que tinham sido
  gravados com Alentejo por fallback; marcados `verified` Gambrinus e O Teodósio.

## 5. Modelo de dados

**Restaurantes** (3 fontes, juntadas por `mergeRestaurants` dedup por nome|cidade):
- **Curados:** `data/restaurants.json` (estáticos no git). Sem `source`/`addedByUid`.
- **Comunidade:** Firestore `restaurants/{autoId}`. `docToRestaurant` põe
  `source: "community"`. Campos: name, town, region, category, lat, lng, notes,
  tags, mapsQuery, createdAt, **addedByUid/addedByName**, **verified** (bool).
  O badge "comunidade" só aparece se `!verified` **e** a cache/detalhe Google
  não tiver telefone (`phone`), para não marcar restaurantes reais antigos como
  comunidade.
- **Locais:** `Storage.getCustomRestaurants()` (quando sem sessão).

**Por utilizador:** `userData/{uid}` = `{ displayName, photoURL, visited[],
priority[], ratings{ id:{stars,note,dishes[],updatedAt} }, history{ id:[ISO] },
onboarded, activeGroup }`.

> ⚠️ **O `allUsers` NÃO são todos os utilizadores, e este parágrafo dizia que
> eram.** Descrevia o modelo antigo e sobreviveu à migração para o *follow*.
> Custou uma conclusão errada num handoff a 25/08: dei por garantido que uma
> conta nova via a atividade de toda a gente, e vê o vazio.
>
> O que o código faz hoje (`js/userdata.js:185`):
>
> ```js
> // Everyone I follow, plus me.
> const users = await DB.fetchUsersByIds(followIds, token);
> allUsers = users;
> ```
>
> Ou seja: **`allUsers` = quem eu sigo, mais eu.** A vista social (`group`) é
> esse conjunto filtrado pelos membros do `activeGroup`; **"Todos (global)"
> significa "sem filtro de grupo por cima de quem sigo"**, e não "toda a gente
> da app". O nome da variável mente — não lhe mudei o nome para não tocar em
> código a esta distância de uma submissão, mas fica aqui escrito.
>
> **Consequência que se vê no ecrã:** uma conta acabada de criar não segue
> ninguém, logo a Atividade mostra *"Sozinho sabe pior"* e o Leaderboard mostra
> *"Ainda não há atividade suficiente"* — as duas medidas no simulador a 25/08.
> O `buildFriendsFeed()` usa `others()` e o `computeAmigosLeaderboard()` usa
> `everyone()`: ambos partem do mesmo conjunto vazio.

**Grupos:** `groups/{autoId}` = `{ name, code, ownerUid, members:[uid], createdAt }`.
Qualquer autenticado cria (dono+membro) e lê (para encontrar por código); o dono
edita/apaga; outros só entram (acrescentam o próprio uid a `members`). O `activeGroup`
do utilizador (em `userData`) escolhe o grupo ativo; vazio = "Todos" (global). UI no
ecrã Amigos (barra de grupo + modal criar/entrar). `UserData.createGroup/joinGroup/
setActiveGroup/getGroups`; `DB.createGroup/fetchMyGroups/fetchGroupByCode/addGroupMember`.

**Comentários (críticas):** `comments/{autoId}` = `{ restaurantId, uid, author,
photoURL, text, createdAt }`.

**Fotos:** `photos/{autoId}` = `{ restaurantId, uid, author, url, path,
createdAt }`. Ficheiros em Storage `restaurants/{slug}/{uid}-{ts}.ext`. Avatares
em `avatars/{uid}-{ts}.ext`.

**localStorage keys:** `portugalRestaurants.*` (visited, custom, placesCache,
overrides, tourDone, signinPrompt[session]) — **mantidas** por
retrocompatibilidade; novas usam `foodboxd.*` (ex.: `foodboxd.a2hsDismissed`).

## 6. Regras de segurança (resumo do estado atual)

`firebase/firestore.rules`:
- `restaurants`: read all; **create** se `auth && addedByUid==auth.uid`;
  **update** `false`; **delete** se `auth && resource.data.addedByUid==auth.uid`
  (autor apaga o seu).
- `overrides`: read all; create/update all; delete false.
- `userData/{uid}`: read se autenticado (group view); write só o próprio.
- `groups`: read se autenticado; **create** se `ownerUid==auth.uid && auth.uid in
  members`; **delete**/edição livre só o dono; **update** de não-dono só para
  entrar (adiciona o próprio uid a `members`, mantendo name/code/ownerUid e sem
  remover ninguém — via `toSet().difference()`).
- `comments`/`photos`: read all; create/delete só o autor (uid match).

`firebase/storage.rules`: `restaurants/{rid}/{file}` e `avatars/{file}` — read
all; write se `auth && file começa por uid + imagem + <6MB`; delete se auth.

## 7. Histórico de features (o que foi construído nesta saga)

1. **Detalhe em tabs** (Restaurante / As minhas experiências / Críticas / Amigos)
   via `switchTab`; "Fotos da malta"→"As minhas fotos"+"Fotos de amigos"; Enter
   publica comentário; tom das labels limpo (sem emoji/informal).
2. **Navegação global** (bottom tab bar): screens Mapa/Memórias/Críticas/Amigos
   como overlays fixos sobre o mapa; router por hash (`#memorias`…). Hardening
   de regras (autor) + storage uid.
3. **Modal de login** fechável; **fotos de amigos** no feed; **restaurar zoom**
   ao fechar o detalhe (`MapModule.saveCamera/restoreCamera`).
4. **Subtabs + leaderboards** (Amigos: atividade | leaderboard por visitas,
   toggle Sempre/Este mês; Críticas: as minhas | leaderboard de restaurantes por
   estrelas). **Pratos** registados ao avaliar (chips/array). **Tutorial
   spotlight** no 1.º login (fechável; "rever tutorial" no modal de perfil).
5. **Jornada "As minhas experiências"** (nota→pratos→fotos→nota→"Marcar visita"
   exige estrelas → modal de sucesso). Prioridade virou **chip** ao lado de
   "Marcar como visitado". **Foto de perfil** editável (Storage `avatars/`).
6. **Polish iOS PWA:** sem tap‑highlight, transições rápidas, **swipe‑down** para
   fechar o detalhe, **pull‑to‑refresh** (`reloadData`), dica **A2HS** iOS,
   **splash** a cor de marca. (Sem haptics — iOS web não suporta.)
7. **Rebrand → Foodboxd** + scaffold **Capacitor** (iOS).
8. **Lightbox de fotos** (descarregar/partilhar in‑app, sem nova página) +
   **"Tirar foto"** (câmara, `capture="environment"`). CORS no bucket.
9. **Remover restaurante** (botão no detalhe, só autor/local).
10. **Adicionar:** região automática (geocode→distrito→região) + **tag
    "comunidade" só sem correspondência Google** (`verified` no add via
    `PlacesModule.fetchDetails`; badge = comunidade não verificada sem telefone
    Google em cache/detalhe).
11. **Camada de IA (Claude via Vertex AI)** — backend `functions/` (função `ai`)
    + `js/ai.js`. 6 ações com modelos tiered: `recommend` (Opus, "Sugere-me" na
    topbar, considera ratings/pratos/visitas + "perto de mim"), `planner` (Sonnet,
    notas nas paragens), `summarizeReviews`/`draftReview`/`nlSearch`/`categorize`
    (Haiku). Auth por Firebase ID token, rate-limit por uid, `tool_use` para JSON,
    prompt caching do catálogo. Setup/IAM/deploy em `AI_SETUP.md`. **Fornecedor
    selecionável** (`AI_PROVIDER`): **em produção usa a API direta da Anthropic**
    (`@anthropic-ai/sdk`, key em `functions/.env` gitignored) porque o Vertex
    recusou quota a projeto novo; `vertex` fica disponível via env. Cloud Run `ai`
    com `allUsers` run.invoker; runtime SA = appspot; rate-limit fail-open. (sw v22.)
12. **Grupos** (`groups/{id}`): qualquer user cria um grupo (recebe um código) e
    convida outros (entram com o código). A vista social (feed, leaderboard,
    badges "visitado por N", médias) passa a estar **scoped** ao grupo ativo;
    "Todos" = global (default). UI no ecrã Amigos. **Filtro "Só prioritários"** na
    lista. **Sidebar fecha-se sozinha** ao sair do mapa para outro tab. (sw v23.)

## 8. Convenções / decisões

- **Tom das labels:** claro/neutro, **sem emojis** na UI, sem linguagem
  informal/"de amigos". (Aplicar a textos novos.)
- **Rankings sem emoji** (top‑3 por cor ouro/prata/bronze).
- **localStorage:** não renomear as keys `portugalRestaurants.*` (perderia dados
  de utilizadores). Novas → `foodboxd.*`.
- **Verified/comunidade:** curados nunca têm badge; comunidade só tem "comunidade"
  se `!verified` e o Google Places não devolver telefone.
- **Região:** Setúbal→Lisboa por omissão (AML); fronteiras Alentejo Litoral podem
  precisar de correção manual no campo (editável).

## 9. Itens em aberto / TODO

- ⏳ **Node 20 das Cloud Functions é decomissionado a 30/10/2026.** Apareceu no
  deploy de 24/08. As duas funções (`ai` e `conta`) estão em `nodejs20`; a
  partir dessa data **não se publica mais nenhuma** sem migrar. A app não pára
  nesse dia — o que se perde é poder corrigir o lado do servidor. Mudar o
  `engines` do `functions/package.json` e republicar; o aviso pede também um
  `firebase-functions` mais recente, que traz mudanças que partem. Fazer com
  calma, não em cima de um incidente.

- ~~**Login Google no WKWebView (Capacitor)**~~ — **feito** (agosto). E a causa
  não era o `signInWithPopup`: era o `getAuth()` a nunca inicializar em
  `capacitor://`. Ver a secção 12 e o Bloco 3 do handoff.
- ~~**Authorized domains (Firebase Auth)**~~ — confirmado.
- **Dead‑band iOS standalone:** corrigido com `body{height:100dvh;overflow:hidden}`.
  Se reaparecer nalguma versão de iOS, fazer refactor para flex‑column com a
  tabbar no fluxo (plano já delineado).
- **OTA (live updates)** para a app nativa (Capgo/Appflow) — opcional, evita
  resubmeter a cada mudança de código.
- **Backfill `verified`** dos restantes 5 da comunidade — só se forem reais.
- Confirmar que novas localidades relevantes ficam no fallback `regionForTown`
  quando a geocodificação não devolver distrito.

## 10. App nativa iOS (Capacitor) — estado

**Blocos 0 a 3 do handoff: feitos.** Do Bloco 4 falta o que é consola e decisão.

Capacitor envolve a web app numa casca iOS e reaproveita 100% do código.
`appId = pt.foodboxd.app`, `webDir = www` (gerado por `npm run build:www`).
Build, assinatura e submissão **só num Mac com Xcode**.

```bash
npm install
npm run ios:build     # sync + build para simulador, com as flags certas
```

**O que já funciona no simulador, medido:** entrar com Google e com Apple (sessão
real, dados reais do Firestore), o "Pergunta-me" de ponta a ponta, carregar fotos,
apagar a conta, e a permissão de localização com o texto certo, pedida **só**
dentro do "Pergunta-me" e agora **uma vez só** (o @capacitor/geolocation tirou a
segunda caixa, a que dizia "localhost").

**O que falta é do dono:** equipa no Xcode (4.1), submeter as etiquetas de
privacidade (já levantadas, 4.3), e a conta de teste com nota ao revisor (4.4).

A pasta `ios/` é **gerada e está no `.gitignore`**. Tudo o que ela precisa e que
se perderia num clone novo vive na raiz e é reposto pelo `scripts/ios-info.mjs`
a cada `npm run sync`: os textos de permissão (`ios-info.json`), os entitlements
(`ios-entitlements.plist`), o `GoogleService-Info.plist`, o registo desse ficheiro
nos recursos do Xcode, o URL scheme do login com a Google, e o subspec
`CapacitorFirebaseAuthentication/Google` no Podfile.

## 11. Correr / verificar localmente

- É um site estático: servir a pasta (ex.: `python3 -m http.server`) ou abrir
  `index.html`. Sem build.
- **Há arneses, e correm nos dois ambientes** (já não é verdade que "não há
  testes"):

```bash
npm run audit          # contraste, alvos de toque, transbordo, ids repetidos, erros de JS
npm run test:map       # enquadramento do mapa — IMPRIME em vez de afirmar, compara os números
npm run test:update    # o service worker apanhar uma versão nova (7 casos)
npm run preview        # telemóvel e ecrã grande, claro e escuro
```

  No contentor o Chromium está noutro sítio: `CHROMIUM_PATH=... npm run audit`.

- **E há um quinto, que precisa do emulador** — apagar conta, a única operação
  irreversível da app:

```bash
npm run emu:start      # noutro terminal; precisa de JDK (brew install openjdk)
npm run test:apagar    # 26 afirmações: leva o que é meu, deixa o que é dos outros
```

  O `emu:start` encontra o JDK sozinho, incluindo a fórmula keg-only do
  Homebrew. Se não houver nenhum, diz o que instalar em vez de despejar um erro
  de Java. **Não corras isto contra a base real** — são oito pessoas.

- **Se mexeres em ficheiros que a app corre, corre-os.** Se só mexeres em
  documentação, **diz que não os correste e porquê** — dar por corridos um
  `audit=0` que não tem relação nenhuma com o que mudou já aconteceu, e não vale
  nada.

---

## 12. O que se aprendeu a correr a app (agosto de 2026)

Nada disto se descobre a ler código. São armadilhas que **falham em silêncio** —
sem erro, sem aviso, às vezes com a ferramenta a responder o contrário da
verdade. Estão aqui para não custarem duas vezes.

### As que enganam pelo silêncio

| O que se vê | O que é, na verdade |
| --- | --- |
| `cap add ios` rebenta com um erro de Unicode do Ruby | O `LANG` está vazio. `export LANG=en_US.UTF-8` e correr `pod install` por cima. Não é o CocoaPods nem o Ruby. |
| O plugin nativo não aparece em `Capacitor.Plugins` | O Podfile pediu **só subspecs**. O `source_files` está na spec raiz e **não é herdado** — sem a raiz o CocoaPods gera um target agregado que não compila nada. Declara raiz **e** `/Google`, em duas linhas. |
| `signInWithGoogle()` fica pendurado, sem erro nem folha | O provider não está em `plugins.FirebaseAuthentication.providers` do `capacitor.config.json`. O handler nunca é criado e a promessa nunca volta. |
| Login com a Google devolve `keychain error` | Faltam **entitlements**. A app compila sem eles quando não há identidade de assinatura, e o GoogleSignIn não consegue guardar o token. |
| `codesign -d --entitlements` mostra um dict **vazio** | **Não acredites.** Num build de simulador sem equipa o Xcode não os embute na assinatura, mas o simulador aplica-os à mesma. A prova está no log do `securityd`. |
| Uma guarda `window.UserData && …` nunca corre | `UserData` e `CONFIG` são `const` de topo — **globais léxicos, não propriedades do `window`**. Usa `typeof X !== "undefined"`. |
| O Perfil mostra "Amigo" logo depois de entrar com a Apple | O `onAuthStateChanged` avisa mudanças de **sessão**, não de **perfil**. O nome é guardado a seguir e ninguém é avisado. Resolvido com o canal `onProfileChange`. |
| O limite diário da IA parecia estar a funcionar | Não estava. O `checkRateLimit` **falha aberto** de propósito, e a conta de serviço não tinha acesso ao Firestore — `rate-limit skipped` em todas as chamadas, durante dias. |

### As que mudam o desenho do trabalho

**O Auth do Firebase não inicializa em `capacitor://`.** O `getAuth()` do bundle
browser regista um resolver de popup/redirect que valida a origem, e
`capacitor://` não é http(s). O objeto existe, responde a tudo, e
`_isInitialized` fica `false` para sempre — o `onAuthStateChanged` nunca chama o
callback. Resolve-se com `initializeAuth(app, { persistence })`, **sem** resolver.

Duas consequências que poupam trabalho a quem vier:

- **O `signInWithRedirect` está fechado.** Precisa do resolver, que é exatamente
  o que teve de sair. Não é alternativa ao plugin nativo.
- **A camada de dados não precisa de migrar.** Com o Auth inicializado, o
  `signInWithCredential` funciona e o Firestore/Storage ficam com token — não é
  preciso `@capacitor-firebase/firestore` nem `/storage`.

**O `iosScheme: "https"` não serve.** O Capacitor ignora-o em silêncio; testado
com config confirmada no bundle compilado e instalação limpa, e a origem
continuou `capacitor://localhost`.

**A origem nativa é `capacitor://localhost`, e isso morde em três sítios:**
o `location.hostname` é `localhost` (a app dava-se como emulador), os pedidos
relativos a `/api/` resolvem para o handler local e dão 404 (daí o
`CONFIG.API_BASE`), e a chave do Maps precisa de `capacitor://localhost` nos
referrers.

### O que ainda está por medir

- **A captura do nome da Apple numa primeira autorização.** O caminho está lido
  no código do plugin e a re-emissão está medida, mas nunca correu com a Apple a
  mandar um nome. **Só há uma passagem:** o *parar de usar* em `appleid.apple.com`.
  Quem a gastar, que a gaste com instrumentação ligada.
- ~~**O segundo pedido de localização, que diz "localhost".**~~ — **resolvido**
  (24/08). O `@capacitor/geolocation` faz a localização do lado nativo, por isso
  a WKWebView nunca chega a pedir a sua. Medido: uma caixa só, com o texto do
  `ios-info.json`, e as coordenadas chegam ao "Pergunta-me". Ver o Bloco 4.2 do
  handoff.

  **A armadilha que isto deixou escrita:** um simulador acabado de arrancar
  **não tem posição nenhuma**. Sem `xcrun simctl location booted set`, o plugin
  devolve erro e a IA responde *"Sem a tua localização…"* — que é exatamente o
  que se veria se o plugin estivesse partido. A leitura óbvia é a errada.

### Decisões tomadas, para não se reabrirem por engano

- **Contas Apple e Google ficam separadas, de propósito.** São oito pessoas,
  todas entram pela Google, e o Sign in with Apple só existe porque a 4.8 obriga.
  Reabre-se se alguém aparecer com duas contas a sério, ou quando a base deixar
  de ser oito pessoas conhecidas.
- **Capacitor fica no 6.** O `npm audit` aponta um `tar` transitivo do
  `@capacitor/cli` — é devDependency, não chega aos utilizadores, e o `--force`
  saltaria para o 8 e reescrevia a casca nativa inteira.
