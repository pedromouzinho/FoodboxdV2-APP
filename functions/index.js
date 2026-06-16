// Foodboxd AI backend — a thin, secured proxy to Claude (via Vertex AI).
// The client sends its Firebase ID token + compact, already-visible data; this
// holds the model credentials (ADC service account), rate-limits per user, and
// returns structured JSON. No model key ever reaches the browser.

const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Provider: "anthropic" (direct API key) or "vertex" (Claude in Model Garden).
// Defaults to anthropic when an API key is present, else vertex.
const PROJECT = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "app-restaurantes-499400";
const VERTEX_REGION = process.env.VERTEX_REGION || "global";
function provider() {
  return process.env.AI_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "vertex");
}

// Model ids (Anthropic API form). For Vertex, Haiku needs the `@`-dated id —
// override MODEL_CHEAP=claude-haiku-4-5@20251001 when AI_PROVIDER=vertex.
const MODELS = {
  recommend: process.env.MODEL_RECOMMEND || "claude-opus-4-8",
  planner: process.env.MODEL_PLANNER || "claude-sonnet-4-6",
  cheap: process.env.MODEL_CHEAP || "claude-haiku-4-5"
};

// One lazily-built client (reads the key/region at first use, so Secret Manager
// / env values are available).
let _client = null;
function client() {
  if (_client) return _client;
  if (provider() === "anthropic") {
    const mod = require("@anthropic-ai/sdk");
    const Anthropic = mod.Anthropic || mod.default || mod;
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  } else {
    const { AnthropicVertex } = require("@anthropic-ai/vertex-sdk");
    _client = new AnthropicVertex({ projectId: PROJECT, region: VERTEX_REGION });
  }
  return _client;
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

// Simple per-user daily cap (best-effort). Fails OPEN: if Firestore is
// unreachable (e.g. the runtime SA lacks datastore access), we skip the cap
// rather than block the request.
async function checkRateLimit(uid) {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const ref = db.collection("aiUsage").doc(uid);
    const snap = await ref.get();
    const d = snap.exists ? snap.data() : {};
    const count = d.day === day ? (d.count || 0) : 0;
    if (count >= DAILY_CAP) return false;
    await ref.set({ day, count: count + 1, updatedAt: new Date().toISOString() }, { merge: true });
    return true;
  } catch (e) {
    console.error("rate-limit skipped:", e && e.message);
    return true;
  }
}

