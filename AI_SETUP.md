# Foodboxd — camada de IA (Claude)

A app tem uma camada de IA servida por uma **Cloud Function** (`functions/index.js`,
função `ai`). A chave do modelo nunca chega ao browser: o cliente envia o **Firebase
ID token** e a função fala com a Claude.

## Fornecedor (selecionável)

`AI_PROVIDER` escolhe o backend (default: `anthropic` se houver `ANTHROPIC_API_KEY`,
senão `vertex`):

- **`anthropic` (em uso):** API direta da Anthropic via `@anthropic-ai/sdk`. Precisa
  de `ANTHROPIC_API_KEY` (de console.anthropic.com, com créditos). A key é dada no
  deploy via `functions/.env` (no `.gitignore` — **nunca** vai para o repo) ou Secret
  Manager. Faturado pela Anthropic. **Não depende de quota do Vertex.**
- **`vertex`:** Claude no Model Garden via `@anthropic-ai/vertex-sdk` + ADC (sem key).
  Requer modelos ativados no Model Garden, `roles/aiplatform.user` na SA de runtime e
  **quota** (projetos/billing novos são recusados até terem histórico — ver §Vertex).

`functions/.env` (exemplo, gitignored):
```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```
A API de Messages, o `tool_use` forçado e o prompt caching são iguais nos dois.

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
   termos da Anthropic). O *Enable* é **ao nível do projeto** (aceita os termos uma
   vez); **não** fixa uma região por modelo — a região/endpoint é escolhida na
   chamada (env `VERTEX_REGION`).
4. **Endpoint/região:** a função usa por omissão o **endpoint `global`** (default
   `VERTEX_REGION=global`) — recomendado pela Anthropic: encaminhamento dinâmico,
   máxima disponibilidade, **sem custo extra** e sem ter de adivinhar regiões. Para
   **residência de dados na UE** usa `eu` (multi-região UE, +10%); para uma região
   única usa ex.: `europe-west1` (+10%). Não precisas de procurar a região de cada
   modelo — o `global` cobre todos.
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
| `VERTEX_REGION` | `global` | Endpoint/região por omissão (`global` \| `eu` \| `us` \| região) |
| `REGION_RECOMMEND` | `VERTEX_REGION` | Override só para o **Opus** (se enabled noutra região) |
| `REGION_PLANNER` | `VERTEX_REGION` | Override só para o **Sonnet** |
| `REGION_CHEAP` | `VERTEX_REGION` | Override só para o **Haiku** |
| `MODEL_RECOMMEND` | `claude-opus-4-8` | Override do id (ex.: id publicado no Vertex) |
| `MODEL_PLANNER` | `claude-sonnet-4-6` | idem |
| `MODEL_CHEAP` | `claude-haiku-4-5@20251001` | idem |
| `AI_DAILY_CAP` | `120` | Limite de pedidos por utilizador/dia |

> **Endpoint global:** com o default `global`, o Vertex encaminha para qualquer
> região com capacidade — não tens de descobrir/escolher a região de cada modelo.
> Os `REGION_*` só são precisos se quiseres prender um tier a uma região específica.

> **Nota sobre os ids:** o id de Vertex do Haiku 4.5 leva sufixo de versão
> (`claude-haiku-4-5@20251001`); Opus 4.8 e Sonnet 4.6 usam o id "bare". Se o Vertex
> rejeitar um id, define o `MODEL_*` com o id publicado no Model Garden.

Definir envs no deploy (só se quiseres mudar o default `global`):
```bash
# residência de dados na UE (+10%):
firebase deploy --only functions --set-env-vars VERTEX_REGION=eu
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
