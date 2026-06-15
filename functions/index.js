// Foodboxd AI backend — a thin, secured proxy to Claude (via Vertex AI).
// The client sends its Firebase ID token + compact, already-visible data; this
// holds the model credentials (ADC service account), rate-limits per user, and
// returns structured JSON. No model key ever reaches the browser.

const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { AnthropicVertex } = require("@anthropic-ai/vertex-sdk");

admin.initializeApp();
const db = admin.firestore();

// Vertex location for the Claude models. Default to the `global` endpoint —
// Anthropic's recommendation: dynamic routing, max availability, no price premium
// (use `eu` for EU data residency, or a specific region like `europe-west1`).
// Each tier can still override its location (REGION_*), e.g. if one model is only
// enabled in a specific region. Model IDs are overridable too (MODEL_*).
const PROJECT = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "app-restaurantes-499400";
const VERTEX_REGION = process.env.VERTEX_REGION || "global";

const MODELS = {
  recommend: { id: process.env.MODEL_RECOMMEND || "claude-opus-4-8", region: process.env.REGION_RECOMMEND || VERTEX_REGION },
  planner: { id: process.env.MODEL_PLANNER || "claude-sonnet-4-6", region: process.env.REGION_PLANNER || VERTEX_REGION },
  cheap: { id: process.env.MODEL_CHEAP || "claude-haiku-4-5@20251001", region: process.env.REGION_CHEAP || VERTEX_REGION }
};

// One Vertex client per region, created on demand and reused.
const clients = {};
function clientFor(region) {
  if (!clients[region]) clients[region] = new AnthropicVertex({ projectId: PROJECT, region });
  return clients[region];
}
const DAILY_CAP = parseInt(process.env.AI_DAILY_CAP || "120", 10);

// ---- helpers ---------------------------------------------------------------

async function requireUser(req) {
  const h = req.get("Authorization") || "";
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return null;
  try {
    return await admin.auth().verifyIdToken(m[1]);
  } catch (e) {
    return null;
  }
}

// Simple per-user daily cap (best-effort).
async function checkRateLimit(uid) {
  const day = new Date().toISOString().slice(0, 10);
  const ref = db.collection("aiUsage").doc(uid);
  const snap = await ref.get();
  const d = snap.exists ? snap.data() : {};
  const count = d.day === day ? (d.count || 0) : 0;
  if (count >= DAILY_CAP) return false;
  await ref.set({ day, count: count + 1, updatedAt: new Date().toISOString() }, { merge: true });
  return true;
}

// One forced-tool call → returns the tool input as the structured result.
// `system` may be an array of content blocks (so the catalog block can be cached).
// `model` is a tier object { id, region }; we route to the client for its region.
async function structured({ model, system, user, tool, maxTokens = 1024 }) {
  const msg = await clientFor(model.region).messages.create({
    model: model.id,
    max_tokens: maxTokens,
    system,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content: user }]
  });
  const block = (msg.content || []).find((b) => b.type === "tool_use" && b.name === tool.name);
  return block ? block.input : null;
}

// A cached system: a stable instruction + the (stable-ish) catalog, with a cache
// breakpoint so repeated calls only pay ~0.1x for the catalog tokens.
function cachedSystem(instruction, catalog) {
  const blocks = [{ type: "text", text: instruction }];
  if (catalog && catalog.length) {
    blocks.push({
      type: "text",
      text: "CATÁLOGO (JSON):\n" + JSON.stringify(catalog),
      cache_control: { type: "ephemeral" }
    });
  } else {
    blocks[0].cache_control = { type: "ephemeral" };
  }
  return blocks;
}

const CATEGORIES = ["tradicional", "petiscos", "pastelaria", "fine-dining"];

// ---- actions ---------------------------------------------------------------

