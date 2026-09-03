// As fotos da Google sob rajada (npm run test:fotos).
//
// Medido a 30/08/2026, contra a Google real: 14 pedidos GetPhoto em PARALELO →
// 7 respondem 403 com um PNG de 100×100 (o mapa com a cruz e o velocímetro);
// os mesmos 14, espaçados → 200 todos, com qualquer referrer e sem teto nenhum
// definido no projeto (6000/min é o default e o diário estava ilimitado). Ou
// seja: a Google trava rajadas por cliente, e a app fazia rajadas — a Lista
// disparava um pedido por cartão, todos no mesmo tick.
//
// E o pior não era o corte: era o que a app fazia com ele. O 403 traz uma
// imagem VÁLIDA, o `onload` dispara, e o setThumbPhoto pendurava a cruz no
// lugar do placeholder — enquanto a autocura do hero, pendurada no `onerror`,
// nunca chegava a correr. Um erro de quota vestido de foto.
//
// Este arnês serve o mesmo PNG de erro (100×100, 403) e afirma quatro coisas:
//   · preguiça: desenhar a lista só pede as fotos que estão perto do ecrã;
//   · fila: os pedidos têm teto de simultaneidade (é o padrão que passa);
//   · guarda: a imagem de erro NUNCA entra no cartão — o placeholder fica;
//   · reparação: quando a Google volta a deixar, o cartão sara sozinho.
//
// Correu primeiro contra o código com o defeito: preguiça (34 pedidos num
// tick), fila (34 em curso ao mesmo tempo), guarda (cruz no cartão) e
// reparação (nada acontece) falharam as quatro. É essa a prova de que mede.
import { chromium, devices } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { deflateSync } from "node:zlib";

// ---- um PNG a sério, em node puro: é o que a Google devolve no 403 --------
function crc32(buf) {
  let c, t = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  let crc = 0xffffffff;
  for (const b of buf) crc = t[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(tipo, dados) {
  const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo), dados]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([len, corpo, crc]);
}
function png(w, h, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, truecolor
  const linha = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3).fill(Buffer.from(rgb))]);
  const idat = deflateSync(Buffer.concat(Array(h).fill(linha)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))
  ]);
}
const PNG_ERRO = png(100, 100, [200, 60, 60]); // a "cruz" da Google: 100×100
const PNG_FOTO = png(8, 8, [80, 140, 80]);     // uma foto verdadeira qualquer

// ---- servidor estático + interruptor de modo ------------------------------
const T = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png" };
let modo = "travado"; // travado: tudo leva a cruz · ok: tudo leva foto
const srv = createServer(async (rq, rs) => {
  const p = rq.url.split("?")[0];
  if (p === "/__modo") { modo = rq.url.includes("ok") ? "ok" : "travado"; rs.writeHead(200).end(modo); return; }
  const f = join(process.cwd(), p === "/" ? "index.html" : p);
  try { const b = await readFile(f); rs.writeHead(200, { "Content-Type": T[extname(f)] || "application/octet-stream" }); rs.end(b); }
  catch { rs.writeHead(404).end("x"); }
});
await new Promise((ok) => srv.listen(8807, "127.0.0.1", ok));

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const c = await b.newContext({ ...devices["iPhone 13 Pro"] });
const p = await c.newPage(); p.setDefaultTimeout(5000);

let falhas = 0;
const chk = (nome, ok, extra = "") => {
  console.log((ok ? "PASS " : "FALHA ") + nome + (ok ? "" : "  " + extra));
  if (!ok) falhas++;
};
// Espera por condição com prazo; esgotado, devolve o último valor para o chk
// mostrar — nunca um traço de pilha (a lição do test:update).
async function esperar(fn, ms) {
  const fim = Date.now() + ms; let v;
  while (Date.now() < fim) { v = await p.evaluate(fn); if (v) return v; await p.waitForTimeout(200); }
  return v;
}