// One forced-tool call → returns the tool input as the structured result.
// `system` may be an array of content blocks (so the catalog block can be cached).
// `model` is the model id string (provider-agnostic).
async function structured({ model, system, user, tool, maxTokens = 1024 }) {
  const msg = await client().messages.create({
    model,
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
      "És o concierge do Foodboxd. Recomendas restaurantes a partir do CATÁLOGO fornecido (usa só ids existentes). Tom claro e direto, em português europeu, sem emojis. Considera o gosto do utilizador (as suas avaliações, pratos e visitas), o PERFIL DE GOSTO (se vier) e os critérios. Justifica em 1–2 frases concretas, ligando à preferência dele.",
      catalog
    );
    const user = [
      { type: "text", text: "PERFIL: " + JSON.stringify(body.profile || {}) },
      { type: "text", text: "PERFIL DE GOSTO (resumo): " + JSON.stringify(body.taste || {}) },
      { type: "text", text: "CRITÉRIOS: " + JSON.stringify(body.criteria || {}) },
      { type: "text", text: "Escolhe o melhor restaurante e 3 alternativas." }
    ];
    return structured({ model: MODELS.recommend, system, user, tool, maxTokens: 1200 });
  },

  // Free-text "chatbot" suggestion: the user types what/where they feel like; uses
  // taste + their list + proximity. May also return filters to apply to the list.
  async smartSuggest(uid, body) {
    const catalog = Array.isArray(body.catalog) ? body.catalog.slice(0, 400) : [];
    const tool = {
      name: "sugerir",
      description: "Responde ao pedido com uma recomendação do catálogo (+ alternativas) e, se fizer sentido, filtros para a lista.",
      input_schema: {
        type: "object",
        properties: {
          reply: { type: "string", description: "1–2 frases, resposta direta ao pedido, português europeu, sem emojis." },
          restaurantId: { type: "string" },
          reason: { type: "string", description: "1–2 frases, pessoal e concreta." },
          alternatives: {
            type: "array",
            items: {
              type: "object",
              properties: { restaurantId: { type: "string" }, reason: { type: "string" } },
              required: ["restaurantId", "reason"]
            }
          },
          filters: {
            type: "object",
            description: "Opcional: filtros a aplicar à lista do utilizador quando o pedido é sobretudo de pesquisa/filtragem.",
            properties: {
              categories: { type: "array", items: { type: "string", enum: CATEGORIES } },
              regions: { type: "array", items: { type: "string" } },
              price: { type: "array", items: { type: "integer", enum: [1, 2, 3, 4] } },
              text: { type: "string" }
            }
          }
        },
        required: ["reply", "restaurantId", "reason", "alternatives"]
      }
    };
    const system = cachedSystem(
      "És o concierge do Foodboxd. O utilizador escreve em linguagem natural o que lhe apetece (tipo de comida, ocasião, companhia, distância…). Recomenda a partir do CATÁLOGO (usa só ids existentes), considerando o pedido, o PERFIL DE GOSTO, as avaliações/visitas e a PROXIMIDADE (campo distKm quando existir — prioriza perto). Responde curto e concreto em português europeu, sem emojis. Se o pedido for sobretudo filtrar a lista, preenche também `filters`.",
      catalog
    );
    const user = [
      { type: "text", text: "PEDIDO: " + (body.query || "(sem texto — sugere algo bom para agora, perto)") },
      { type: "text", text: "PERFIL DE GOSTO: " + JSON.stringify(body.taste || {}) },
      { type: "text", text: "PERFIL (agregado): " + JSON.stringify(body.profile || {}) },
      { type: "text", text: "PROXIMIDADE: " + (body.near ? "tem localização — usa distKm e prioriza perto" : "sem localização") }
    ];
    return structured({ model: MODELS.recommend, system, user, tool, maxTokens: 1200 });
  },

  // Build a "taste profile" from the user's records + Google Maps searches to
  // discover new places that match it.
  async tasteProfile(uid, body) {
    const catalog = Array.isArray(body.catalog) ? body.catalog.slice(0, 400) : [];
    const tool = {
      name: "perfilar",
      description: "Resume o gosto do utilizador e propõe pesquisas para o Google Maps.",
      input_schema: {
        type: "object",
        properties: {
          summary: { type: "string", description: "2–4 frases, na 2.ª pessoa (tu), português europeu, concretas, sem emojis." },
          cuisines: { type: "array", items: { type: "string" }, description: "Cozinhas/estilos preferidos." },
          dishes: { type: "array", items: { type: "string" }, description: "Pratos favoritos." },
          price: { type: "string", description: "Faixa de preço habitual, em texto curto." },
          vibe: { type: "string", description: "Ambiente preferido (ex.: tascas tradicionais, petiscos animados)." },
          mapsQueries: {
            type: "array",
            description: "2 a 4 pesquisas COMPETENTES para o Google Maps, à medida do gosto e da zona indicada. Inclui sempre localidade/região na query para dar bons resultados.",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "Rótulo curto para o botão (3–5 palavras)." },
                query: { type: "string", description: "Texto de pesquisa para o Google Maps." }
              },
              required: ["label", "query"]
            }
          }
        },
        required: ["summary", "cuisines", "dishes", "vibe", "mapsQueries"]
      }
    };
    const system = cachedSystem(
      "És um analista de gosto gastronómico do Foodboxd. A partir do CATÁLOGO (os restaurantes do utilizador, com as estrelas, pratos e visitas dele), descreve o gosto de forma concreta e útil, em português europeu, sem emojis. A seguir propõe pesquisas para o Google Maps que o ajudem a descobrir sítios NOVOS alinhados com esse gosto, perto da ZONA indicada — usa nomes de localidade/região nas queries para serem competentes (ex.: 'tasca tradicional alentejana migas perto de Évora').",
      catalog
    );
    const user = [
      { type: "text", text: "AGREGADO: " + JSON.stringify(body.profile || {}) },
      { type: "text", text: "ZONA: " + JSON.stringify(body.near || {}) },
      { type: "text", text: "Faz o perfil de gosto e as pesquisas para o Maps." }
    ];
    return structured({ model: MODELS.planner, system, user, tool, maxTokens: 900 });
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
      // Log the full Vertex/Anthropic error so failures are diagnosable.
      console.error("ai error", action,
        "status=", e && e.status,
        "msg=", e && e.message,
        "model=", (MODELS[action === "recommend" ? "recommend" : action === "planner" ? "planner" : "cheap"] || {}),
        "detail=", (() => { try { return JSON.stringify(e && (e.error || e.response || e)).slice(0, 800); } catch (_) { return "?"; } })()
      );
      return res.status(500).json({ error: "falha ao gerar" });
    }
  }
);