const ACTIONS = {
  // Personalized restaurant pick from the user's own visible catalog.
  async recommend(uid, body) {
    const catalog = Array.isArray(body.catalog) ? body.catalog.slice(0, 400) : [];
    const tool = {
      name: "sugerir",
      description: "Devolve a recomendação principal e até 3 alternativas, a partir do catálogo.",
      input_schema: {
        type: "object",
        properties: {
          restaurantId: { type: "string" },
          reason: { type: "string", description: "1–2 frases em português, pessoal e concreta." },
          alternatives: {
            type: "array",
            items: {
              type: "object",
              properties: { restaurantId: { type: "string" }, reason: { type: "string" } },
              required: ["restaurantId", "reason"]
            }
          }
        },
        required: ["restaurantId", "reason", "alternatives"]
      }
    };
    const system = cachedSystem(
      "És o concierge do Foodboxd. Recomendas restaurantes a partir do CATÁLOGO fornecido (usa só ids existentes). Tom claro e direto, em português europeu, sem emojis. Considera o gosto do utilizador (as suas avaliações, pratos e visitas) e os critérios. Justifica em 1–2 frases concretas.",
      catalog
    );
    const user = [
      { type: "text", text: "PERFIL: " + JSON.stringify(body.profile || {}) },
      { type: "text", text: "CRITÉRIOS: " + JSON.stringify(body.criteria || {}) },
      { type: "text", text: "Escolhe o melhor restaurante e 3 alternativas." }
    ];
    return structured({ model: MODELS.recommend, system, user, tool, maxTokens: 1200 });
  },

  // Personalized notes for the trip-planner stops.
  async planner(uid, body) {
    const tool = {
      name: "anotar",
      description: "Ordena as paragens e dá uma nota personalizada a cada uma.",
      input_schema: {
        type: "object",
        properties: {
          ordered: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "string" }, note: { type: "string" } },
              required: ["id", "note"]
            }
          }
        },
        required: ["ordered"]
      }
    };
    const system = cachedSystem(
      "Ajudas a planear paragens de almoço numa viagem. Ordena as paragens fornecidas pela melhor combinação de desvio e gosto do utilizador, e dá a cada uma uma nota curta (1 frase) em português europeu, sem emojis.",
      null
    );
    const user = [
      { type: "text", text: "PERFIL: " + JSON.stringify(body.profile || {}) },
      { type: "text", text: "PARAGENS: " + JSON.stringify(body.stops || []) }
    ];
    return structured({ model: MODELS.planner, system, user, tool });
  },

  // Summarize Google reviews the client already fetched.
  async summarizeReviews(uid, body) {
    const tool = {
      name: "resumir",
      description: "Resume as avaliações com prós, contras e o que pedir.",
      input_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          pros: { type: "array", items: { type: "string" } },
          cons: { type: "array", items: { type: "string" } },
          orderTips: { type: "array", items: { type: "string" } }
        },
        required: ["summary", "pros", "cons", "orderTips"]
      }
    };
    const system = [{ type: "text", text: "Resumes avaliações de restaurantes em português europeu, de forma honesta e útil, sem emojis. Sê conciso." }];
    const user = [{ type: "text", text: `Restaurante: ${body.name || ""}\nAvaliações:\n` + JSON.stringify(body.reviews || []) }];
    return structured({ model: MODELS.cheap, system, user, tool });
  },

  // Draft a personal review from bullets + stars + dishes.
  async draftReview(uid, body) {
    const tool = {
      name: "redigir",
      description: "Escreve um rascunho de crítica pessoal.",
      input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }
    };
    const system = [{ type: "text", text: "Escreves rascunhos de crítica de restaurante na primeira pessoa, em português europeu, naturais e concretos, 2–4 frases, sem emojis e sem exageros." }];
    const user = [{ type: "text", text: `Restaurante: ${body.name || ""}\nEstrelas: ${body.stars || ""}\nPratos: ${(body.dishes || []).join(", ")}\nNotas: ${body.bullets || ""}` }];
    return structured({ model: MODELS.cheap, system, user, tool, maxTokens: 600 });
  },

  // Turn a natural-language query into a client-side filter spec.
  async nlSearch(uid, body) {
    const tool = {
      name: "filtrar",
      description: "Converte a pesquisa em filtros estruturados.",
      input_schema: {
        type: "object",
        properties: {
          categories: { type: "array", items: { type: "string", enum: CATEGORIES } },
          regions: { type: "array", items: { type: "string" } },
          price: { type: "array", items: { type: "integer", enum: [1, 2, 3, 4] } },
          openNow: { type: "boolean" },
          text: { type: "string", description: "Termo de pesquisa livre (nome/prato/localidade)." },
          dishTags: { type: "array", items: { type: "string" } }
        },
        required: ["text"]
      }
    };
    const system = [{ type: "text", text: `Converte pesquisas em linguagem natural em filtros. Categorias válidas: ${CATEGORIES.join(", ")}. Regiões disponíveis: ${JSON.stringify(body.regions || [])}. Devolve só o que a pesquisa pedir; deixa vazio o resto.` }];
    const user = [{ type: "text", text: "Pesquisa: " + (body.query || "") }];
    return structured({ model: MODELS.cheap, system, user, tool, maxTokens: 400 });
  },

  // Suggest category + a short "specialty" note when adding a restaurant.
  async categorize(uid, body) {
    const tool = {
      name: "categorizar",
      description: "Sugere a categoria e uma especialidade curta.",
      input_schema: {
        type: "object",
        properties: {
          category: { type: "string", enum: CATEGORIES },
          specialty: { type: "string", description: "Especialidade/prato a provar, 2–5 palavras, em português." }
        },
        required: ["category", "specialty"]
      }
    };
    const system = [{ type: "text", text: `Classificas restaurantes numa de: ${CATEGORIES.join(", ")}, e sugeres uma especialidade curta. Português europeu, sem emojis.` }];
    const user = [{ type: "text", text: `Nome: ${body.name || ""}\nLocalidade: ${body.town || ""}\nTipos Google: ${(body.googleTypes || []).join(", ")}\nPreço: ${body.priceLevel || ""}` }];
    return structured({ model: MODELS.cheap, system, user, tool, maxTokens: 200 });
  }
};

// ---- HTTP entrypoint -------------------------------------------------------

// Run as a service account that holds roles/aiplatform.user (the Vertex caller).
// Gen2 functions otherwise default to the Compute Engine SA, which may not have
// it. Override with RUNTIME_SA if your project uses a different account.
const RUNTIME_SA = process.env.RUNTIME_SA || `${PROJECT}@appspot.gserviceaccount.com`;

exports.ai = onRequest(
  { region: "europe-west1", cors: true, maxInstances: 10, timeoutSeconds: 60, serviceAccount: RUNTIME_SA },
  async (req, res) => {
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).json({ error: "method" });

    const user = await requireUser(req);
    if (!user) return res.status(401).json({ error: "auth" });

    const body = req.body || {};
    const action = body.action;
    if (!ACTIONS[action]) return res.status(400).json({ error: "action" });

    try {
      const ok = await checkRateLimit(user.uid);
      if (!ok) return res.status(429).json({ error: "limite diário atingido" });
      const result = await ACTIONS[action](user.uid, body);
      if (!result) return res.status(502).json({ error: "sem resposta" });
      return res.json({ result });
    } catch (e) {
      console.error("ai error", action, e && e.message);
      return res.status(500).json({ error: "falha ao gerar" });
    }
  }
);