// ---- contadores do lado de cá: o que a "Google" recebe --------------------
let emCurso = 0, maxEmCurso = 0;
const pedidos = new Set();
await p.route("https://maps.googleapis.com/**", async (route) => {
  const url = route.request().url();
  if (!url.includes("PhotoService.GetPhoto")) {
    // o bootstrap do Maps: responder como a Google, chamando o callback
    return route.fulfill({ status: 200, contentType: "application/javascript", body: "window.initApp && window.initApp();" });
  }
  pedidos.add(url.split("?")[1].slice(0, 40));
  emCurso++; maxEmCurso = Math.max(maxEmCurso, emCurso);
  await new Promise((ok) => setTimeout(ok, 150)); // tempo de rede: torna a simultaneidade mensurável
  emCurso--;
  if (modo === "travado") return route.fulfill({ status: 403, contentType: "image/png", body: PNG_ERRO });
  return route.fulfill({ status: 200, contentType: "image/png", body: PNG_FOTO });
});
// Independência de máquina: no contentor não há rede à Google e no Mac e no CI
// há — bloquear POR ROTA é o que faz o ensaio medir o mesmo em todo o lado
// (a quinta lição do CLAUDE.md; o test:portao nasceu disto).
for (const dom of ["https://www.gstatic.com/**", "https://firestore.googleapis.com/**", "https://identitytoolkit.googleapis.com/**", "https://unpkg.com/**"])
  await p.route(dom, (route) => route.abort());

// ---- semear: 10 curados + 24 da "comunidade", todos com foto em cache -----
// A Google Maps a fingir, mínima: sem ela o MapModule não se dá como
// disponível, o PlacesModule fica sem service, e o enrichCard — que é quem
// pede as fotos dos cartões — nunca corre. Correu-se sem isto e o ensaio
// media zero pedidos: não era o código a ser poupado, era o caminho morto.
const MAPS_FALSO = () => {
  const LatLng = function (lat, lng) { this.lat = () => lat; this.lng = () => lng; };
  const Bounds = function (sw, ne) { this.sw = sw; this.ne = ne; };
  window.google = { maps: {
    LatLng, LatLngBounds: Bounds,
    Map: function () { return {
      fitBounds: () => {}, setCenter: () => {}, setZoom: () => {}, getZoom: () => 9,
      panTo: () => {}, getCenter: () => new LatLng(0, 0), getBounds: () => new Bounds(new LatLng(0, 0), new LatLng(1, 1))
    }; },
    Marker: function () { return { setMap: () => {}, addListener: () => {}, setAnimation: () => {}, setIcon: () => {}, setZIndex: () => {} }; },
    InfoWindow: function () { return { open: () => {}, close: () => {}, setContent: () => {} }; },
    DirectionsService: function () { return {}; }, DirectionsRenderer: function () { return { setDirections: () => {} }; },
    Size: function () {}, Point: function () {}, Animation: { BOUNCE: 1 },
    event: { addListenerOnce: (o, e, cb) => { setTimeout(cb, 10); }, trigger: () => {} },
    places: { PlacesService: function () { return { textSearch: () => {}, getDetails: () => {}, findPlaceFromQuery: () => {} }; }, PlacesServiceStatus: { OK: "OK" } },
    Geocoder: function () { return { geocode: () => {} }; }, GeocoderStatus: { OK: "OK" }
  } };
};
await p.addInitScript(MAPS_FALSO);

const curados = JSON.parse(await readFile(join(process.cwd(), "data/restaurants.json"), "utf8")).map((r) => r.id);
await p.addInitScript(({ ids }) => {
  try { sessionStorage.setItem("rp.signinPrompt", "off"); } catch (e) {}
  window.__semPortao = true;
  const extras = [];
  for (let i = 0; i < 24; i++) extras.push({
    id: "foto-x" + i, name: "Tasca " + i, town: "Lisboa", region: "Lisboa", country: "Portugal",
    category: "tradicional", lat: 38.71 + i * 0.001, lng: -9.14, tags: ["tradicional"], mapsQuery: "x", source: "custom"
  });
  try { localStorage.setItem("portugalRestaurants.custom", JSON.stringify(extras)); } catch (e) {}
  const cache = {};
  for (const id of ids.concat(extras.map((e) => e.id)))
    cache[id] = { fetchedAt: Date.now(), data: { rating: 4.5, userRatingsTotal: 100, photos: ["https://maps.googleapis.com/maps/api/place/js/PhotoService.GetPhoto?1sFAKE-" + id] } };
  try { localStorage.setItem("portugalRestaurants.placesCache.v2", JSON.stringify(cache)); } catch (e) {}
}, { ids: curados });

