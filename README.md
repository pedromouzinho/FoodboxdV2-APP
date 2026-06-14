# Foodboxd 🍽️

**"Letterboxd para restaurantes"** — um mapa interativo + diário social onde
avalias sítios, registas os pratos que comeste, guardas memórias/experiências, e
vês a atividade e os leaderboards dos amigos.

- **Produção:** https://foodboxd.pt (e https://app-restaurantes-499400.web.app)
- **Stack:** vanilla JS (sem framework, sem build) · PWA · Firebase
  (Hosting + Firestore + Storage + Auth) · Google Maps/Places.
- **App iOS nativa (opcional):** casca Capacitor — ver [`SETUP_IOS.md`](SETUP_IOS.md).
- **Continuidade / handoff técnico completo:** ver [`CONTEXT.md`](CONTEXT.md).

## Funcionalidades

- 🗺️ Mapa interativo (Google Maps) com pins por categoria; lista lateral
  agrupada por **região**, com pesquisa e filtros (região, categoria, preço).
- 📱 Navegação por **bottom tab bar**: Mapa · Memórias · Críticas · Amigos.
- 👥 **Login Google** torna isto numa app de grupo: visitados, prioridades,
  estrelas, **nota pessoal e pratos**, histórico de visitas — sincronizado e
  visível aos amigos. Comentários (críticas) e **fotos** por restaurante.
- 🧭 Detalhe do restaurante em **tabs**: Restaurante · As minhas experiências ·
  Críticas · Amigos. A "experiência" é uma jornada: nota → pratos → fotos → nota
  → *Marcar visita de hoje* → registo partilhado.
- 🏆 **Leaderboards**: amigos por nº de visitas (sempre / este mês) e restaurantes
  por média de estrelas do grupo.
- 📸 Fotos com **lightbox** (descarregar/partilhar in‑app) e **"Tirar foto"**
  (câmara no telemóvel). Foto de **perfil** editável.
- ➕ **Adicionar restaurante** com um formulário simples (nome + cidade + tipo).
  A localização e a **região** são detetadas automaticamente. Se o Google tiver
  correspondência (rating/reviews/fotos/telefone) entra como **verificado**;
  caso contrário recebe a tag **"comunidade"**. O autor pode **remover** o que
  adicionou.
- 🎓 **Tutorial guiado** no primeiro login (sempre fechável).
- 📲 Instalável como **PWA** (Adicionar ao ecrã principal); gestos nativos
  (arrastar para fechar, pull‑to‑refresh), safe‑areas e splash no iOS.

## Categorias

| Categoria | Quando usar |
| --- | --- |
| **Tradicional** | Restaurante/tasca típico, comida regional |
| **Petiscos** | Pratos pequenos, cervejaria, casual |
| **Doces / Pastelaria** | Pastelaria, doces, café |
| **Fine Dining** | Chef‑driven, menu de degustação, reserva |

A cor do pin segue a categoria. Pode ser editada no detalhe (partilhada via
Firebase) e o Google pode sugerir uma categoria com um toque.

## Configuração (`js/config.js`)

Chaves de **cliente** (públicas; o acesso é controlado pelas regras de
segurança):

```js
const CONFIG = {
  GOOGLE_MAPS_API_KEY: "…",                 // Maps JS, Places, Directions, Geocoding
  FIREBASE_PROJECT_ID: "app-restaurantes-499400",
  FIREBASE_API_KEY: "…"
};
```

A app degrada bem: sem Maps key → lista + links do Google; sem Firebase →
adições guardadas só no browser. **Authorized domains** do Firebase Auth devem
incluir `foodboxd.pt` e `*.web.app`. A Maps key deve permitir esses domínios
(HTTP referrers).

## Deploy

Site estático servido pelo **Firebase Hosting** (`firebase.json` → `public: "."`,
com `ignore` para `www/`, `ios/`, `scripts/`, `package.json`, etc.).

```bash
firebase deploy --only hosting --project app-restaurantes-499400
# regras: --only firestore:rules,storage
```

**A cada deploy com mudança de assets, faz bump do `CACHE` em `sw.js`**
(`foodboxd-vN`). Detalhes do fluxo de deploy/admin (service account, scripts
Firestore REST, CORS) estão no [`CONTEXT.md`](CONTEXT.md).

## Estrutura

```
index.html            – markup, sprite de ícones, bootstrap Firebase, tabbar, modais
css/style.css         – design system (um ficheiro)
js/config.js          – chaves Google Maps + Firebase
js/app.js             – núcleo: estado, render, detalhe (tabs), screens+router, leaderboards, modais, gestos
js/db.js              – Firestore REST (restaurants, overrides, userData, comments, photos)
js/userdata.js        – marcas por pessoa + grupo (cloud quando com sessão)
js/auth.js            – Google Sign‑In UI glue
js/map.js             – Google Maps (markers, focus, save/restore câmara)
js/places.js          – enriquecimento Places (rating/fotos/horário/telefone)
js/geocode.js         – nome+cidade → {lat,lng,region} (distrito→NUTS‑II)
js/addRestaurant.js   – formulário de adicionar
js/storage.js         – localStorage (visited, custom, places cache, overrides)
js/planner.js         – planeador de viagem
data/restaurants.json – lista curada (em git)
firebase/*.rules      – regras Firestore + Storage
sw.js, manifest.webmanifest – PWA
capacitor.config.json, package.json, scripts/build-www.js, SETUP_IOS.md – app iOS
CONTEXT.md            – handoff técnico completo
```

## Regras de segurança (atuais)

- `restaurants`: leitura pública; criar só autenticado e com `addedByUid ==
  uid`; **apagar só o autor**; editar bloqueado.
- `userData/{uid}`: leitura por qualquer autenticado (group view); escrita só o
  próprio.
- `comments` / `photos`: leitura pública; criar/apagar só o autor (uid match).
- Storage `restaurants/*` e `avatars/*`: leitura pública; escrita só imagens
  <6 MB com nome prefixado pelo uid.

Os ficheiros canónicos são `firebase/firestore.rules` e `firebase/storage.rules`.

## Adicionar restaurantes à mão (curados, em git)

Usa **"Opções avançadas → Copiar como JSON"** no formulário e cola em
`data/restaurants.json`. Os curados têm prioridade e ficam versionados.
