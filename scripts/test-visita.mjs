// O ciclo da visita (npm run test:visita).
//
// Mede o redesenho "a visita é a unidade atómica": registar cria uma entrada
// com corpo próprio (id, stars, nota, pratos, relógio), o rating do
// restaurante é uma sombra das visitas, editar não duplica, remover desfaz em
// cascata e o Anular repõe tudo. Nasceu com o defeito à vista: a 25/08 mediu-se
// na app real que remover a única visita deixava as estrelas, o visitado e o
// leaderboard intactos — e não havia caminho nenhum para limpar uma avaliação.
//
// COMO CONDUZ: ao contrário do audit (que substitui o UserData por um boneco),
// este arnês exercita o UserData VERDADEIRO. O SDK do Firebase é cortado por
// rota (como no test:portao) e entra um FirebaseAuth de fantoche; a camada DB
// é intercetada método a método — as gravações ficam em window.__saves em vez
// de irem à rede. Tudo entre o dedo e o payload é o código real.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { chromium, devices } from "playwright";

const ROOT = resolve(import.meta.dirname, "..");
const PORT = 8807;
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png" };

const srv = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split("?")[0]);
  const rel = p === "/" ? "index.html" : p.replace(/^\//, "");
  try {
    let body = await readFile(join(ROOT, rel));
    if (rel.endsWith("config.js")) {
      body = body.toString().replace(/GOOGLE_MAPS_API_KEY:\s*"[^"]*"/, 'GOOGLE_MAPS_API_KEY: ""');
    }
    res.writeHead(200, { "Content-Type": TYPES[extname(rel)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(body);
  } catch { res.writeHead(404).end("404"); }
});
await new Promise((ok) => srv.listen(PORT, "127.0.0.1", ok));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const c = await browser.newContext({ ...devices["iPhone 13 Pro"] });
// O SDK real nunca chega: o fantoche de baixo é quem manda na sessão.
await c.route(/gstatic\.com|googleapis\.com/, (r) => r.abort("connectionfailed"));
const p = await c.newPage();
p.setDefaultTimeout(5000);

await p.addInitScript(() => {
  window.__semPortao = true; // este arnês encena a sessão; o vigia não é o objeto
  window.__saves = [];       // cada payload que o saveUserDoc gravaria
  window.__convites = [];    // cada convite que o createVisitInvite enviaria
  // Fantoche do FirebaseAuth: o suficiente para o auth.js fazer wire() e para
  // o arnês disparar a "sessão" quando quiser (window.FirebaseAuth._entrar()).
  window.FirebaseAuth = {
    configured: true,
    _cb: null,
    onChange(cb) { this._cb = cb; },
    onProfileChange() {},
    getToken: async () => "token-falso",
    signIn() {}, signInApple() {}, signOut: async () => {}
  };
});

p.on("pageerror", (e) => console.log("ERRO DA PÁGINA:", String(e).slice(0, 160)));
await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1500);

// A camada DB, intercetada DEPOIS de carregar e ANTES de haver sessão.
await p.evaluate(() => {
  DB.fetchUserDoc = async () => null; // primeira sessão, doc por criar
  DB.saveUserDoc = async (uid, data) => { window.__saves.push(JSON.parse(JSON.stringify(data))); return true; };
  DB.upsertProfile = async () => true;
  DB.fetchFollowing = async () => [];
  DB.fetchFollowers = async () => [];
  DB.fetchMyGroups = async () => [];
  DB.fetchUsersByIds = async () => [];
  DB.fetchVisitInvites = async () => [];
  DB.createVisitInvite = async (inv) => { window.__convites.push(inv); return { ...inv, id: "conv" + window.__convites.length }; };
  window.__convitesApagados = [];
  window.__convitesPendentes = [];
  DB.fetchSentVisitInvites = async () => window.__convitesPendentes;
  DB.deleteVisitInvite = async (id) => { window.__convitesApagados.push(id); return true; };
  DB.fetchAll = DB.fetchAll; // a lista partilhada vem do data/restaurants.json na mesma
});
// A sessão entra pelo caminho real: o onChange do auth.js → onAuthChange → setUser.
await p.evaluate(() => {
  window.FirebaseAuth._cb({
    uid: "eu-arnes", email: "eu@arnes.pt", displayName: "Eu do Arnês",
    photoURL: "", metadata: { creationTime: "2026-01-01" }
  });
});
await p.waitForFunction(() => UserData.isCloud(), null, { timeout: 8000 });
// O tutorial de primeira conta abre-se sozinho; sai da frente, e a marca fica.
await p.evaluate(() => {
  if (typeof UserData.markOnboarded === "function") UserData.markOnboarded();
  ["onboarding", "tour"].forEach((id) => { const e = document.getElementById(id); if (e) e.classList.add("hidden"); });
  document.querySelectorAll(".modal:not(.hidden)").forEach((m) => m.classList.add("hidden"));
});

let falhas = 0;
const chk = (nome, ok, extra = "") => {
  console.log((ok ? "PASS " : "FALHA ") + nome + (ok ? "" : "  " + extra));
  if (!ok) falhas++;
};

// ---------------------------------------------------------------------------
// 1. Registar uma visita cria uma entrada com corpo próprio
// ---------------------------------------------------------------------------
// Conduzido pela interface real: lista → ficha → folha → 4 estrelas → registar.
await p.click('[data-map-mode="lista"]');
await p.click(".rcard");
await p.waitForSelector('#detail-panel[aria-hidden="false"]');
// O id do sítio aberto sai do DOM (o `state` do app é léxico, fechado no IIFE).
const idAlvo = await p.evaluate(() => {
  const b = document.querySelector("#detail-body [data-visit-toggle]");
  return b ? b.dataset.visitToggle : null;
});
await p.click("[data-open-visit-sheet]");
await p.waitForSelector('#visit-sheet:not(.hidden)');
await p.click('#visit-sheet .visit-star[data-star="4"]');
await p.click("[data-visit-submit]");
await p.waitForTimeout(700); // o persist é debounced a 500ms

const entrada = await p.evaluate((id) => {
  const h = UserData.getHistory(id);
  return h.length ? JSON.parse(JSON.stringify(h[h.length - 1])) : null;
}, idAlvo);
chk("registar cria uma entrada de visita", !!entrada);
chk("a entrada tem id próprio (visitas no mesmo dia deixam de ser gémeas)",
  !!(entrada && typeof entrada === "object" && entrada.id && /^v/.test(entrada.id)),
  `entrada: ${JSON.stringify(entrada)}`);
chk("a entrada leva as estrelas com ela", !!(entrada && entrada.stars === 4),
  `entrada: ${JSON.stringify(entrada)}`);
// `typeof === "object"` não é pedantismo: uma entrada legada é uma STRING, e
// "2026-08-25".at existe (método de String) — dava um verde falso. Apanhado
// na primeira corrida deste arnês; fica a guarda e a história.
chk("a entrada tem relógio de registo (at)",
  !!(entrada && typeof entrada === "object" && typeof entrada.at === "string"),
  `entrada: ${JSON.stringify(entrada)}`);

const guardado = await p.evaluate((id) => {
  const s = window.__saves[window.__saves.length - 1];
  if (!s || !s.history || !s.history[id]) return null;
  const lista = s.history[id];
  return JSON.parse(JSON.stringify(lista[lista.length - 1]));
}, idAlvo);
chk("a forma nova chega ao payload gravado", !!(guardado && guardado.id && guardado.at),
  `gravado: ${JSON.stringify(guardado)}`);

// Os helpers de normalização respondem pelas TRÊS formas — é o contrato que
// deixa os docs antigos dos amigos viverem para sempre.
// Dentro de try: antes do redesenho os helpers nem existem, e a ausência tem
// de ser uma FALHA com nome, não um traço de pilha (a oitava lição da casa).
const normal = await p.evaluate(() => {
  try {
    const casos = ["2024-03-02", { date: "2025-01-05", with: ["a"] }, { id: "vabc", date: "2026-08-25", with: [], stars: 3, at: "2026-08-25T10:00:00Z" }];
    return casos.map((e) => ({
      date: UserData.visitDate(e), id: UserData.visitId(e),
      stars: UserData.visitStars(e), at: UserData.visitAt(e)
    }));
  } catch (e) { return { erro: String(e).slice(0, 120) }; }
});
if (normal && normal.erro) {
  chk("visitDate responde às três formas", false, normal.erro);
  chk("visitId/visitStars/visitAt: nulos no legado, presentes na nova", false, normal.erro);
}
if (!normal || normal.erro) { /* as duas FALHAs já ficaram registadas acima */ } else {
chk("visitDate responde às três formas",
  normal[0].date === "2024-03-02" && normal[1].date === "2025-01-05" && normal[2].date === "2026-08-25");
chk("visitId/visitStars/visitAt: nulos no legado, presentes na nova",
  normal[0].id === null && normal[1].id === null &&
  normal[2].id === "vabc" && normal[2].stars === 3 && !!normal[2].at,
  JSON.stringify(normal));
}

// ---------------------------------------------------------------------------
// 2. Aceitar um convite cria uma visita SEM estrelas (não contamina médias)
// ---------------------------------------------------------------------------
const conviteEntrada = await p.evaluate(() => {
  UserData.addVisit("rest-convite", { date: "2026-08-20", with: ["amigo-1"] });
  const h = UserData.getHistory("rest-convite");
  return JSON.parse(JSON.stringify(h[h.length - 1]));
});
chk("a visita de convite não tem estrelas",
  !!(conviteEntrada && typeof conviteEntrada === "object" && conviteEntrada.stars === undefined),
  JSON.stringify(conviteEntrada));
chk("mas tem id e companhia", !!(conviteEntrada && conviteEntrada.id && conviteEntrada.with && conviteEntrada.with[0] === "amigo-1"));

// ---------------------------------------------------------------------------
// 3. O rating do restaurante é uma SOMBRA das visitas
// ---------------------------------------------------------------------------
const sombra = await p.evaluate((id) => {
  const r = UserData.getRating(id);
  return r ? JSON.parse(JSON.stringify(r)) : null;
}, idAlvo);
chk("o rating derivado aponta para a visita que o criou (visitId)",
  !!(sombra && sombra.stars === 4 && typeof sombra.visitId === "string"),
  `rating: ${JSON.stringify(sombra)}`);

// Um rating LEGADO/manual (sem visitId) nunca é apagado pelo recálculo.
const legado = await p.evaluate(() => {
  try {
    UserData.setRating("rest-legado", 5, "nota antiga", []);
    UserData.addVisit("rest-legado", { date: "2026-08-10", with: [] }); // sem stars
    const r = UserData.getRating("rest-legado");
    return r ? JSON.parse(JSON.stringify(r)) : null;
  } catch (e) { return { erro: String(e).slice(0, 120) }; }
});
chk("um rating legado sobrevive a visitas sem estrelas",
  !!(legado && !legado.erro && legado.stars === 5 && legado.note === "nota antiga"),
  JSON.stringify(legado));

// ---------------------------------------------------------------------------
// 4. Remover a última visita desfaz os derivados
// ---------------------------------------------------------------------------
const aposRemover = await p.evaluate((id) => {
  try {
    const h = UserData.getHistory(id);
    const ultima = h[h.length - 1];
    const chave = UserData.visitId(ultima) || UserData.visitDate(ultima);
    UserData.removeVisit(id, chave);
    return {
      visitas: UserData.getHistory(id).length,
      visitado: UserData.isVisited(id),
      rating: UserData.getRating(id) ? JSON.parse(JSON.stringify(UserData.getRating(id))) : null
    };
  } catch (e) { return { erro: String(e).slice(0, 120) }; }
}, idAlvo);
chk("remover a única visita esvazia o histórico",
  !!(aposRemover && !aposRemover.erro && aposRemover.visitas === 0), JSON.stringify(aposRemover));
chk("… e desliga o visitado (o leaderboard Sempre desce)",
  !!(aposRemover && aposRemover.visitado === false), JSON.stringify(aposRemover));
chk("… e leva o rating derivado com ela",
  !!(aposRemover && aposRemover.rating === null), JSON.stringify(aposRemover));

// Com DUAS visitas com stars, remover a mais recente faz a anterior voltar a
// mandar no rating — e o updatedAt volta ao relógio DELA (o feed não mente).
const duas = await p.evaluate(() => {
  try {
    const v1 = UserData.addVisit("rest-duas", { date: "2026-03-01", stars: 2, note: "primeira" });
    const v2 = UserData.addVisit("rest-duas", { date: "2026-08-01", stars: 5, note: "segunda" });
    const antes = JSON.parse(JSON.stringify(UserData.getRating("rest-duas")));
    UserData.removeVisit("rest-duas", v2.id);
    const depois = JSON.parse(JSON.stringify(UserData.getRating("rest-duas")));
    return { antes, depois, v1id: v1.id, visitado: UserData.isVisited("rest-duas") };
  } catch (e) { return { erro: String(e).slice(0, 140) }; }
});
chk("com duas visitas, a mais recente manda no rating",
  !!(duas && !duas.erro && duas.antes && duas.antes.stars === 5 && duas.antes.note === "segunda"),
  JSON.stringify(duas && (duas.erro || duas.antes)));
chk("removida a recente, a anterior volta a mandar",
  !!(duas && !duas.erro && duas.depois && duas.depois.stars === 2 && duas.depois.visitId === duas.v1id && duas.visitado === true),
  JSON.stringify(duas && (duas.erro || duas.depois)));

// ---------------------------------------------------------------------------
// 5. Remover a avaliação sem remover a visita (clearVisitRating)
// ---------------------------------------------------------------------------
const limpar = await p.evaluate(() => {
  try {
    if (typeof UserData.clearVisitRating !== "function") return { erro: "clearVisitRating não existe" };
    const v = UserData.addVisit("rest-limpar", { date: "2026-07-01", stars: 3, note: "engano" });
    UserData.clearVisitRating("rest-limpar", v.id);
    const h = UserData.getHistory("rest-limpar");
    return {
      visitas: h.length,
      stars: UserData.visitStars(h[0]),
      rating: UserData.getRating("rest-limpar"),
      visitado: UserData.isVisited("rest-limpar")
    };
  } catch (e) { return { erro: String(e).slice(0, 120) }; }
});
chk("limpar a avaliação mantém a visita e o visitado",
  !!(limpar && !limpar.erro && limpar.visitas === 1 && limpar.visitado === true), JSON.stringify(limpar));
chk("… e o rating do restaurante desaparece",
  !!(limpar && !limpar.erro && limpar.stars === null && limpar.rating === null), JSON.stringify(limpar));

// ---------------------------------------------------------------------------
// 6. Editar uma visita não cria outra
// ---------------------------------------------------------------------------
const editar = await p.evaluate(async () => {
  try {
    if (typeof UserData.updateVisit !== "function") return { erro: "updateVisit não existe" };
    const v = UserData.addVisit("rest-editar", { date: "2026-06-01", stars: 2, note: "primeira impressão" });
    const atAntes = UserData.visitAt(UserData.getHistory("rest-editar")[0]);
    // 5ms entre registar e editar: os dois `at` saem do relógio, e no mesmo
    // milissegundo empatavam — a afirmação "o at refresca" falhava ao calhar.
    // Não é espera por evento nenhum; é garantir dois instantes distintos.
    await new Promise((r) => setTimeout(r, 5));
    UserData.updateVisit("rest-editar", v.id, { stars: 5, note: "afinal era ótimo", date: "2026-06-02" });
    const h = UserData.getHistory("rest-editar");
    const e = h[0];
    return {
      visitas: h.length,
      stars: UserData.visitStars(e),
      note: UserData.visitNote(e),
      date: UserData.visitDate(e),
      mesmaId: UserData.visitId(e) === v.id,
      atMudou: UserData.visitAt(e) !== atAntes,
      rating: JSON.parse(JSON.stringify(UserData.getRating("rest-editar")))
    };
  } catch (e) { return { erro: String(e).slice(0, 120) }; }
});
chk("editar não cresce a lista (a visita é a mesma)",
  !!(editar && !editar.erro && editar.visitas === 1 && editar.mesmaId), JSON.stringify(editar));
chk("a edição chega à visita e à sombra (rating)",
  !!(editar && !editar.erro && editar.stars === 5 && editar.date === "2026-06-02" &&
     editar.rating && editar.rating.stars === 5 && editar.atMudou),
  JSON.stringify(editar));

// Editar uma entrada LEGADA converte-a para a forma nova (ganha id e at).
const editarLegada = await p.evaluate(() => {
  try {
    if (typeof UserData.updateVisit !== "function") return { erro: "updateVisit não existe" };
    // Fabrica-se o legado por dentro: é a forma que os docs antigos ainda têm.
    UserData.addVisit("rest-legada-edit", { date: "2024-05-05" });
    const h0 = UserData.getHistory("rest-legada-edit");
    h0[0] = "2024-05-05"; // string ISO crua, como um doc de 2024
    UserData.updateVisit("rest-legada-edit", "2024-05-05", { stars: 4 });
    const e = UserData.getHistory("rest-legada-edit")[0];
    return { id: UserData.visitId(e), stars: UserData.visitStars(e), date: UserData.visitDate(e) };
  } catch (e) { return { erro: String(e).slice(0, 120) }; }
});
chk("editar uma entrada legada converte-a (ganha id) sem perder a data",
  !!(editarLegada && !editarLegada.erro && editarLegada.id && editarLegada.stars === 4 && editarLegada.date === "2024-05-05"),
  JSON.stringify(editarLegada));

// ---------------------------------------------------------------------------
// 7. "Registar outra visita" começa em branco (não herda a avaliação antiga)
// ---------------------------------------------------------------------------
// O sítio aberto na ficha já tem rating? Regista-se um primeiro para garantir.
await p.evaluate((id) => { UserData.addVisit(id, { date: "2026-08-24", stars: 3, note: "para herdar?" }); }, idAlvo);
await p.click("[data-open-visit-sheet]");
await p.waitForSelector('#visit-sheet:not(.hidden)');
const emBranco = await p.evaluate(() => ({
  estrelasAcesas: document.querySelectorAll("#visit-sheet .visit-star.on").length,
  nota: (document.querySelector("#visit-sheet [data-visit-note]") || {}).value || ""
}));
chk("a folha nova começa sem estrelas herdadas", emBranco.estrelasAcesas === 0,
  `acesas: ${emBranco.estrelasAcesas}`);
chk("… e sem nota herdada", emBranco.nota === "", `nota: "${emBranco.nota}"`);

// ---------------------------------------------------------------------------
// 8. Remover tem volta: o snackbar com Anular
// ---------------------------------------------------------------------------
// Janela por caso: 3s para dar tempo ao CLIQUE do Anular (o roundtrip do
// arnês come centenas de ms — com 300ms a janela fechava antes do dedo);
// 300ms só no caso da expiração, onde o que se espera é o fecho.
await p.evaluate(() => { window.__snackbarMs = 8000; });
// Fecha a folha aberta da secção 7 e reabre a ficha, para o histórico fresco.
await p.evaluate(() => {
  const s = document.getElementById("visit-sheet");
  if (s) { s.classList.add("hidden"); s.setAttribute("aria-hidden", "true"); }
});
await p.click(".detail-close");
await p.click(".rcard");
await p.waitForSelector('#detail-panel[aria-hidden="false"]');
// O histórico (e o ×) vive no separador "A minha experiência".
await p.click('.detail-tab:has-text("experiência")');
// Um convite pendente "desta visita" à espera de ser levado pelo ×.
await p.evaluate((id) => {
  const h = UserData.getHistory(id);
  const data = UserData.visitDate(h[h.length - 1]);
  window.__convitesPendentes = [{ id: "cv-arnes", restaurantId: id, date: data, toUid: "amigo-x", restaurantName: "X", status: "pending" }];
}, idAlvo);

const antesDoX = await p.evaluate((id) => UserData.getHistory(id).length, idAlvo);
await p.click("#detail-body [data-del-visit], #detail-panel [data-del-visit]");
const snackbarAbriu = await p
  .waitForSelector("#snackbar:not(.hidden)", { timeout: 4000 })
  .then(() => true).catch(() => false);
chk("remover mostra o snackbar", snackbarAbriu,
  await p.evaluate(() => (document.getElementById("snackbar") ? "existe mas não abriu" : "#snackbar não existe")));
const temAnular = snackbarAbriu && await p.evaluate(() => {
  const b = document.querySelector("#snackbar [data-snackbar-acao]");
  return !!(b && !b.hidden && /anular/i.test(b.textContent));
});
chk("… com o botão Anular à vista", !!temAnular);
// Os convites pendentes daquela visita foram apagados JÁ (recriáveis no Anular).
await p.waitForFunction(() => window.__convitesApagados.length > 0, null, { timeout: 3000 }).catch(() => {});
chk("os convites pendentes da visita foram apagados",
  await p.evaluate(() => window.__convitesApagados.includes("cv-arnes")),
  await p.evaluate(() => JSON.stringify(window.__convitesApagados)));

// Anular repõe tudo: a visita (o MESMO id), o visitado, o rating — e os convites.
if (temAnular) {
  const convitesAntes = await p.evaluate(() => window.__convites.length);
  await p.click("#snackbar [data-snackbar-acao]");
  await p.waitForTimeout(200);
  const reposto = await p.evaluate((dados) => {
    const h = UserData.getHistory(dados.id);
    return {
      visitas: h.length,
      visitado: UserData.isVisited(dados.id),
      rating: !!UserData.getRating(dados.id)
    };
  }, { id: idAlvo });
  chk("Anular repõe a visita, o visitado e o rating",
    reposto.visitas === antesDoX && reposto.visitado === true && reposto.rating === true,
    JSON.stringify(reposto));
  const convitesRecriados = await p.evaluate(() => window.__convites.length);
  chk("… e recria os convites que tinha levado", convitesRecriados > convitesAntes,
    `antes=${convitesAntes} depois=${convitesRecriados}`);
} else {
  chk("Anular repõe a visita, o visitado e o rating", false, "sem snackbar");
  chk("… e recria os convites que tinha levado", false, "sem snackbar");
}

// Expirar NÃO repõe nada: remove outra vez e deixa a janela fechar-se sozinha.
const expirar = await p.evaluate(() => {
  window.__snackbarMs = 1200;
  window.__convitesApagados = [];
  // A sonda da nona lição: em vez de adivinhar o que o snackbar fez, regista-se
  // cada mudança de classe com o relógio ao lado.
  window.__snackLog = [];
  const s = document.getElementById("snackbar");
  if (s) new MutationObserver(() => {
    window.__snackLog.push({ t: Date.now() % 100000, hidden: s.classList.contains("hidden") });
  }).observe(s, { attributes: true, attributeFilter: ["class"] });
  return true;
});
await p.click("#detail-body [data-del-visit], #detail-panel [data-del-visit]").catch(() => {});
let erroAbriu = "";
const abriuDeNovo = await p.waitForSelector("#snackbar:not(.hidden)", { timeout: 3000 })
  .then(() => true)
  .catch((e) => { erroAbriu = String(e).slice(0, 200); return false; });
if (!abriuDeNovo) console.log("  (waitForSelector do 2º snackbar: " + erroAbriu + ")");
// state:"attached", não o default "visible": um elemento display:none nunca
// fica "visible", e a espera pelo FECHO falhava eternamente — o arnês acusava
// a app do seu próprio defeito. (Descoberto com a sonda: o log mostrava o
// snackbar a abrir e a fechar direitinho enquanto isto dava vermelho.)
const fechouSozinho = abriuDeNovo && await p
  .waitForSelector("#snackbar.hidden", { state: "attached", timeout: 4000 })
  .then(() => true).catch(() => false);
chk("a janela do Anular fecha-se sozinha", !!fechouSozinho,
  await p.evaluate((id) => JSON.stringify({
    abriu: !document.getElementById("snackbar").classList.contains("hidden"),
    visitas: UserData.getHistory(id).length,
    log: window.__snackLog
  }), idAlvo));
const aposExpirar = await p.evaluate((id) => ({
  visitas: UserData.getHistory(id).length, visitado: UserData.isVisited(id)
}), idAlvo);
chk("expirada a janela, a remoção fica feita",
  aposExpirar.visitas === antesDoX - 1 && aposExpirar.visitado === false,
  JSON.stringify(aposExpirar));

// ---------------------------------------------------------------------------
// 9. O feed: quem visitou e avaliou aparece UMA vez
// ---------------------------------------------------------------------------
// Um amigo encenado com os dois mundos: uma visita NOVA com avaliação (rid1)
// e o par legado — rating sem visitId + visita string do mesmo dia (rid2).
// Hoje cada um deles produz DOIS cartões para o mesmo acontecimento.
const restaurantes = JSON.parse(await readFile(join(ROOT, "data/restaurants.json"), "utf8"));
const rid1 = restaurantes[0].id;
const rid2 = restaurantes[1].id;
await p.evaluate((ids) => {
  DB.fetchFollowing = async () => ["amigo-feed"];
  DB.fetchRecentPhotos = async () => [];
  DB.fetchUsersByIds = async () => [{
    uid: "amigo-feed", displayName: "Amiga Feed", photoURL: "",
    visited: [ids.rid1, ids.rid2], priority: [], priorityAt: {},
    ratings: {
      [ids.rid1]: { stars: 5, note: "brutal", dishes: [], updatedAt: "2026-08-20T21:00:00.000Z", visitId: "vAAA11" },
      [ids.rid2]: { stars: 4, note: "boa tasca", dishes: [], updatedAt: "2026-05-10T20:00:00.000Z" }
    },
    history: {
      [ids.rid1]: [{ id: "vAAA11", date: "2026-08-20", with: [], stars: 5, note: "brutal", at: "2026-08-20T21:00:00.000Z" }],
      [ids.rid2]: ["2026-05-10"]
    }
  }];
  return UserData.reloadGroup();
}, { rid1, rid2 });
// A ficha da secção 8 ainda está aberta e intercetava o toque no separador.
await p.evaluate(() => { const x = document.querySelector(".detail-close"); if (x) x.click(); });
await p.click('[data-tab-nav="amigos"]');
await p.waitForSelector("#amigos-feed .feed-item", { timeout: 6000 }).catch(() => {});

const feed = await p.evaluate((ids) => {
  const cartoes = [...document.querySelectorAll("#amigos-feed .feed-item")];
  const de = (rid) => cartoes.filter((c) => {
    const b = c.querySelector("[data-feed-rest]");
    return b && b.dataset.feedRest === rid;
  });
  const texto = (c) => (c.querySelector(".feed-who") || {}).textContent || "";
  return {
    total: cartoes.length,
    rid1: de(ids.rid1).map(texto),
    rid2: de(ids.rid2).map(texto),
    rid1Stars: de(ids.rid1).map((c) => !!c.querySelector(".feed-stars"))
  };
}, { rid1, rid2 });
chk("uma visita com avaliação é UM cartão no feed", feed.rid1.length === 1,
  JSON.stringify(feed.rid1));
chk("… e o cartão diz que visitou E avaliou",
  feed.rid1.length === 1 && /visitou e avaliou/i.test(feed.rid1[0]),
  JSON.stringify(feed.rid1));
chk("… com as estrelas à vista", feed.rid1Stars[0] === true, JSON.stringify(feed.rid1Stars));
chk("o par legado (rating + visita do mesmo dia) funde-se num cartão",
  feed.rid2.length === 1, JSON.stringify(feed.rid2));

// Os filtros: o cartão unificado aparece em "Avaliações" E em "Visitas".
await p.click('#amigos-filter [data-afilter="rating"], [data-afilter="rating"]').catch(() => {});
await p.waitForTimeout(300);
const soAvaliacoes = await p.evaluate((rid) =>
  [...document.querySelectorAll("#amigos-feed .feed-item [data-feed-rest]")].filter((b) => b.dataset.feedRest === rid).length, rid1);
await p.click('[data-afilter="visit"]').catch(() => {});
await p.waitForTimeout(300);
const soVisitas = await p.evaluate((rid) =>
  [...document.querySelectorAll("#amigos-feed .feed-item [data-feed-rest]")].filter((b) => b.dataset.feedRest === rid).length, rid1);
chk("o cartão unificado responde ao filtro Avaliações", soAvaliacoes === 1, `viu ${soAvaliacoes}`);
chk("… e ao filtro Visitas", soVisitas === 1, `viu ${soVisitas}`);

// ---------------------------------------------------------------------------
// 10. Leaderboard "Sempre": sítios E visitas, lado a lado
// ---------------------------------------------------------------------------
// A Amiga tem 2 sítios visitados e 2 visitas registadas (uma nova, uma
// legada). O "Sempre" antigo mostrava "2 visitas" a contar FLAGS — foi assim
// que remover uma visita não mexia no pódio, medido na app real a 25/08.
await p.click('[data-atab="leaderboard"]');
await p.waitForSelector("#amigos-leaderboard .lb-row", { timeout: 6000 }).catch(() => {});
const linhaAmiga = await p.evaluate(() => {
  const row = [...document.querySelectorAll("#amigos-leaderboard .lb-row")]
    .find((r) => /Amiga Feed/.test(r.textContent));
  return row ? row.textContent.replace(/\s+/g, " ").trim() : null;
});
chk("o Sempre mostra os sítios", !!(linhaAmiga && /2\s*sítios/.test(linhaAmiga)), `linha: ${linhaAmiga}`);
chk("… e as visitas, lado a lado", !!(linhaAmiga && /2\s*visitas/.test(linhaAmiga)), `linha: ${linhaAmiga}`);

// ---------------------------------------------------------------------------
// 11. Apagar uma foto minha — em qualquer sítio onde ela apareça
// ---------------------------------------------------------------------------
// Antes de 25/08 NÃO EXISTIA caminho nenhum para apagar uma foto: as regras
// permitiam-no ao autor desde sempre, o cliente é que nunca o implementou.
await p.evaluate((rid) => {
  window.__fotosApagadas = [];
  window.__ficheirosApagados = [];
  window.__overridesFoto = [];
  DB.fetchPhotos = async () => [{
    id: "ph1", uid: "eu-arnes", author: "Eu do Arnês",
    url: location.origin + "/icons/icon-192.png",
    path: "restaurants/x/eu-arnes-1.png", restaurantId: rid
  }];
  DB.deletePhoto = async (id) => { window.__fotosApagadas.push(id); return true; };
  DB.setPhotoOverride = async (id, url) => { window.__overridesFoto.push({ id, url }); return true; };
  window.FirebaseStorage = {
    configured: true,
    upload: async () => "http://x/enviada.png",
    remove: async (path) => { window.__ficheirosApagados.push(path); return true; }
  };
  window.confirm = () => true; // o arnês confirma sempre
}, rid1);

// Reabrir a ficha do primeiro sítio, no separador da experiência.
await p.click('[data-tab-nav="mapa"]');
await p.click('[data-map-mode="lista"]');
await p.click(".rcard");
await p.waitForSelector('#detail-panel[aria-hidden="false"]');
await p.click('.detail-tab:has-text("experiência")');
await p.waitForSelector("[data-my-grid] .photo-tile", { timeout: 6000 }).catch(() => {});

await p.evaluate(() => { const t = document.querySelector("[data-my-grid] .photo-tile"); if (t) t.click(); });
const viewerAberto = await p.waitForSelector("#photo-viewer:not(.hidden)", { timeout: 4000 })
  .then(() => true).catch(() => false);
chk("a minha foto abre no viewer", viewerAberto);

const temApagar = viewerAberto && await p.evaluate(() => {
  const b = document.querySelector("[data-viewer-apagar]");
  return !!(b && !b.hidden && !b.classList.contains("hidden"));
});
chk("o viewer tem o botão Apagar na MINHA foto", !!temApagar);

if (temApagar) {
  // Torna-a capa primeiro — apagar a capa tem de limpar o override partilhado,
  // senão a ficha aponta para um ficheiro morto.
  await p.evaluate(() => document.querySelector("[data-viewer-cover]").click());
  await p.waitForTimeout(300);
  await p.evaluate(() => { const t = document.querySelector("[data-my-grid] .photo-tile"); if (t) t.click(); });
  await p.waitForSelector("#photo-viewer:not(.hidden)", { timeout: 4000 }).catch(() => {});
  await p.evaluate(() => document.querySelector("[data-viewer-apagar]").click());
  await p.waitForFunction(() => window.__fotosApagadas.length > 0, null, { timeout: 4000 }).catch(() => {});
  chk("apagar leva o documento da foto", await p.evaluate(() => window.__fotosApagadas.includes("ph1")),
    await p.evaluate(() => JSON.stringify(window.__fotosApagadas)));
  chk("… e o ficheiro do Storage",
    await p.evaluate(() => window.__ficheirosApagados.includes("restaurants/x/eu-arnes-1.png")),
    await p.evaluate(() => JSON.stringify(window.__ficheirosApagados)));
  chk("… e a capa não fica a apontar para um ficheiro morto",
    await p.evaluate(() => window.__overridesFoto.some((o) => o.url === "")),
    await p.evaluate(() => JSON.stringify(window.__overridesFoto)));
} else {
  ["apagar leva o documento da foto", "… e o ficheiro do Storage",
   "… e a capa não fica a apontar para um ficheiro morto"].forEach((n) => chk(n, false, "sem botão"));
}

// ---------------------------------------------------------------------------
// 12. O upload comprime — uma imagem de 3000px não sobe com 3000px
// ---------------------------------------------------------------------------
// Fabrica-se um PNG grande no próprio browser, mete-se no input da galeria, e
// mede-se O QUE O UPLOAD RECEBE — não o que o código diz que faz.
const comprimido = await p.evaluate(async () => {
  try {
    const medidas = [];
    window.FirebaseStorage.upload = async (path, file) => {
      const bmp = await createImageBitmap(file);
      medidas.push({ largura: bmp.width, tipo: file.type, bytes: file.size });
      return "http://x/enviada.jpg";
    };
    const c = document.createElement("canvas");
    c.width = 3000; c.height = 2000;
    const g = c.getContext("2d");
    g.fillStyle = "#b04a1c"; g.fillRect(0, 0, 3000, 2000);
    g.fillStyle = "#fff"; for (let i = 0; i < 60; i++) g.fillRect(i * 50, (i % 20) * 100, 40, 80);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const file = new File([blob], "grande.png", { type: "image/png" });
    const input = document.querySelector("[data-photo-input]");
    if (!input) return { erro: "sem input de galeria (a ficha não está aberta?)" };
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 1500));
    return { medidas, original: { largura: 3000, bytes: blob.size } };
  } catch (e) { return { erro: String(e).slice(0, 160) }; }
});
chk("o upload recebeu a imagem", !!(comprimido && !comprimido.erro && comprimido.medidas && comprimido.medidas.length === 1),
  JSON.stringify(comprimido && (comprimido.erro || comprimido.medidas)));
const m12 = comprimido && comprimido.medidas && comprimido.medidas[0];
chk("… redimensionada (lado maior ≤ 1600)", !!(m12 && m12.largura <= 1600),
  m12 ? `largura enviada: ${m12.largura}` : "sem medida");
chk("… e como JPEG", !!(m12 && m12.tipo === "image/jpeg"), m12 ? `tipo: ${m12.tipo}` : "sem medida");

await browser.close();
srv.close();
console.log(falhas ? `\nvisita: ${falhas} FALHA(S)` : "\nvisita: a unidade atómica está de pé");
process.exitCode = falhas ? 1 : 0;