await p.goto("http://127.0.0.1:8807/index.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await p.waitForTimeout(2500);
await p.evaluate(() => {
  const e = document.getElementById("entrada");
  if (e) e.hidden = true;
  document.body.classList.remove("sem-sessao");
});

// ---- para a Lista, que era a rajada de agosto -----------------------------
await p.click('[data-map-mode="lista"]');
const nCartoes = await esperar(() => document.querySelectorAll('[data-mode-pane="lista"] .rcard-thumb .ph').length, 5000);
chk("a lista desenhou cartões com sítio para foto", nCartoes >= 20, `cartões=${nCartoes}`);
await p.waitForTimeout(2000); // tempo de sobra para o código antigo pedir tudo

// 1 · preguiça: só o que está perto do ecrã
chk("desenhar a lista só pede as fotos à vista (≤16 de " + nCartoes + ")",
  pedidos.size > 0 && pedidos.size <= 16, `pediu ${pedidos.size}`);

// 2 · fila: o padrão que a Google aceita é espaçado, não rajada
chk("os pedidos têm teto de simultaneidade (≤6)", maxEmCurso > 0 && maxEmCurso <= 6, `máx em curso=${maxEmCurso}`);

// 3 · guarda: a cruz não entra no cartão. Mede-se a IMAGEM (100×100), não o
// placeholder: a primeira versão media ":not([data-label])" e o caso da
// reparação passava no código antigo porque "perdeu o placeholder" e "ganhou
// a cruz" eram a mesma coisa — um falso verde de estreia (a nona lição).
const cruzes = await p.evaluate(() =>
  [...document.querySelectorAll('[data-mode-pane="lista"] .rcard-thumb .ph img')]
    .filter((i) => i.naturalWidth === 100 && i.naturalHeight === 100).length);
chk("a imagem de erro da Google nunca entra no cartão", cruzes === 0, `${cruzes} cartões com a cruz`);

// 4 · reparação: a Google volta a deixar → os cartões ganham a foto REAL
// (naturalWidth ≠ 100) sem interação nenhuma
await fetch("http://127.0.0.1:8807/__modo?ok");
const sarados = await esperar(() =>
  [...document.querySelectorAll('[data-mode-pane="lista"] .rcard-thumb .ph img')]
    .filter((i) => i.naturalWidth > 0 && i.naturalWidth !== 100).length, 15000);
chk("um cartão travado tenta outra vez sozinho e ganha a foto", (sarados || 0) >= 1,
  `com foto real=${sarados || 0} (à espera da nova tentativa espaçada)`);

// 5 · e a preguiça não é nunca: rolar até ao fundo pede as restantes
const antes = pedidos.size;
await p.evaluate(() => {
  const pane = document.querySelector('[data-mode-pane="lista"]');
  (pane || document.scrollingElement).scrollTop = 999999;
  window.scrollTo(0, 999999);
});
const cresceu = await (async () => {
  const fim = Date.now() + 8000;
  while (Date.now() < fim) { if (pedidos.size > antes) return true; await p.waitForTimeout(200); }
  return false;
})();
chk("rolar a lista pede as fotos que faltavam", cresceu, `ficou em ${pedidos.size} (tinha ${antes})`);

// ---- 6 · O DISPOSITIVO NOVO -------------------------------------------
//
// Tudo acima corre com o localStorage JÁ CHEIO — a semente deste ficheiro
// escreve a placesCache.v2 antes de a app arrancar. É realista para quem usa
// a app há meses, e é precisamente por isso que o arnês não via este defeito:
// media a fila e a guarda num dispositivo que já tinha as fotos todas.
//
// Uma instalação de fresco não tem nada disso. E o fillThumbPhoto só olhava
// para o localStorage, portanto não mostrava foto nenhuma E NEM SEQUER PEDIA:
// medido a 03/09 contra a produção, 77 cartões, 77 placeholders, zero pedidos.
// A cache PARTILHADA no Firestore tinha 23 sítios com foto, de leitura livre
// (allow read: if true) e a custo zero — e os thumbnails nunca lhe chegavam.
//
// É o cenário do revisor da Apple, que instala de fresco. Daí ser um caso.
const c2 = await b.newContext({ ...devices["iPhone 13 Pro"] });
const p2 = await c2.newPage(); p2.setDefaultTimeout(5000);

let pedidos2 = new Set();
await p2.route("https://maps.googleapis.com/**", async (route) => {
  const url = route.request().url();
  if (!url.includes("PhotoService.GetPhoto")) {
    return route.fulfill({ status: 200, contentType: "application/javascript", body: "window.initApp && window.initApp();" });
  }
  pedidos2.add(url.split("?")[1].slice(0, 40));
  return route.fulfill({ status: 200, contentType: "image/png", body: PNG_FOTO });
});
for (const dom of ["https://www.gstatic.com/**", "https://identitytoolkit.googleapis.com/**", "https://unpkg.com/**"])
  await p2.route(dom, (route) => route.abort());
// O lh3 é o destino do 302 do GetPhoto: livre, sem chave nem referrer, e
// medido a responder 200 com a foto a sério (03/09/2026).
let lh3Pedidos = 0;
await p2.route("https://lh3.googleusercontent.com/**", (route) => {
  lh3Pedidos++;
  return route.fulfill({ status: 200, contentType: "image/png", body: PNG_FOTO });
});

// A cache partilhada a responder como o Firestore responde: um documento por
// sítio, com {dados, quando}. Tudo o que NÃO for placesCache continua cortado,
// para o resto da app não depender de rede (a quinta lição do CLAUDE.md).
// O endereço: em 127.0.0.1 o CONFIG.EMULATORS é VERDADE, e o db.js aponta o
// docsBase ao emulador (porta 8080) em vez do firestore.googleapis.com. Uma
// rota só para o domínio da Google nunca disparava — e o ensaio media zero
// leituras a dizer que a app não tentava, quando ela tentava noutra porta.
// É a família do CLAUDE.md: a ferramenta não sabia responder à pergunta.
let lidosDaPartilhada = 0;
const rotaPartilhada = async (route) => {
  const url = route.request().url();
  const m = url.match(/documents\/placesCache\/([^?]+)/);
  if (!m || route.request().method() !== "GET") return route.abort();
  lidosDaPartilhada++;
  const id = decodeURIComponent(m[1]);
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    name: "projects/p/databases/(default)/documents/placesCache/" + id,
    fields: {
      quando: { stringValue: new Date().toISOString() },
      dados: { mapValue: { fields: {
        rating: { doubleValue: 4.5 },
        userRatingsTotal: { integerValue: "100" },
        photos: { arrayValue: { values: [
          // Metade durável (lh3, como o 302 do GetPhoto devolve) e metade
          // expirada (GetPhoto guardado na cache). Só a primeira deve ser pedida.
          { stringValue: /[02468]$/.test(id)
            ? "https://lh3.googleusercontent.com/place-photos/DURAVEL-" + id + "=s1600-w800"
            : "https://maps.googleapis.com/maps/api/place/js/PhotoService.GetPhoto?1sEXPIRADO-" + id }
        ] } }
      } } }
    }
  }) });
};
await p2.route("http://127.0.0.1:8080/**", rotaPartilhada);
await p2.route("https://firestore.googleapis.com/**", rotaPartilhada);


