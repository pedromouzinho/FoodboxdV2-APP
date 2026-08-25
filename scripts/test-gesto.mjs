// Gestos de toque — o único arnês que mede o que o dedo faz.
//
//   npm run test:gesto
//
// Porque existe: nenhum dos outros quatro toca em eventos de toque. O `audit`,
// o `preview`, o `test:map` e o `test:update` conduzem a app com cliques, e um
// clique não tem direção nem duração. Foi por isso que este defeito viveu tanto
// tempo sem ninguém o apanhar:
//
//   arrastar a ficha PARA CIMA, para chegar aos comentários, fechava-a.
//
// A causa estava em `wireDetailSwipe`: a direção era decidida no primeiro
// movimento e nunca reavaliada, e o `dy` congelava no último valor positivo. Uma
// descida mínima — a que um polegar faz ao assentar antes do flick — bastava
// para o gesto ser julgado como um swipe para baixo rápido.
//
// Os eventos vão pelo CDP (`Input.dispatchTouchEvent`) e não por `page.tap`:
// só assim se controla o caminho ponto a ponto e o tempo entre pontos, que é
// exatamente o que distingue as duas situações.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "..");
const PORTA = 8807;
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };

// Sem chave do Maps: o mapa não é preciso para medir gestos, e pedir tiles a
// cada corrida tornava o ensaio dependente da rede — o defeito que o CLAUDE.md
// diz que já custou dois arneses.
const srv = createServer(async (req, res) => {
  const caminho = (req.url || "/").split("?")[0];
  const f = join(ROOT, caminho === "/" ? "index.html" : caminho);
  try {
    let corpo = await readFile(f);
    if (caminho === "/js/config.js") corpo = Buffer.from(corpo.toString().replace(/GOOGLE_MAPS_API_KEY:\s*"[^"]*"/, 'GOOGLE_MAPS_API_KEY: ""'));
    res.writeHead(200, { "Content-Type": TIPOS[extname(f)] || "application/octet-stream" });
    res.end(corpo);
  } catch (e) { res.writeHead(404); res.end("404"); }
});
await new Promise((r) => srv.listen(PORTA, r));

let falhas = 0;
function ok(nome, condicao, extra) {
  if (!condicao) falhas++;
  console.log((condicao ? "PASS " : "FALHA ") + nome + (condicao ? "" : "  " + (extra ?? "")));
}

const b = await chromium.launch();
const c = await b.newContext({
  viewport: { width: 402, height: 874 },
  hasTouch: true,
  isMobile: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
});
const p = await c.newPage();
p.setDefaultTimeout(5000);
await p.goto(`http://127.0.0.1:${PORTA}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
await p.waitForTimeout(2500);

// A app pede conta. O que se mede aqui são gestos, que não dependem de sessão.
await p.evaluate(() => {
  // Desarma o vigia do portão: num ambiente sem rede à Google ele levantava a
  // entrada aos 6s POR CIMA da cena, a meio de um gesto.
  window.__semPortao = true;
  const e = document.getElementById("entrada");
  if (e) e.hidden = true;
  document.body.classList.remove("sem-sessao");
});

const cdp = await c.newCDPSession(p);
// Um caminho de toque, ponto a ponto, com o tempo entre pontos a contar: é o
// tempo que separa um flick de um arrasto, e é metade do defeito.
async function caminho(pontos, msEntre) {
  const toque = (y) => [{ x: 200, y, radiusX: 12, radiusY: 12, force: 1, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: toque(pontos[0]) });
  for (const y of pontos.slice(1)) {
    await new Promise((r) => setTimeout(r, msEntre));
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: toque(y) });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await p.waitForTimeout(400);
}

const aberta = () => p.evaluate(() => document.getElementById("detail-panel").getAttribute("aria-hidden") === "false");
const rolou = () => p.evaluate(() => document.querySelector("#detail-panel .detail-card").scrollTop);

async function abrirFicha() {
  await p.evaluate(() => {
    const e = document.getElementById("entrada");
    if (e) e.hidden = true;
  });
  // A ficha de um caso anterior fica aberta e interceta os cliques do seguinte.
  // Fecha-se pelo botão, e não pondo o atributo à mão: assim o estado interno
  // da app (state.currentDetail, a câmara do mapa) fica coerente.
  if (await aberta()) {
    await p.click("#detail-panel .detail-close[data-close-detail]");
    await p.waitForTimeout(400);
  }
  await p.click('[data-tab-nav="mapa"]');
  await p.click('[data-map-mode="lista"]');
  await p.click("#restaurant-list .card");
  await p.waitForTimeout(600);
  await p.evaluate(() => { document.querySelector("#detail-panel .detail-card").scrollTop = 0; });
}

// ---- 1. o defeito: subir não pode fechar --------------------------------
//
// O caminho tem de caber na janela do defeito, e isso mediu-se em vez de se
// adivinhar. Com 25ms entre pontos o gesto demora ~400ms e o `fast` exige menos
// de 250 — a primeira versão deste ensaio passava com o código defeituoso, que
// é o pior resultado possível num teste. Sem espera entre pontos o WebKit
// entrega dois eventos, d=+62 aos 48ms e d=-200 aos 105ms: dy congela em 62,
// o gesto dura menos de 250ms, e a ficha fechava.
await abrirFicha();
ok("a ficha abriu", await aberta());
await caminho([500, 562, 300], 0);
ok("arrastar para CIMA não fecha a ficha", await aberta(),
  "um flick para cima com a descida mínima do polegar estava a ser lido como swipe-down");

// ---- 2. e tem de rolar de verdade ---------------------------------------
// O segundo sintoma da mesma causa: com uma descida curta, o gesto era engolido
// pelo preventDefault e a ficha não fechava MAS também não rolava.
await abrirFicha();
await caminho([600, 604, 400], 0);
ok("e o conteúdo rola", (await rolou()) > 0, `scrollTop=${await rolou()}`);

// O X de fechar tem de ficar À VISTA quando se rola (F5): antes era absolute
// dentro do scroller e desaparecia — quem estava fundo na ficha só saía
// rolando tudo para cima ou acertando no gesto.
const xVisivel = await p.evaluate(() => {
  const x = document.querySelector("#detail-panel .detail-close");
  if (!x) return { erro: "sem botão" };
  const r = x.getBoundingClientRect();
  const cs = getComputedStyle(x);
  const card = document.querySelector("#detail-panel .detail-card");
  const cardTop = card ? card.getBoundingClientRect().top : 0;
  // Mede-se contra o CARD, não contra a viewport: no telemóvel a ficha é uma
  // folha que começa ~100px abaixo do topo, e a primeira versão desta
  // afirmação acusava um sticky que estava perfeitamente colado.
  return {
    top: r.top, doCard: r.top - cardTop,
    visivel: r.height > 0 && (r.top - cardTop) >= 0 && (r.top - cardTop) < 80,
    pos: cs.position, scrollTop: card ? card.scrollTop : null
  };
});
ok("o X de fechar continua à vista com a ficha rolada", xVisivel.visivel === true,
  JSON.stringify(xVisivel));

// ---- 3. o gesto legítimo continua a fechar ------------------------------
// Sem isto, a correção podia ser "nunca fechar", que passa os dois de cima e
// estraga a funcionalidade.
await abrirFicha();
await caminho([200, 240, 300, 380, 460, 540], 25);
ok("arrastar para BAIXO fecha a ficha", !(await aberta()),
  "o swipe-down tem de continuar a funcionar");

// ---- 4. rolado para baixo, o gesto pertence ao scroller -----------------
await abrirFicha();
await p.evaluate(() => { document.querySelector("#detail-panel .detail-card").scrollTop = 200; });
await caminho([300, 340, 400, 470, 540], 25);
ok("com a ficha já rolada, arrastar para baixo não a fecha", await aberta(),
  "o allow=scrollTop<=0 é o que impede isto");

// ---- 5. o pull-to-refresh não pode engatar a meio da lista ---------------
//
// O mesmo defeito da ficha, no outro gesto: o `pulling` é decidido no
// touchstart e nunca desarmado. Cenário concreto — o dedo assenta no topo,
// sobe a rolar a lista, e no mesmo toque volta a descer mais do que subiu.
// O `dist` volta a ser positivo, o preventDefault mata o fling, e se passar
// dos 90px chama reloadData() sem ninguém ter puxado do topo.
// A ficha do caso anterior fica aberta e interceta tudo.
if (await aberta()) {
  await p.click("#detail-panel .detail-close[data-close-detail]");
  await p.waitForTimeout(400);
}
await p.click('[data-tab-nav="diario"]');
await p.waitForTimeout(700);
// A altura do indicador volta a zero no fim do gesto, portanto medi-la depois
// não diz nada. O que se observa é se o recarregamento chegou a arrancar: o
// `end()` põe a classe `spin` no indicador antes de chamar o reloadData.
await p.evaluate(() => {
  const el = document.querySelector('[data-screen="diario"] .ptr');
  window.__girou = false;
  if (!el) return;
  new MutationObserver(() => {
    if (el.classList.contains("spin")) window.__girou = true;
  }).observe(el, { attributes: true, attributeFilter: ["class"] });
});
ok("o indicador de pull-to-refresh existe no Diário",
  await p.evaluate(() => !!document.querySelector('[data-screen="diario"] .ptr')));

// O dedo assenta no topo, sobe 300 a rolar a lista, e no mesmo toque volta a
// descer 200 — o `dist` final fica em +200, acima dos 90 que disparam o
// recarregamento. Ninguém puxou do topo.
await caminho([400, 150, 600], 8);
ok("o pull-to-refresh não recarrega quando o dedo já tinha ido a subir",
  !(await p.evaluate(() => window.__girou)),
  "o dist final era positivo mas o gesto era de scroll");

await b.close();
srv.close();
console.log(falhas ? `\n${falhas} falha(s)` : "\ngestos: a ficha fecha quando se quer, e só quando se quer");
process.exit(falhas ? 1 : 0);
