// Shared cloud data, backed by Firebase Firestore (REST API, no SDK).
//   restaurants/  — community-added places (shown for everyone)
//   overrides/    — per-restaurant edits, e.g. category, shared for everyone
//   userData/     — one doc per signed-in person: their visited/priority/
//                   ratings/notes/history (personal, but visible to the group)
//   comments/     — shared comments per restaurant
//
// If FIREBASE_PROJECT_ID / FIREBASE_API_KEY are blank, every method is a safe
// no-op and the app falls back to per-browser localStorage.
//
// Authenticated calls (userData writes, comments) accept a Firebase ID token
// and send it as a Bearer header so Firestore rules see request.auth.uid.

const DB = (() => {
  let docsBase = "";
  let apiKey = "";
  let ready = false;

  function init() {
    if (!CONFIG.FIREBASE_PROJECT_ID || !CONFIG.FIREBASE_API_KEY) return;
    apiKey = CONFIG.FIREBASE_API_KEY;
    // Em localhost fala com o emulador; em qualquer outro sítio (produção ou
    // canal de QA) fala com a Firestore real.
    const host = CONFIG.EMULATORS
      ? `http://127.0.0.1:${CONFIG.EMU.firestore}`
      : "https://firestore.googleapis.com";
    docsBase = `${host}/v1/projects/${CONFIG.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
    ready = true;
  }

  function isAvailable() {
    return ready;
  }

  function keyQ() {
    return `key=${encodeURIComponent(apiKey)}`;
  }

  function authHeaders(token) {
    const h = { "Content-Type": "application/json" };
    if (token) h.Authorization = "Bearer " + token;
    return h;
  }

  // ---- Firestore typed-value encoding/decoding ----
  function encodeValue(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === "number") {
      return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    }
    if (typeof value === "boolean") return { booleanValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
    if (typeof value === "object") return { mapValue: { fields: encodeFields(value) } };
    return { stringValue: String(value) };
  }
  function encodeFields(obj) {
    const f = {};
    Object.entries(obj || {}).forEach(([k, v]) => (f[k] = encodeValue(v)));
    return f;
  }
  function decodeValue(v) {
    if (v.stringValue !== undefined) return v.stringValue;
    if (v.doubleValue !== undefined) return Number(v.doubleValue);
    if (v.integerValue !== undefined) return Number(v.integerValue);
    if (v.booleanValue !== undefined) return v.booleanValue;
    if (v.timestampValue !== undefined) return v.timestampValue;
    if (v.nullValue !== undefined) return null;
    if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(decodeValue);
    if (v.mapValue !== undefined) return decodeFields(v.mapValue);
    return null;
  }
  function decodeFields(doc) {
    const out = {};
    Object.entries((doc && doc.fields) || {}).forEach(([k, v]) => (out[k] = decodeValue(v)));
    return out;
  }

  function docToRestaurant(doc) {
    const f = decodeFields(doc);
    const geo = typeof Geocode !== "undefined" ? Geocode : null;
    const inferredRegion = geo ? geo.regionForTown(f.town) : null;
    // Canonicalize at read time: old clients stored raw districts ("Distrito de
    // Évora") and locale-dependent country names ("Spain"), which duplicated the
    // region filters. This cleans bad data without a migration.
    const region = geo && geo.canonicalRegion ? geo.canonicalRegion(f.region) : f.region;
    const country = geo && geo.canonicalCountry ? geo.canonicalCountry(f.country) : f.country;
    return {
      id: doc.name.split("/").pop(),
      name: f.name,
      town: f.town,
      region: region || inferredRegion || "Portugal",
      country: country || "Portugal",
      category: f.category || "tradicional",
      cuisine: f.cuisine || "",
      styles: Array.isArray(f.styles) ? f.styles : [],
      lat: f.lat,
      lng: f.lng,
      notes: f.notes || "",
      tags: f.tags || [f.category || "tradicional"],
      mapsQuery: f.mapsQuery || `${f.name}, ${f.town}, ${f.country || "Portugal"}`,
      createdAt: f.createdAt || "",
      addedByUid: f.addedByUid || "",
      addedByName: f.addedByName || "",
      verified: f.verified === true,
      source: "community"
    };
  }

  // Lê uma coleção INTEIRA, página a página. Existia um teto silencioso de
  // uma página: pedia-se pageSize=300 e nunca a segunda — o 301.º restaurante
  // desaparecia do mapa de toda a gente sem erro nenhum. E medido no
  // emulador ficou pior: o SERVIDOR manda no tamanho real da página (mandou
  // 150 com 300 pedidos), portanto sem o laço do nextPageToken o teto nem
  // sequer era os 300 assumidos. O limite de voltas é um para-quedas contra
  // um servidor que nunca esgote — 40 páginas ≥ 6000 docs, muito além do que
  // esta app verá antes de outra arquitetura.
  async function fetchTodasAsPaginas(colecao, headers) {
    const docs = [];
    let pageToken = "";
    for (let volta = 0; volta < 40; volta++) {
      const q = `${keyQ()}&pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
      const res = await fetch(`${docsBase}/${colecao}?${q}`, headers ? { headers } : undefined);
      if (!res.ok) break;
      const data = await res.json();
      docs.push(...(data.documents || []));
      pageToken = data.nextPageToken || "";
      if (!pageToken) break;
    }
    return docs;
  }

  // ---- Restaurants ----
  async function fetchAll() {
    if (!ready) return [];
    try {
      return (await fetchTodasAsPaginas("restaurants"))
        .map(docToRestaurant)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    } catch (e) {
      return [];
    }
  }

  // token is optional: when present (signed in) we stamp who added the place.
  async function add(restaurant, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const fields = {
      name: encodeValue(restaurant.name),
      town: encodeValue(restaurant.town),
      region: encodeValue(restaurant.region),
      country: encodeValue(restaurant.country || "Portugal"),
      category: encodeValue(restaurant.category),
      cuisine: encodeValue(restaurant.cuisine || ""),
      styles: encodeValue(restaurant.styles || []),
      lat: encodeValue(restaurant.lat),
      lng: encodeValue(restaurant.lng),
      notes: encodeValue(restaurant.notes || ""),
      tags: encodeValue(restaurant.tags || [restaurant.category]),
      mapsQuery: encodeValue(restaurant.mapsQuery),
      verified: encodeValue(!!restaurant.verified),
      createdAt: { timestampValue: new Date().toISOString() }
    };
    if (restaurant.addedByUid) fields.addedByUid = encodeValue(restaurant.addedByUid);
    if (restaurant.addedByName) fields.addedByName = encodeValue(restaurant.addedByName);
    const res = await fetch(`${docsBase}/restaurants?${keyQ()}`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Could not save (${res.status}).`);
    return docToRestaurant(await res.json());
  }

  // Delete a community restaurant (Firestore rules only allow its author).
  async function deleteRestaurant(id, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const res = await fetch(`${docsBase}/restaurants/${encodeURIComponent(id)}?${keyQ()}`, {
      method: "DELETE",
      headers: authHeaders(token)
    });
    if (!res.ok) throw new Error(`Could not delete (${res.status}).`);
    return true;
  }

  // ---- Overrides (shared edits, e.g. category) ----
  async function fetchOverrides() {
    if (!ready) return {};
    try {
      const documents = await fetchTodasAsPaginas("overrides");
      const map = {};
      documents.forEach((doc) => {
        const id = doc.name.split("/").pop();
        const f = decodeFields(doc);
        const o = {};
        if (f.category) o.category = f.category;
        if (f.cuisine) o.cuisine = f.cuisine;
        if (Array.isArray(f.styles)) o.styles = f.styles;
        if (f.photoURL) o.photoURL = f.photoURL;
        if (typeof f.lat === "number" && typeof f.lng === "number") { o.lat = f.lat; o.lng = f.lng; }
        if (Object.keys(o).length) map[id] = o;
      });
      return map;
    } catch (e) {
      return {};
    }
  }

  // Upsert one field of a restaurant's shared override (category or photoURL),
  // leaving the other field intact (updateMask targets just this field).
  //
  // Levam token desde 25/08: as regras passaram a exigir sessão para escrever
  // aqui. Antes era `if true` — qualquer pessoa na internet, sem conta, podia
  // mover o pino de um restaurante ou trocar-lhe a capa. O anonimato não era
  // usado por nenhum caminho da app (todos os botões que escrevem overrides
  // estão atrás de sessão); só a regra é que não o dizia.
  async function patchOverride(id, field, value, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const fields = {};
    fields[field] = encodeValue(value);
    fields.updatedAt = { timestampValue: new Date().toISOString() };
    const mask = `updateMask.fieldPaths=${field}&updateMask.fieldPaths=updatedAt`;
    const res = await fetch(`${docsBase}/overrides/${encodeURIComponent(id)}?${mask}&${keyQ()}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Could not save (${res.status}).`);
    return true;
  }
  function setOverride(id, category, token) { return patchOverride(id, "category", category, token); }
  // Correct a pin. The restaurants collection is read-only in the rules, so shared
  // fixes live in overrides — same as category and the cover photo.
  async function setGeoOverride(id, lat, lng, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const fields = { lat: encodeValue(lat), lng: encodeValue(lng), updatedAt: { timestampValue: new Date().toISOString() } };
    const mask = "updateMask.fieldPaths=lat&updateMask.fieldPaths=lng&updateMask.fieldPaths=updatedAt";
    const res = await fetch(`${docsBase}/overrides/${encodeURIComponent(id)}?${mask}&${keyQ()}`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Could not save (${res.status}).`);
    return true;
  }
  function setPhotoOverride(id, url, token) { return patchOverride(id, "photoURL", url, token); }
  // Cuisine + styles travel together (the restaurants collection is read-only).
  async function setAxesOverride(id, cuisine, styles, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const fields = {
      cuisine: encodeValue(cuisine || ""),
      styles: encodeValue(styles || []),
      updatedAt: { timestampValue: new Date().toISOString() }
    };
    const mask = "updateMask.fieldPaths=cuisine&updateMask.fieldPaths=styles&updateMask.fieldPaths=updatedAt";
    const res = await fetch(`${docsBase}/overrides/${encodeURIComponent(id)}?${mask}&${keyQ()}`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Could not save (${res.status}).`);
    return true;
  }

  // ---- Per-user data (userData/{uid}) ----
  // Stored shape: { displayName, photoURL, visited:[id], priority:[id],
  //   ratings:{ id:{stars,note,updatedAt} }, history:{ id:[ISO date] } }

  // Load one person's doc. Returns the decoded object, or null if it doesn't
  // exist yet (HTTP 404). Needs a token (rules require auth to read).
  async function fetchUserDoc(uid, token) {
    if (!ready) return null;
    const res = await fetch(`${docsBase}/userData/${encodeURIComponent(uid)}?${keyQ()}`, {
      headers: authHeaders(token)
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Could not load profile (${res.status}).`);
    return decodeFields(await res.json());
  }

  // Overwrite my own doc (rules allow only request.auth.uid == uid).
  async function saveUserDoc(uid, data, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const fields = encodeFields({
      displayName: data.displayName || "",
      photoURL: data.photoURL || "",
      visited: data.visited || [],
      priority: data.priority || [],
      priorityAt: data.priorityAt || {},
      ratings: data.ratings || {},
      history: data.history || {},
      onboarded: data.onboarded === true,
      homeTown: data.homeTown || null,
      activeGroup: data.activeGroup || "",
      tasteProfile: data.tasteProfile || null,
      tasteGenDay: data.tasteGenDay || "",
      tasteNote: data.tasteNote || "",
      audienceGlobal: data.audienceGlobal !== false, // default: shared globally
      visibleTo: Array.isArray(data.visibleTo) ? data.visibleTo : [],
      shareGroups: Array.isArray(data.shareGroups) ? data.shareGroups : [],
      // ⚠️ Este PATCH vai SEM updateMask: substitui o documento inteiro.
      // Um campo que o persistNow mande e esta lista não codifique não "fica
      // como estava" — é APAGADO da nuvem. Foi assim que a lista de
      // bloqueados (diretriz 1.2) se perdia a cada gravação: cinco campos
      // entravam pelo persistNow e morriam aqui. O test:persistencia guarda
      // este contrato; quem acrescentar um campo lá, acrescenta-o aqui e à
      // lista do arnês.
      blocked: Array.isArray(data.blocked) ? data.blocked : [],
      blockedNames: data.blockedNames && typeof data.blockedNames === "object" ? data.blockedNames : {},
      followPrefs: data.followPrefs && typeof data.followPrefs === "object" ? data.followPrefs : {},
      pushEnabled: data.pushEnabled !== false,
      destaques: Array.isArray(data.destaques) ? data.destaques : [],
      favoritos: Array.isArray(data.favoritos) ? data.favoritos : [],
      visibilidade: data.visibilidade || "seguidores",
      updatedAt: new Date().toISOString()
    });
    const res = await fetch(`${docsBase}/userData/${encodeURIComponent(uid)}?${keyQ()}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Could not save profile (${res.status}).`);
    return true;
  }

  // Everyone's docs (for the group view). Needs a token (rules require auth).
  function decodeUserDoc(doc) {
    const f = decodeFields(doc);
    return {
      uid: doc.name.split("/").pop(),
      displayName: f.displayName || "",
      photoURL: f.photoURL || "",
      visited: f.visited || [],
      priority: f.priority || [],
      priorityAt: f.priorityAt || {},
      ratings: f.ratings || {},
      history: f.history || {}
    };
  }
  async function runUserQuery(body, token) {
    try {
      const res = await fetch(`${docsBase}:runQuery?${keyQ()}`, {
        method: "POST", headers: authHeaders(token), body: JSON.stringify(body)
      });
      if (!res.ok) return [];
      const rows = await res.json();
      return (rows || []).filter((r) => r.document).map((r) => decodeUserDoc(r.document));
    } catch (e) { return []; }
  }
  // Everyone whose activity I'm allowed to see. Security rules require the query
  // to be constrained to the rule, so we run two: globally-shared docs, and docs
  // that list me in visibleTo. Plus my own doc. Merge + dedup by uid.
  async function fetchAllUsers(token, myUid) {
    if (!ready) return [];
    const globalQ = {
      structuredQuery: {
        from: [{ collectionId: "userData" }],
        where: { fieldFilter: { field: { fieldPath: "audienceGlobal" }, op: "EQUAL", value: { booleanValue: true } } },
        limit: 300
      }
    };
    const sharedQ = myUid ? {
      structuredQuery: {
        from: [{ collectionId: "userData" }],
        where: { fieldFilter: { field: { fieldPath: "visibleTo" }, op: "ARRAY_CONTAINS", value: { stringValue: myUid } } },
        limit: 300
      }
    } : null;
    const parts = await Promise.all([
      runUserQuery(globalQ, token),
      sharedQ ? runUserQuery(sharedQ, token) : Promise.resolve([]),
      myUid ? fetchUserDoc(myUid, token).then((f) => (f ? [{
        uid: myUid, displayName: f.displayName || "", photoURL: f.photoURL || "",
        visited: f.visited || [], priority: f.priority || [], priorityAt: f.priorityAt || {}, ratings: f.ratings || {}, history: f.history || {}
      }] : [])).catch(() => []) : Promise.resolve([])
    ]);
    const byUid = new Map();
    parts.flat().forEach((u) => { if (u && u.uid) byUid.set(u.uid, u); });
    return [...byUid.values()];
  }

  // ---- Follows + public profiles ----
  // Reading someone's activity is gated on a follow edge, and rules can't run
  // exists() inside a query — so people you follow are read one doc at a time.
  function followId(followerUid, targetUid) { return `${followerUid}_${targetUid}`; }

  async function followUser(followerUid, targetUid, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const fields = encodeFields({ followerUid, targetUid, createdAt: new Date().toISOString() });
    const res = await fetch(`${docsBase}/follows/${encodeURIComponent(followId(followerUid, targetUid))}?${keyQ()}`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Could not follow (${res.status}).`);
    return true;
  }
  async function unfollowUser(followerUid, targetUid, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const res = await fetch(`${docsBase}/follows/${encodeURIComponent(followId(followerUid, targetUid))}?${keyQ()}`, {
      method: "DELETE", headers: authHeaders(token)
    });
    if (!res.ok && res.status !== 404) throw new Error(`Could not unfollow (${res.status}).`);
    return true;
  }
  async function queryFollows(field, uid, token) {
    if (!ready || !uid) return [];
    try {
      const body = { structuredQuery: {
        from: [{ collectionId: "follows" }],
        where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: uid } } },
        limit: 500
      } };
      const res = await fetch(`${docsBase}:runQuery?${keyQ()}`, {
        method: "POST", headers: authHeaders(token), body: JSON.stringify(body)
      });
      if (!res.ok) return [];
      const rows = await res.json();
      return (rows || []).filter((r) => r.document).map((r) => decodeFields(r.document));
    } catch (e) { return []; }
  }
  const fetchFollowing = (uid, token) => queryFollows("followerUid", uid, token).then((l) => l.map((f) => f.targetUid).filter(Boolean));
  const fetchFollowers = (uid, token) => queryFollows("targetUid", uid, token).then((l) => l.map((f) => f.followerUid).filter(Boolean));

  // One `get` per person — allowed by the rules, and cheap for a follow list.
  // Só os campos que a vista social usa. Os mesmos que o `decodeUserDoc`
  // escolhe — a diferença é que a máscara faz o **servidor** não os mandar, em
  // vez de o cliente os deitar fora depois de os receber.
  //
  // O documento de uma pessoa tem mais coisas lá dentro: o `tasteNote`, que é
  // texto que ela escreveu sobre si, o `blocked`, e as definições de partilha.
  // Nada disso aparecia na interface, porque o decode já filtrava — mas
  // atravessava a rede e chegava ao dispositivo de quem a segue. Não devia lá
  // ir, e agora não vai.
  const CAMPOS_DA_VISTA_SOCIAL = ["displayName", "photoURL", "visited", "priority", "priorityAt", "ratings", "history"];
  const mascaraSocial = CAMPOS_DA_VISTA_SOCIAL.map((c) => `mask.fieldPaths=${c}`).join("&");

  async function fetchUsersByIds(uids, token) {
    if (!ready || !uids || !uids.length) return [];
    const out = await Promise.all(uids.map(async (uid) => {
      try {
        const res = await fetch(`${docsBase}/userData/${encodeURIComponent(uid)}?${keyQ()}&${mascaraSocial}`, { headers: authHeaders(token) });
        if (!res.ok) return null; // not followed / no doc yet
        return decodeUserDoc(await res.json());
      } catch (e) { return null; }
    }));
    return out.filter(Boolean);
  }

  // Denúncias de conteúdo. Exigidas pela diretriz 1.2 da App Store, que obriga
  // qualquer app com conteúdo de utilizadores a ter forma de denunciar o que é
  // ofensivo — e a App Review testa-o à mão, a abrir uma crítica de outra
  // pessoa e a procurar o botão.
  //
  // Escreve-se e nunca mais se lê do cliente: as regras deixam criar e mais
  // nada. Quem trata delas vê-as na consola do Firestore. Não é elegante, mas é
  // o que oito pessoas precisam, e uma interface de gestão que ninguém abre é
  // pior do que uma coleção que se consulta quando é preciso.
  async function addReport(report, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const fields = encodeFields({
      tipo: report.tipo,               // "comentario" | "foto"
      alvoId: report.alvoId || "",     // id do documento denunciado
      alvoUid: report.alvoUid || "",   // de quem é o conteúdo
      restaurantId: report.restaurantId || "",
      motivo: report.motivo || "",
      denuncianteUid: report.denuncianteUid
    });
    fields.createdAt = { timestampValue: new Date().toISOString() };
    const res = await fetch(`${docsBase}/reports?${keyQ()}`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Could not send report (${res.status}).`);
    return true;
  }

  // O token de push deste dispositivo, no MEU doc de tokens (F3). Merge com
  // os que lá estiverem: uma pessoa tem vários dispositivos, e cada um só
  // sabe do seu.
  async function savePushToken(uid, token, platform, authToken) {
    if (!ready || !uid || !token) return false;
    try {
      const res = await fetch(`${docsBase}/pushTokens/${encodeURIComponent(uid)}?${keyQ()}`, {
        headers: authHeaders(authToken)
      });
      const atuais = res.ok ? (decodeFields(await res.json()).tokens || []) : [];
      const outros = atuais.filter((t) => t && t.token !== token);
      const fields = encodeFields({
        tokens: [...outros, { token, platform: platform || "ios", updatedAt: new Date().toISOString() }],
        updatedAt: new Date().toISOString()
      });
      const w = await fetch(`${docsBase}/pushTokens/${encodeURIComponent(uid)}?${keyQ()}`, {
        method: "PATCH", headers: authHeaders(authToken), body: JSON.stringify({ fields })
      });
      return w.ok;
    } catch (e) { return false; }
  }

  // Um evento de atividade (F3): o facto que a função de envio transforma em
  // notificação para quem me segue. Melhor-esforço — falhar isto nunca pode
  // travar o registo que o originou.
  async function addActivity(evento, token) {
    if (!ready) return false;
    try {
      const fields = encodeFields({
        uid: evento.uid,
        tipo: evento.tipo, // "visita" | "avaliacao" | "foto"
        restaurantId: evento.restaurantId,
        restaurantName: evento.restaurantName || "",
        visitId: evento.visitId || "",
        stars: evento.stars || 0,
        createdAt: new Date().toISOString()
      });
      const res = await fetch(`${docsBase}/activity?${keyQ()}`, {
        method: "POST", headers: authHeaders(token), body: JSON.stringify({ fields })
      });
      return res.ok;
    } catch (e) { return false; }
  }

  // A cache PARTILHADA dos detalhes da Google (js/places.js). O primeiro
  // dispositivo que busca um sítio paga a chamada; todos os outros leem daqui
  // durante 30 dias — sem isto o custo do Places crescia com o número de
  // DISPOSITIVOS, e foi a fatura de agosto de 2026 (€108 acima do crédito
  // com 8 pessoas). A janela de 30 dias é verificada na LEITURA: um doc
  // velho conta como ausente e o próximo abridor de ficha renova-o.
  const CACHE_PARTILHADA_DIAS = 30;
  async function fetchPlaceCache(id) {
    if (!ready || !id) return null;
    try {
      const res = await fetch(`${docsBase}/placesCache/${encodeURIComponent(id)}?${keyQ()}`);
      if (!res.ok) return null;
      const f = decodeFields(await res.json());
      if (!f.quando || !f.dados) return null;
      const idade = Date.now() - new Date(f.quando).getTime();
      if (!(idade >= 0) || idade > CACHE_PARTILHADA_DIAS * 24 * 60 * 60 * 1000) return null;
      return f.dados;
    } catch (e) { return null; }
  }
  async function savePlaceCache(id, dados, token) {
    if (!ready || !id || !dados) return false;
    try {
      const fields = encodeFields({ dados, quando: new Date().toISOString() });
      const res = await fetch(`${docsBase}/placesCache/${encodeURIComponent(id)}?${keyQ()}`, {
        method: "PATCH", headers: authHeaders(token), body: JSON.stringify({ fields })
      });
      return res.ok;
    } catch (e) { return false; }
  }

  // Erros do cliente (js/erros.js). Write-only como os reports: grava-se e
  // lê-se na consola. A regra valida o uid e o tamanho da mensagem.
  async function addErro(erro, token) {
    if (!ready) return false;
    const fields = encodeFields({
      uid: erro.uid,
      msg: String(erro.msg || "").slice(0, 500),
      stack: String(erro.stack || "").slice(0, 1500),
      onde: erro.onde || "",
      ua: erro.ua || ""
    });
    fields.quando = { timestampValue: new Date().toISOString() };
    const res = await fetch(`${docsBase}/errosClient?${keyQ()}`, {
      method: "POST", headers: authHeaders(token), body: JSON.stringify({ fields })
    });
    return res.ok;
  }

  function decodeProfile(doc) {
    const f = decodeFields(doc);
    return { uid: doc.name.split("/").pop(), displayName: f.displayName || "", photoURL: f.photoURL || "" };
  }
  // O `profiles/{uid}` é a cara pública de uma pessoa: é o único documento que
  // qualquer utilizador com sessão pode ler (`firestore.rules`), e só o dono
  // escreve. O `userData` continua fechado.
  //
  // ⚠️ A MÁSCARA NÃO É OPCIONAL. Um PATCH ao Firestore SEM `updateMask` não
  // faz merge: substitui o documento pelos campos enviados e APAGA os que não
  // forem. Como o `upsertProfile` corre a cada entrada, sem máscara apagaria os
  // destaques, os favoritos e a visibilidade de cada vez que alguém entrasse —
  // em silêncio, e sem forma de os recuperar.
  const mascara = (campos) => campos.map((c) => `updateMask.fieldPaths=${c}`).join("&");

  async function upsertProfile(uid, profile, token) {
    if (!ready) return false;
    const fields = encodeFields({
      displayName: profile.displayName || "", photoURL: profile.photoURL || "",
      updatedAt: new Date().toISOString()
    });
    const q = `${keyQ()}&${mascara(["displayName", "photoURL", "updatedAt"])}`;
    const res = await fetch(`${docsBase}/profiles/${encodeURIComponent(uid)}?${q}`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify({ fields })
    });
    return res.ok;
  }

  // A parte do perfil que a pessoa escolhe mostrar. Máscara própria, para não
  // tocar no nome nem na fotografia — que são escritos noutro momento, pelo
  // `upsertProfile`, e viriam vazios daqui.
  async function savePublicProfile(uid, dados, token) {
    if (!ready) return false;
    const fields = encodeFields({
      destaques: Array.isArray(dados.destaques) ? dados.destaques : [],
      favoritos: Array.isArray(dados.favoritos) ? dados.favoritos : [],
      visibilidade: dados.visibilidade || "seguidores",
      updatedAt: new Date().toISOString()
    });
    const q = `${keyQ()}&${mascara(["destaques", "favoritos", "visibilidade", "updatedAt"])}`;
    const res = await fetch(`${docsBase}/profiles/${encodeURIComponent(uid)}?${q}`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify({ fields })
    });
    return res.ok;
  }

  // Um perfil público, inteiro. Devolve null se não existir — uma conta pode
  // não ter perfil ainda, e isso não é erro.
  async function fetchProfile(uid, token) {
    if (!ready || !uid) return null;
    try {
      const res = await fetch(`${docsBase}/profiles/${encodeURIComponent(uid)}?${keyQ()}`, { headers: authHeaders(token) });
      if (!res.ok) return null;
      const doc = await res.json();
      const f = decodeFields(doc);
      return {
        uid,
        displayName: f.displayName || "",
        photoURL: f.photoURL || "",
        destaques: Array.isArray(f.destaques) ? f.destaques : [],
        favoritos: Array.isArray(f.favoritos) ? f.favoritos : [],
        // Por omissão "seguidores": quem nunca escolheu não fica exposto por
        // omissão. O valor mais fechado que ainda deixa a coisa servir.
        visibilidade: f.visibilidade || "seguidores"
      };
    } catch (e) { return null; }
  }
  // Small user base: fetch the page and filter client-side (Firestore has no
  // substring search).
  async function searchProfiles(term, token) {
    if (!ready) return [];
    try {
      const all = (await fetchTodasAsPaginas("profiles", authHeaders(token))).map(decodeProfile);
      const q = String(term || "").trim().toLowerCase();
      return q ? all.filter((p) => (p.displayName || "").toLowerCase().includes(q)) : all;
    } catch (e) { return []; }
  }

  // ---- Joint-visit invites (visitInvites/{autoId}) ----
  function decodeInvite(doc) {
    const f = decodeFields(doc);
    return {
      id: doc.name.split("/").pop(),
      fromUid: f.fromUid || "", fromName: f.fromName || "Amigo", fromPhoto: f.fromPhoto || "",
      toUid: f.toUid || "", restaurantId: f.restaurantId || "", restaurantName: f.restaurantName || "",
      date: f.date || "", status: f.status || "pending", createdAt: f.createdAt || ""
    };
  }
  async function createVisitInvite(invite, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const fields = encodeFields({
      fromUid: invite.fromUid, fromName: invite.fromName || "", fromPhoto: invite.fromPhoto || "",
      toUid: invite.toUid, restaurantId: invite.restaurantId, restaurantName: invite.restaurantName || "",
      date: invite.date, status: "pending", createdAt: new Date().toISOString()
    });
    const res = await fetch(`${docsBase}/visitInvites?${keyQ()}`, {
      method: "POST", headers: authHeaders(token), body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Could not invite (${res.status}).`);
    return decodeInvite(await res.json());
  }
  // Only filters by recipient — the status is filtered client-side so this stays a
  // single-field query and needs no composite index.
  async function fetchVisitInvites(myUid, token) {
    if (!ready || !myUid) return [];
    try {
      const body = { structuredQuery: {
        from: [{ collectionId: "visitInvites" }],
        where: { fieldFilter: { field: { fieldPath: "toUid" }, op: "EQUAL", value: { stringValue: myUid } } },
        limit: 50
      } };
      const res = await fetch(`${docsBase}:runQuery?${keyQ()}`, {
        method: "POST", headers: authHeaders(token), body: JSON.stringify(body)
      });
      if (!res.ok) return [];
      const rows = await res.json();
      return (rows || []).filter((r) => r.document).map((r) => decodeInvite(r.document));
    } catch (e) { return []; }
  }
  // Os convites que EU enviei (para o × da visita os poder levar — as regras
  // só deixam o remetente apagar os seus). Filtra-se no cliente por
  // restaurante/data/estado, para a query ficar num campo só, sem índice novo.
  async function fetchSentVisitInvites(myUid, token) {
    if (!ready || !myUid) return [];
    try {
      const body = { structuredQuery: {
        from: [{ collectionId: "visitInvites" }],
        where: { fieldFilter: { field: { fieldPath: "fromUid" }, op: "EQUAL", value: { stringValue: myUid } } },
        limit: 50
      } };
      const res = await fetch(`${docsBase}:runQuery?${keyQ()}`, {
        method: "POST", headers: authHeaders(token), body: JSON.stringify(body)
      });
      if (!res.ok) return [];
      const rows = await res.json();
      return (rows || []).filter((r) => r.document).map((r) => decodeInvite(r.document));
    } catch (e) { return []; }
  }

  async function deleteVisitInvite(id, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const res = await fetch(`${docsBase}/visitInvites/${encodeURIComponent(id)}?${keyQ()}`, {
      method: "DELETE", headers: authHeaders(token)
    });
    if (!res.ok && res.status !== 404) throw new Error(`Could not delete invite (${res.status}).`);
    return true;
  }

  async function respondVisitInvite(id, status, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const fields = encodeFields({ status, respondedAt: new Date().toISOString() });
    const mask = "updateMask.fieldPaths=status&updateMask.fieldPaths=respondedAt";
    const res = await fetch(`${docsBase}/visitInvites/${encodeURIComponent(id)}?${mask}&${keyQ()}`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Could not respond (${res.status}).`);
    return true;
  }

  // ---- Groups (groups/{autoId}) ----
  // A group is { name, code, ownerUid, members:[uid], createdAt }. Created by the
  // owner; others join by code (appending their uid to members).
  function decodeGroup(doc) {
    const f = decodeFields(doc);
    return {
      id: doc.name.split("/").pop(),
      name: f.name || "Grupo",
      code: f.code || "",
      ownerUid: f.ownerUid || "",
      members: Array.isArray(f.members) ? f.members : []
    };
  }

  async function createGroup(g, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const fields = encodeFields({
      name: g.name || "Grupo",
      code: g.code,
      ownerUid: g.ownerUid,
      members: g.members || [g.ownerUid],
      createdAt: new Date().toISOString()
    });
    const res = await fetch(`${docsBase}/groups?${keyQ()}`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Could not create group (${res.status}).`);
    return decodeGroup(await res.json());
  }

  // Groups I belong to (members array-contains my uid).
  async function fetchMyGroups(uid, token) {
    if (!ready) return [];
    try {
      const body = {
        structuredQuery: {
          from: [{ collectionId: "groups" }],
          where: { fieldFilter: { field: { fieldPath: "members" }, op: "ARRAY_CONTAINS", value: { stringValue: uid } } },
          limit: 50
        }
      };
      const res = await fetch(`${docsBase}:runQuery?${keyQ()}`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(body)
      });
      if (!res.ok) return [];
      const rows = await res.json();
      return (rows || []).filter((r) => r.document).map((r) => decodeGroup(r.document));
    } catch (e) {
      return [];
    }
  }

  async function fetchGroupByCode(code, token) {
    if (!ready) return null;
    try {
      const body = {
        structuredQuery: {
          from: [{ collectionId: "groups" }],
          where: { fieldFilter: { field: { fieldPath: "code" }, op: "EQUAL", value: { stringValue: code } } },
          limit: 1
        }
      };
      const res = await fetch(`${docsBase}:runQuery?${keyQ()}`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(body)
      });
      if (!res.ok) return null;
      const rows = await res.json();
      const row = (rows || []).find((r) => r.document);
      return row ? decodeGroup(row.document) : null;
    } catch (e) {
      return null;
    }
  }

  // Join (or otherwise update membership): replace just the members field.
  async function addGroupMember(groupId, members, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const fields = encodeFields({ members });
    const res = await fetch(`${docsBase}/groups/${encodeURIComponent(groupId)}?updateMask.fieldPaths=members&${keyQ()}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Could not join group (${res.status}).`);
    return true;
  }

  // ---- Comments (comments/{autoId}) ----
  async function fetchComments(restaurantId) {
    if (!ready) return [];
    try {
      // Equality filter only (single-field auto index — no composite index
      // needed). We order by createdAt client-side below.
      const body = {
        structuredQuery: {
          from: [{ collectionId: "comments" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "restaurantId" },
              op: "EQUAL",
              value: { stringValue: restaurantId }
            }
          },
          limit: 100
        }
      };
      const res = await fetch(`${docsBase}:runQuery?${keyQ()}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
      if (!res.ok) return [];
      const rows = await res.json();
      return (rows || [])
        .filter((row) => row.document)
        .map((row) => {
          const f = decodeFields(row.document);
          return {
            id: row.document.name.split("/").pop(),
            uid: f.uid || "",
            author: f.author || "Anónimo",
            photoURL: f.photoURL || "",
            text: f.text || "",
            createdAt: f.createdAt || ""
          };
        })
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    } catch (e) {
      return [];
    }
  }

  // Map a runQuery row to a comment object (includes restaurantId so callers
  // can link a critique back to its restaurant).
  function rowToComment(row) {
    const f = decodeFields(row.document);
    return {
      id: row.document.name.split("/").pop(),
      restaurantId: f.restaurantId || "",
      uid: f.uid || "",
      author: f.author || "Anónimo",
      photoURL: f.photoURL || "",
      text: f.text || "",
      createdAt: f.createdAt || ""
    };
  }

  // All comments written by one user, across every restaurant (newest first).
  async function fetchCommentsByUser(uid, max) {
    if (!ready || !uid) return [];
    try {
      const body = {
        structuredQuery: {
          from: [{ collectionId: "comments" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "uid" },
              op: "EQUAL",
              value: { stringValue: uid }
            }
          },
          limit: max || 100
        }
      };
      const res = await fetch(`${docsBase}:runQuery?${keyQ()}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
      if (!res.ok) return [];
      const rows = await res.json();
      return (rows || [])
        .filter((row) => row.document)
        .map(rowToComment)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    } catch (e) {
      return [];
    }
  }

  // Most recent comments across every restaurant and user (newest first).
  async function fetchRecentComments(max) {
    if (!ready) return [];
    try {
      const body = {
        structuredQuery: {
          from: [{ collectionId: "comments" }],
          orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
          limit: max || 100
        }
      };
      const res = await fetch(`${docsBase}:runQuery?${keyQ()}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
      if (!res.ok) return [];
      const rows = await res.json();
      return (rows || [])
        .filter((row) => row.document)
        .map(rowToComment)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    } catch (e) {
      return [];
    }
  }

  async function addComment(comment, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const fields = encodeFields({
      restaurantId: comment.restaurantId,
      uid: comment.uid,
      author: comment.author,
      photoURL: comment.photoURL || "",
      text: comment.text
    });
    fields.createdAt = { timestampValue: new Date().toISOString() };
    const res = await fetch(`${docsBase}/comments?${keyQ()}`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Could not post comment (${res.status}).`);
    const doc = await res.json();
    const f = decodeFields(doc);
    return {
      id: doc.name.split("/").pop(),
      uid: f.uid,
      author: f.author,
      photoURL: f.photoURL || "",
      text: f.text,
      createdAt: f.createdAt || new Date().toISOString()
    };
  }

  // ---- Photos (photos/{autoId}) — metadata only; file lives in Storage ----
  async function fetchPhotos(restaurantId) {
    if (!ready) return [];
    try {
      const body = {
        structuredQuery: {
          from: [{ collectionId: "photos" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "restaurantId" },
              op: "EQUAL",
              value: { stringValue: restaurantId }
            }
          },
          limit: 100
        }
      };
      const res = await fetch(`${docsBase}:runQuery?${keyQ()}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
      if (!res.ok) return [];
      const rows = await res.json();
      return (rows || [])
        .filter((row) => row.document)
        .map((row) => {
          const f = decodeFields(row.document);
          return {
            id: row.document.name.split("/").pop(),
            restaurantId: f.restaurantId || "",
            visitId: f.visitId || "",
            uid: f.uid || "",
            author: f.author || "",
            url: f.url || "",
            path: f.path || "",
            createdAt: f.createdAt || ""
          };
        })
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    } catch (e) {
      return [];
    }
  }

  // Apagar o documento de uma foto (o ficheiro em si sai pelo
  // FirebaseStorage.remove — dois passos porque vivem em serviços diferentes).
  // As regras só o permitem ao autor, desde sempre; o botão é que faltava.
  async function deletePhoto(id, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const res = await fetch(`${docsBase}/photos/${encodeURIComponent(id)}?${keyQ()}`, {
      method: "DELETE", headers: authHeaders(token)
    });
    if (!res.ok && res.status !== 404) throw new Error(`Could not delete photo (${res.status}).`);
    return true;
  }

  // Most recent photos across every restaurant and user (newest first).
  async function fetchRecentPhotos(max) {
    if (!ready) return [];
    try {
      const body = {
        structuredQuery: {
          from: [{ collectionId: "photos" }],
          orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
          limit: max || 60
        }
      };
      const res = await fetch(`${docsBase}:runQuery?${keyQ()}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
      if (!res.ok) return [];
      const rows = await res.json();
      return (rows || [])
        .filter((row) => row.document)
        .map((row) => {
          const f = decodeFields(row.document);
          return {
            id: row.document.name.split("/").pop(),
            restaurantId: f.restaurantId || "",
            uid: f.uid || "",
            author: f.author || "",
            url: f.url || "",
            path: f.path || "",
            createdAt: f.createdAt || ""
          };
        })
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    } catch (e) {
      return [];
    }
  }

  async function addPhoto(photo, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const dados = {
      restaurantId: photo.restaurantId,
      uid: photo.uid,
      author: photo.author || "",
      url: photo.url,
      path: photo.path || ""
    };
    // A ligação foto→visita (modelo 25/08). Só nas novas: as antigas não a
    // ganham (`allow update: if false` nas regras) e ficam soltas — apagáveis
    // uma a uma, nunca em cascata.
    if (photo.visitId) dados.visitId = photo.visitId;
    const fields = encodeFields(dados);
    fields.createdAt = { timestampValue: new Date().toISOString() };
    const res = await fetch(`${docsBase}/photos?${keyQ()}`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Could not save photo (${res.status}).`);
    const doc = await res.json();
    const f = decodeFields(doc);
    return {
      id: doc.name.split("/").pop(),
      uid: f.uid,
      author: f.author || "",
      url: f.url,
      path: f.path || "",
      createdAt: f.createdAt || new Date().toISOString()
    };
  }

  return {
    init,
    isAvailable,
    fetchAll,
    add,
    deleteRestaurant,
    fetchOverrides,
    setOverride,
    setPhotoOverride,
    setGeoOverride,
    setAxesOverride,
    fetchUserDoc,
    saveUserDoc,
    fetchAllUsers,
    followUser,
    unfollowUser,
    fetchFollowing,
    fetchFollowers,
    fetchUsersByIds,
    upsertProfile,
    savePublicProfile,
    fetchProfile,
    searchProfiles,
    createVisitInvite,
    fetchVisitInvites,
    fetchSentVisitInvites,
    deleteVisitInvite,
    respondVisitInvite,
    createGroup,
    fetchMyGroups,
    fetchGroupByCode,
    addGroupMember,
    fetchComments,
    fetchCommentsByUser,
    fetchRecentComments,
    addComment,
    fetchPhotos,
    fetchRecentPhotos,
    addPhoto,
    deletePhoto,
    addReport,
    addErro,
    savePushToken,
    addActivity,
    fetchPlaceCache,
    savePlaceCache
  };
})();
