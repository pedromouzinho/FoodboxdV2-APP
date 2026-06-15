# Foodboxd — camada de IA (Claude via Vertex AI)

A app ganhou uma camada de IA servida por uma **Cloud Function** (`functions/index.js`,
função `ai`) que fala com a **Claude através do Vertex AI** (Model Garden do Google
Cloud). A chave nunca chega ao browser: o cliente envia o **Firebase ID token** e a
função autentica-se no Vertex pela **service account de runtime** (ADC), sem API key.

## Arquitetura

```
browser (js/ai.js)
  │  POST /api/ai   { action, ... }   Authorization: Bearer <Firebase ID token>
  ▼
Hosting rewrite  /api/ai → função `ai` (europe-west1)
  ▼
Cloud Function `ai` (functions/index.js)
  • verifyIdToken (Admin SDK)                  → 401 se inválido
  • rate-limit por uid (Firestore aiUsage)     → 429 acima do cap diário
  • AnthropicVertex({ projectId, region })     → Claude (Model Garden)
  • tool_use forçado → JSON estruturado
  • prompt caching no catálogo (cache_control)
```

### Ações e modelos (tiered, custo-otimizado)

| Ação | Modelo (env) | Default | Onde aparece na app |
|---|---|---|---|
| `recommend` | `MODEL_RECOMMEND` | `claude-opus-4-8` | Botão **"Sugere-me"** na topbar |
| `planner` | `MODEL_PLANNER` | `claude-sonnet-4-6` | Notas personalizadas nas paragens do planeador |
| `summarizeReviews` | `MODEL_CHEAP` | `claude-haiku-4-5` | "Resumir avaliações" no detalhe |
| `draftReview` | `MODEL_CHEAP` | `claude-haiku-4-5` | "Ajudar a escrever" na nota pessoal |
| `nlSearch` | `MODEL_CHEAP` | `claude-haiku-4-5` | Botão ✨ na barra de pesquisa |
| `categorize` | `MODEL_CHEAP` | `claude-haiku-4-5` | "Sugerir tipo e especialidade" ao adicionar |

## Pré-requisitos no Google Cloud (uma vez)

1. **Plano Blaze** ativo no projeto `app-restaurantes-499400` (já é o caso).
2. **Ativar as APIs:** `aiplatform.googleapis.com`, `cloudfunctions.googleapis.com`,
   `cloudbuild.googleapis.com`, `artifactregistry.googleapis.com`, `run.googleapis.com`.
   ```bash
   gcloud services enable aiplatform.googleapis.com cloudfunctions.googleapis.com \
     cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com
   ```
3. **Ativar os modelos Claude no Model Garden** (Console → Vertex AI → Model Garden →
   procurar "Claude" → Opus 4.8 / Sonnet 4.6 / Haiku 4.5 → *Enable* e aceitar os
   termos da Anthropic). Confirma a **região** onde ficam disponíveis.
4. **Região:** a função usa `VERTEX_REGION` (default `us-east5`). Usa uma região onde
   os modelos estejam ativados. Se preferires `europe-west1` (onde corre a função),
   confirma a disponibilidade de cada modelo nessa região e ajusta a env.
5. **IAM da service account de runtime** (a SA que executa a função — por omissão
   `<project>@appspot.gserviceaccount.com` ou a default do Compute): dar
   **`roles/aiplatform.user`**.
   ```bash
   gcloud projects add-iam-policy-binding app-restaurantes-499400 \
     --member="serviceAccount:app-restaurantes-499400@appspot.gserviceaccount.com" \
     --role="roles/aiplatform.user"
   ```

## Variáveis de ambiente (opcionais)

Todas têm default no código; define só o que precisares de mudar:

| Env | Default | Para quê |
|---|---|---|
| `VERTEX_REGION` | `us-east5` | Região por omissão (fallback de todos os modelos) |
| `REGION_RECOMMEND` | `VERTEX_REGION` | Região onde o **Opus** está ativado |
| `REGION_PLANNER` | `VERTEX_REGION` | Região onde o **Sonnet** está ativado |
| `REGION_CHEAP` | `VERTEX_REGION` | Região onde o **Haiku** está ativado |
| `MODEL_RECOMMEND` | `claude-opus-4-8` | Override do id (ex.: id publicado no Vertex) |
| `MODEL_PLANNER` | `claude-sonnet-4-6` | idem |
| `MODEL_CHEAP` | `claude-haiku-4-5` | idem |
| `AI_DAILY_CAP` | `120` | Limite de pedidos por utilizador/dia |

> **Região por modelo:** a disponibilidade do Claude no Vertex (MaaS) varia por
> modelo e por região. Cada tier tem a sua própria região (`REGION_*`); se cada
> modelo ficou ativado numa região diferente, define as três. Se estiverem todos
> na mesma, basta `VERTEX_REGION`.

> **Nota sobre os ids:** se o Vertex rejeitar um id "first-party" (ex.:
> `claude-opus-4-8`), define a env correspondente com o id **publicado no Vertex** para
> a tua região (Model Garden mostra-o ao ativar o modelo).

Definir envs no deploy (exemplo com 3 regiões diferentes):
```bash
firebase deploy --only functions \
  --set-env-vars REGION_RECOMMEND=europe-west1,REGION_PLANNER=europe-west4,REGION_CHEAP=europe-west1,AI_DAILY_CAP=120
```
(ou um ficheiro `functions/.env` — já ignorado pelo git.)

## Deploy

```bash
# 1) dependências da função
cd functions && npm install && cd ..

# 2) deploy da função + hosting (rewrite /api/ai + cliente)
firebase deploy --only functions,hosting
```

**Caveat de permissões:** a service account `claude-deploy` pode não ter os papéis
para criar/atualizar Cloud Functions de 2.ª geração. Se o deploy falhar por IAM,
concede (ou corre o deploy com uma conta que tenha): `roles/cloudfunctions.admin`,
`roles/cloudbuild.builds.editor`, `roles/artifactregistry.admin`,
`roles/run.admin`, `roles/iam.serviceAccountUser`.

## Verificação

1. `node --check` em `functions/index.js` e nos `js/*.js` (sem erros).
2. Com sessão iniciada na app:
   - **"Sugere-me"** devolve um pick coerente com os teus ratings (+ "perto de mim"
     se deres permissão de localização).
   - Detalhe de um restaurante com avaliações Google → **"Resumir avaliações"**.
   - Nota pessoal → **"Ajudar a escrever"** preenche um rascunho.
   - Pesquisa com ✨ → "petiscos perto de Évora" filtra a lista.
   - Planeador → cada paragem ganha uma nota personalizada.
   - Adicionar restaurante → **"Sugerir tipo e especialidade"**.
3. Custo: em chamadas repetidas de `recommend`, confirmar `cache_read_input_tokens > 0`
   nos logs (catálogo cacheado ≈ 0,1× do preço).

## Segurança / custo

- A chave do modelo vive **só** no servidor (ADC da SA). O cliente nunca a vê.
- A função só usa os **teus** dados (pelo uid do token) + dados públicos já visíveis
  (ex.: reviews do Google que o cliente já trouxe).
- **Rate-limit** por uid (`AI_DAILY_CAP`/dia) em `aiUsage/{uid}` no Firestore.
- Modelos baratos (Haiku) nas ações de alto volume; Opus só no `recommend`.
