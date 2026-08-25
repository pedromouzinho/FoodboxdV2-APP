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

await browser.close();
srv.close();
console.log(falhas ? `\nvisita: ${falhas} FALHA(S)` : "\nvisita: a unidade atómica está de pé");
process.exitCode = falhas ? 1 : 0;
