# Foodboxd — Infrastructure Context (Firebase + Google Cloud)

> Contexto COMPLETO da infraestrutura por detras de foodboxd.pt.
> Todos os agentes devem ter nocao disto mesmo que a sua task nao
> toque directamente na infra. Ultima actualizacao: 2026-06-15.

---

## Google Cloud Project

- **Project ID:** `app-restaurantes-499400`
- **Plano:** Blaze (pay-as-you-go) — custo actual ~0 EUR/mes
- **Regiao principal:** `europe-west1` (Belgica)
- **Conta principal:** Pedro Mouzinho (`OW3B2oJHkONxk40J3AE0Hben5pl1`)
- **Service account de deploy:** `claude-deploy` (papeis limitados)
- **APIs activas:** Cloud Functions, Cloud Build, Artifact Registry, Cloud Run, AI Platform

---

## Firebase Services

### Hosting
- **Dominio custom:** `foodboxd.pt` (DNS apontado para Firebase)
- **Dominio default:** `app-restaurantes-499400.web.app`
- **Deploy:** `firebase deploy --only hosting` (site estatico, sem build)
- **Public dir:** `.` (raiz do projecto)
- **Ignores:** www/, ios/, scripts/, package.json, node_modules/
- **Rewrite:** `/api/ai` → Cloud Function `ai` (europe-west1)

### Firestore (Database)
- **Modo:** Native (nao Datastore)
- **Localizacao:** `europe-west1`
- **Acesso client-side:** via REST API (nao SDK) em `js/db.js`
- **URL base:** `https://firestore.googleapis.com/v1/projects/app-restaurantes-499400/databases/(default)/documents/`

**Collections:**

| Collection | Docs | Proposito | Leitura | Escrita |
|-----------|------|-----------|---------|--------|
| `restaurants` | ~100-200 | Restaurantes da comunidade | Publica | Auth + uid match |
| `userData` | ~10 | Dados por utilizador (visited, ratings, priority, history) | Auth (qualquer) | So proprio uid |
| `comments` | ~50 | Criticas/comentarios por restaurante | Publica | Auth + uid match |
| `photos` | ~30 | Metadados de fotos (url, path, autor) | Publica | Auth + uid match |
| `groups` | ~3 | Grupos sociais (nome, codigo, membros) | Auth | Owner cria/apaga |
| `overrides` | ~20 | Overrides partilhados (categoria, preco) | Publica | Qualquer (sem auth!) |
| `aiUsage` | ~10 | Rate-limit de IA por uid/dia | Admin only | Admin only (Cloud Function) |

**Campos chave do doc `restaurants`:**
```
name, town, region, category, lat, lng, notes, tags,
mapsQuery, createdAt, addedByUid, addedByName, verified
```

**Campos chave do doc `userData/{uid}`:**
```
displayName, photoURL, visited[], priority[],
ratings{ id: {stars, note, dishes[], updatedAt} },
history{ id: [ISO timestamps] },
onboarded, activeGroup
```

### Firebase Auth
- **Provider:** Google Sign-In (unico)
- **Authorized domains:** foodboxd.pt, app-restaurantes-499400.web.app, localhost
- **Client-side:** `signInWithPopup` (modulo ES inline no index.html)
- **Token:** Firebase ID token enviado como `Bearer` nos headers
- **Utilizadores actuais:** ~10 (beta, amigos)

### Firebase Storage
- **Bucket:** `app-restaurantes-499400.firebasestorage.app`
- **Estrutura:**
  - `restaurants/{slug}/{uid}-{timestamp}.ext` — fotos de restaurantes
  - `avatars/{uid}-{timestamp}.ext` — fotos de perfil
- **Limites:** imagens apenas, < 6MB, nome prefixado pelo uid
- **CORS:** configurado (origin `*`, metodos GET/HEAD)
- **Acesso:** leitura publica, escrita autenticada com uid prefix

### Cloud Functions
- **Funcao:** `ai` (Gen2, Node 20)
- **Regiao:** `europe-west1`
- **Runtime SA:** `app-restaurantes-499400@appspot.gserviceaccount.com`
- **Timeout:** 60s
- **Max instances:** 10
- **CORS:** habilitado
- **Trigger:** HTTP (via hosting rewrite `/api/ai`)

**O que faz:**
1. Valida Firebase ID token (`verifyIdToken`)
2. Rate-limit por uid (120 calls/dia em `aiUsage/{uid}`)
3. Chama Anthropic API (Claude) com `tool_use` forcado
4. Devolve JSON estruturado ao cliente

**Accoes disponiveis:**
| Accao | Modelo | Descricao |
|-------|--------|-----------|
| recommend | Opus 4.8 | Recomendacao personalizada do catalogo |
| tasteProfile | Sonnet 4.6 | Perfil de gosto + queries Google Maps |
| planner | Sonnet 4.6 | Notas em paragens de viagem |
| summarizeReviews | Haiku 4.5 | Resumo de avaliacoes Google |
| draftReview | Haiku 4.5 | Rascunho de critica pessoal |
| nlSearch | Haiku 4.5 | Pesquisa em linguagem natural → filtros |
| categorize | Haiku 4.5 | Sugestao de categoria ao adicionar |

**Configuracao (env vars):**
- `AI_PROVIDER=anthropic` (default; vertex disponivel)
- `ANTHROPIC_API_KEY=sk-ant-...` (em `functions/.env`, gitignored)
- `AI_DAILY_CAP=120`
- `MODEL_RECOMMEND=claude-opus-4-8`
- `MODEL_PLANNER=claude-sonnet-4-6`
- `MODEL_CHEAP=claude-haiku-4-5`

---

## Deploy & CI