await p2.addInitScript(({ ids }) => {
  window.__semPortao = true;
  const extras = [];
  for (let i = 0; i < 24; i++) extras.push({
    id: "foto-x" + i, name: "Tasca " + i, town: "Lisboa", region: "Lisboa", country: "Portugal",
    category: "tradicional", lat: 38.71 + i * 0.001, lng: -9.14, tags: ["tradicional"], mapsQuery: "x", source: "custom"
  });
  try { localStorage.setItem("portugalRestaurants.custom", JSON.stringify(extras)); } catch (e) {}
  // A DIFERENÇA: nada em localStorage. É uma instalação de fresco.
  try { localStorage.removeItem("portugalRestaurants.placesCache.v2"); } catch (e) {}
}, { ids: curados });
// O mesmo Maps a fingir do cenário de cima, sem o qual o caminho é morto.
await p2.addInitScript(MAPS_FALSO);

await p2.goto("http://127.0.0.1:8807/index.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await p2.waitForTimeout(2500);
await p2.evaluate(() => {
  const e = document.getElementById("entrada");
  if (e) e.hidden = true;
  document.body.classList.remove("sem-sessao");
});
await p2.click('[data-map-mode="lista"]');
const n2 = await (async () => {
  const fim = Date.now() + 5000; let v = 0;
  while (Date.now() < fim) { v = await p2.evaluate(() => document.querySelectorAll('[data-mode-pane="lista"] .rcard-thumb .ph').length); if (v) return v; await p2.waitForTimeout(200); }
  return v;
})();
chk("instalação de fresco: a lista desenhou cartões", n2 >= 20, `cartões=${n2}`);

// Rolar: sem isto só ~2 cartões entram na margem do observer, e a amostra pode
// sair toda do mesmo tipo. Rolando, passam pelos dois — que é o que se quer
// medir (o durável acende, o expirado nem é pedido).
for (let i = 0; i < 4; i++) {
  await p2.evaluate(() => {
    const pane = document.querySelector('[data-mode-pane="lista"]');
    const alvo = pane && pane.scrollHeight > pane.clientHeight ? pane : document.scrollingElement;
    alvo.scrollTop += 600;
    window.scrollBy(0, 600);
  });
  await p2.waitForTimeout(700);
}
const comFoto2 = await (async () => {
  const fim = Date.now() + 15000; let v = 0;
  while (Date.now() < fim) {
    v = await p2.evaluate(() => [...document.querySelectorAll('[data-mode-pane="lista"] .rcard-thumb .ph img')]
      .filter((i) => i.naturalWidth > 0 && i.naturalWidth !== 100).length);
    if (v >= 1) return v; await p2.waitForTimeout(250);
  }
  return v;
})();
chk("num dispositivo NOVO os cartões ganham foto da cache partilhada",
  comFoto2 >= 1, `cartões com foto=${comFoto2} — o fillThumbPhoto só olha para o localStorage`);
chk("e essa foto custou zero à Google: veio da cache partilhada",
  lidosDaPartilhada > 0 && lh3Pedidos > 0, `leituras=${lidosDaPartilhada}, lh3=${lh3Pedidos}`);
// O outro lado da mesma moeda, e é o que impede a correção de piorar a fatura:
// os GetPhoto guardados na cache estão MORTOS (medido — 403 com a cruz, um a
// um, espaçados). Pedi-los é pagar para receber uma cruz.
chk("um GetPhoto guardado na cache NUNCA é pedido: expira em dias e custa",
  pedidos2.size === 0, `pediu ${pedidos2.size} GetPhoto a partir da cache partilhada`);
// Sem o `> 0` isto passava com zero leituras — verde sobre código partido,
// que é o ramo de escape que o CLAUDE.md manda não escrever.
chk("a preguiça mantém-se: não lê os 34 documentos de uma vez",
  lidosDaPartilhada > 0 && lidosDaPartilhada <= 16, `leituras=${lidosDaPartilhada}`);

await b.close(); srv.close();
console.log(falhas ? `\nfotos sob rajada: ${falhas} FALHA(S)` : "\nfotos sob rajada: tudo verde");
process.exit(falhas ? 1 : 0);
