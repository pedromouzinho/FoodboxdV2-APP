# Firebase Security Checklist — Foodboxd

> Referencia do agente code-review-security para auditar regras e codigo Firebase.

## Firestore Rules (firebase/firestore.rules)

### Estado Atual das Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Restaurantes
    match /restaurants/{docId} {
      allow read: if true;
      allow create: if request.auth != null
                    && request.resource.data.addedByUid == request.auth.uid;
      allow update: if false;
      allow delete: if request.auth != null
                    && resource.data.addedByUid == request.auth.uid;
    }

    // Overrides (categoria/preco partilhados)
    match /overrides/{docId} {
      allow read: if true;
      allow create, update: if true;  // ATENCAO: sem auth
      allow delete: if false;
    }

    // Dados do utilizador
    match /userData/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid;
    }

    // Grupos
    match /groups/{groupId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
                    && request.resource.data.ownerUid == request.auth.uid
                    && request.auth.uid in request.resource.data.members;
      allow delete: if request.auth != null
                    && resource.data.ownerUid == request.auth.uid;
      allow update: if request.auth != null
                    && (resource.data.ownerUid == request.auth.uid
                        || /* join logic: adds own uid only */);
    }

    // Comentarios
    match /comments/{docId} {
      allow read: if true;
      allow create: if request.auth != null
                    && request.resource.data.uid == request.auth.uid;
      allow delete: if request.auth != null
                    && resource.data.uid == request.auth.uid;
    }

    // Fotos
    match /photos/{docId} {
      allow read: if true;
      allow create: if request.auth != null
                    && request.resource.data.uid == request.auth.uid;
      allow delete: if request.auth != null
                    && resource.data.uid == request.auth.uid;
    }

    // AI Usage (rate limit)
    match /aiUsage/{uid} {
      // Managed by Cloud Function only (admin SDK)
      allow read, write: if false;
    }
  }
}
```

### Findings Conhecidos

| ID | Severidade | Descricao | Estado |
|----|-----------|-----------|--------|
| FW-001 | MEDIO | `overrides` permite create/update sem auth | Aceite (intencional para UX sem login) |
| FW-002 | BAIXO | `userData` read por qualquer autenticado (group view) | Aceite (by design para social) |
| FW-003 | INFO | `restaurants` update bloqueado (nem admin pode via rules) | OK (edits via overrides) |

## Storage Rules (firebase/storage.rules)

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Fotos de restaurantes
    match /restaurants/{rid}/{file} {
      allow read: if true;
      allow write: if request.auth != null
                   && file.matches(request.auth.uid + '-.*')
                   && request.resource.contentType.matches('image/.*')
                   && request.resource.size < 6 * 1024 * 1024;
      allow delete: if request.auth != null;
    }

    // Avatares
    match /avatars/{file} {
      allow read: if true;
      allow write: if request.auth != null
                   && file.matches(request.auth.uid + '-.*')
                   && request.resource.contentType.matches('image/.*')
                   && request.resource.size < 6 * 1024 * 1024;
      allow delete: if request.auth != null;
    }
  }
}
```

### Audit Points
- File name DEVE comecar com uid (previne overwrite de fotos alheias)
- Content-type restrito a imagens
- Size < 6MB
- Delete: qualquer autenticado pode apagar (MEDIO — considerar restringir ao owner)

## Cloud Function Security

### Autenticacao
```javascript
async function requireUser(req) {
  const h = req.get('Authorization') || '';
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return null;
  try { return await admin.auth().verifyIdToken(m[1]); }
  catch (e) { return null; }
}
```
- Token verificado pelo Firebase Admin SDK (seguro)
- Rejeita 401 se token invalido/expirado

### Rate Limiting
- `aiUsage/{uid}`: counter diario
- Cap: 120 pedidos/dia (configuravel via AI_DAILY_CAP)
- Fail-open: se Firestore nao responder, permite (BAIXO risco)

### Input Validation na Cloud Function
- `action` deve estar em `ACTIONS` object (whitelist)
- `catalog` truncado a 400 items (previne payload gigante)
- Nenhum eval/Function constructor
- Sem SQL/NoSQL injection (usa Firestore Admin SDK, nao raw queries)

## Chaves e Secrets

| Chave | Tipo | Onde | Exposta? |
|-------|------|------|----------|
| GOOGLE_MAPS_API_KEY | Client | js/config.js | Sim (publico, domain-restricted) |
| FIREBASE_API_KEY | Client | js/config.js | Sim (publico, limitado a auth+hosting) |
| ANTHROPIC_API_KEY | Secret | functions/.env | NAO (gitignored, so no servidor) |
| Service Account | Secret | Upload manual | NAO (gitignored, apagada apos uso) |

## Ataques a Monitorizar

1. **Abuse de overrides** — qualquer pessoa pode alterar categorias/precos (sem auth)
2. **Enumeration de userData** — qualquer autenticado le todos os userData (social feature)
3. **Storage abuse** — upload de 6MB repetido para encher quota
4. **AI abuse** — 120 calls/dia e o cap; um atacante motivado cria contas
5. **XSS via nome de restaurante** — se inserido via innerHTML
