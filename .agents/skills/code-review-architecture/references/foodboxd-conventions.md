# Foodboxd — Convencoes Tecnicas

> Referencia rapida das convencoes do projecto. Extraido de CONTEXT.md.
> Qualquer codigo que viole estas regras DEVE ser flagged no review.

## Modulos (ficheiros JS)

| Ficheiro | Modulo (IIFE) | Responsabilidade |
|----------|---------------|------------------|
| js/config.js | CONFIG (window) | Chaves publicas (Maps, Firebase) |
| js/app.js | App | Nucleo: estado, render, router, detalhe, screens, leaderboards |
| js/db.js | DB | Firestore REST (CRUD restaurants, userData, comments, photos, groups) |
| js/userdata.js | UserData | Sessao, marcas pessoais, grupo, persistencia |
| js/auth.js | AuthModule | Firebase Auth UI glue |
| js/map.js | MapModule | Google Maps, markers, focus, camera |
| js/places.js | PlacesModule | Places API enrichment + cache |
| js/geocode.js | Geocode | Nome+cidade -> lat,lng,region |
| js/addRestaurant.js | (inline) | Formulario adicionar |
| js/ai.js | AIModule | Cliente fino para Cloud Function /api/ai |
| js/storage.js | Storage | localStorage helpers |
| js/planner.js | (inline) | Planeador de viagem |

## Ordem de Carregamento (index.html)

Scripts carregam nesta ordem (dependencias implicitas):
1. config.js
2. storage.js
3. db.js
4. geocode.js
5. places.js
6. map.js
7. userdata.js
8. auth.js
9. ai.js
10. addRestaurant.js
11. planner.js
12. app.js (ultimo — orquestra tudo)

## Firestore Collections

| Collection | Doc ID | Campos chave | Rules |
|------------|--------|--------------|-------|
| restaurants | auto | name, town, region, category, lat, lng, addedByUid, verified | read: all; create: auth+uid; delete: author only |
| userData | uid | displayName, photoURL, visited[], priority[], ratings{}, history{}, activeGroup | read: auth; write: own uid |
| comments | auto | restaurantId, uid, author, text, createdAt | read: all; create/delete: author |
| photos | auto | restaurantId, uid, author, url, path, createdAt | read: all; create/delete: author |
| groups | auto | name, code, ownerUid, members[], createdAt | read: auth; create: owner; delete: owner |
| overrides | auto | (shared overrides) | read: all; create/update: all; delete: no |
| aiUsage | uid | day, count, updatedAt | (internal rate-limit) |

## localStorage Keys

**Legacy (NAO renomear):**
- `portugalRestaurants.visited`
- `portugalRestaurants.custom`
- `portugalRestaurants.placesCache`
- `portugalRestaurants.overrides`
- `portugalRestaurants.tourDone`
- `portugalRestaurants.signinPrompt` (session)

**Novas:**
- `foodboxd.a2hsDismissed`
- `foodboxd.*` (prefixo para novas keys)

## Categorias Validas

```javascript
const CATEGORIES = ['tradicional', 'petiscos', 'pastelaria', 'fine-dining'];
```

## Regioes (NUTS-II)

- Norte, Centro, Lisboa, Alentejo, Algarve, Acores, Madeira
- Mapeamento: distrito -> regiao via `REGION_BY_DISTRICT` em geocode.js
- Setubal -> Lisboa (AML) por default

## Service Worker

- Cache key: `foodboxd-vN` (bump a cada deploy)
- Actual: `foodboxd-v23`
- Estrategia: cache-first para assets, network-first para dados

## Regras de Commits

- Bump `CACHE` em sw.js a CADA mudanca de assets
- NUNCA commitar service account / .env
- Branch de trabalho: `claude/beautiful-davinci-vsyokk`