### Processo de Deploy
```bash
# 1. Service account (upload manual, extrair JSON)
export GOOGLE_APPLICATION_CREDENTIALS=/tmp/fbcred/sa.json

# 2. Deploy hosting (site estatico)
firebase deploy --only hosting --project app-restaurantes-499400

# 3. Deploy functions (AI backend)
cd functions && npm install && cd ..
firebase deploy --only functions

# 4. Deploy rules
firebase deploy --only firestore:rules,storage

# 5. SEMPRE: bump sw.js cache version + apagar SA
```

### Service Worker
- **Ficheiro:** `sw.js`
- **Cache key actual:** `foodboxd-v23`
- **Estrategia:** cache-first (assets) + network-first (dados)
- **REGRA:** bump version a CADA deploy com mudanca de assets
- **Caveat PWA:** user pode precisar de fechar/reabrir 2x

### Git
- **Repo:** `pedromouzinho/dbdeai` (GitHub)
- **Branch activa:** `claude/beautiful-davinci-vsyokk`
- **PR aberto:** #7
- **NUNCA commitar:** service account, `.env`, `sa.json`

---

## Custos & Limites

| Servico | Limite free | Actual | Custo extra |
|---------|------------|--------|-------------|
| Hosting | 10 GB/mes transfer | ~0.1 GB | $0.15/GB |
| Firestore | 50K reads/dia, 20K writes/dia | ~1K reads | $0.06/100K reads |
| Storage | 5 GB, 50K downloads/dia | ~0.5 GB | $0.026/GB |
| Auth | 10K verifications/mes | ~50 | Gratis |
| Functions | 2M invocations/mes | ~100/dia | $0.40/M |
| Anthropic API | Pay-per-use | ~$5/mes | Varia por modelo |

**Custo total actual: ~0-5 EUR/mes**

---

## Seguranca (resumo)

- Chaves no client (`GOOGLE_MAPS_API_KEY`, `FIREBASE_API_KEY`) sao **publicas por design** (restricoes por dominio/referrer)
- `ANTHROPIC_API_KEY` fica SO no servidor (Cloud Function env)
- Service account NUNCA no repo (`.gitignore` cobre `*serviceaccount*`, `sa.json`)
- Firestore rules enforcam auth + uid match em escritas
- Storage rules enforcam uid prefix + content-type + size
- Cloud Function valida token + rate-limits

---

## Dados Externos (Google)

### Google Maps JavaScript API
- **Uso:** mapa interativo, markers, directions
- **Key restriction:** HTTP referrers (foodboxd.pt, *.web.app, localhost)
- **APIs enabled:** Maps JS, Places, Directions, Geocoding

### Google Places API
- **Uso:** enriquecimento (rating, reviews, fotos, telefone, horario)
- **Cache:** localStorage com TTL de 1 semana
- **Fetch:** lazy (so ao abrir detalhe, nao preemptivo)

### Google Geocoding API
- **Uso:** nome+cidade → lat,lng,distrito,regiao
- **Mapping:** distrito → regiao NUTS-II via `REGION_BY_DISTRICT`

---

## Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER (PWA)                           │
│  index.html + js/*.js + css/style.css                      │
│                                                             │
│  ┌──────────┐ ┌────────┐ ┌────────┐ ┌──────────────┐  │
│  │  db.js    │ │ map.js │ │ ai.js  │ │ userdata.js  │  │
│  └────┬─────┘ └───┬────┘ └───┬────┘ └──────┬───────┘  │
└──────┼────────────┼─────────┼────────────┼────────────┘
       │             │          │             │
       │             │          │             │
┌──────┴─────┐  ┌────┴────┐  ┌──┴──────┐  ┌────┴───────┐
│ FIRESTORE  │  │ GOOGLE   │  │ CLOUD    │  │ FIREBASE   │
│ (REST API) │  │ MAPS/    │  │ FUNCTION │  │ AUTH +     │
│            │  │ PLACES   │  │ `ai`     │  │ STORAGE    │
└────────────┘  └─────────┘  └────┬─────┘  └────────────┘
                                    │
                              ┌────┴────────┐
                              │ ANTHROPIC    │
                              │ API (Claude) │
                              └─────────────┘
```

---

## O Que Isto Significa Para Cada Tipo de Agente

**Code review agents:**
- Sabem que Firestore e via REST (nao SDK) — padroes de fetch/error handling diferentes
- Sabem que auth e Google Sign-In + ID token — reviews de auth focam-se no token flow
- Sabem que nao ha server rendering — tudo e client-side

**Marketing/Growth agents:**
- Sabem que o deploy e instantaneo (Firebase Hosting) — podem sugerir landing pages rapidas
- Sabem que ha custos near-zero — nao precisam de se preocupar com infra costs
- Sabem que o auth e Google-only — signup friction e baixo
- Sabem que ha ~10 users — estamos em fase de early adopters

**Analytics agents:**
- Sabem que os dados vivem no Firestore — para analytics, precisam de ingestao
- Sabem as collections e campos exactos — podem propor queries/dashboards concretos
- Sabem que nao ha GA4 nem Mixpanel ainda — precisam de propor setup

**UI/UX agents:**
- Sabem que e PWA (nao app nativa) — limitacoes de iOS Safari aplicam-se
- Sabem que fotos vem do Firebase Storage (latencia, CDN) — optimizacao de imagens
- Sabem que Places API tem cache de 1 semana — dados podem estar stale

**SEO agents:**
- Sabem que e Firebase Hosting (suporta redirects, headers custom, rewrites)
- Sabem que nao ha SSR — SEO depende de meta tags estaticas ou pre-rendering
- Sabem o dominio exacto e que ha 2 URLs (custom + .web.app)
