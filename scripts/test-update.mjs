// Ensaio de atualização (npm run test:update).
//
// Prova o que só se conseguia verificar apagando a app do telemóvel: publicar
// uma versão nova e a PWA instalada apanhá-la sozinha.
//
// O servidor imita a produção — serve os assets com max-age=3600, que era a
// causa do problema: o addAll() do service worker ia à cache HTTP e enchia a
// cache NOVA com os ficheiros VELHOS. Se a correção (cache:"reload")
// desaparecer, este ensaio falha.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { chromium, devices } from "playwright";

const ROOT = resolve(import.meta.dirname, "..");
const PORT = 8804;
const TYPES = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript",
  ".json":"application/json", ".webmanifest":"application/manifest+json",
  ".svg":"image/svg+xml", ".png":"image/png" };

// Substituições em memória, para "publicar" sem tocar no disco.
const patch = new Map();

const srv = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split("?")[0]);
  const rel = p === "/" ? "index.html" : p.replace(/^\//, "");
  try {
    let body = patch.has(rel) ? patch.get(rel) : await readFile(join(ROOT, rel));
    // A chave do Maps sai, como no audit e no preview. Este ensaio mede
    // MOMENTOS do arranque — quando o service worker assume, quando a versão
    // nova entra — e com a chave presente esses momentos dependem da rede:
    // onde a Google recusa o referrer, o script carrega na mesma, o `onerror`
    // não dispara, e a app só arranca 10s depois pela rede de segurança. Aqui
    // não há rede para a Google e nunca se vê; num Mac com rede, vê-se sempre.
    if (rel.endsWith("config.js")) {
      body = body.toString().replace(/GOOGLE_MAPS_API_KEY:\s*"[^"]*"/, 'GOOGLE_MAPS_API_KEY: ""');
    }
    // Os mesmos cabeçalhos da produção: só o sw.js e o HTML são no-cache.
    const cc = /^(sw\.js|index\.html)$/.test(rel) ? "no-cache, no-store, must-revalidate" : "max-age=3600";
    res.writeHead(200, { "Content-Type": TYPES[extname(rel)] || "application/octet-stream", "Cache-Control": cc });
    res.end(body);
  } catch { res.writeHead(404).end("404"); }
});
await new Promise((ok) => srv.listen(PORT, "127.0.0.1", ok));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ ...devices["iPhone 13 Pro"] });
const page = await ctx.newPage();
page.setDefaultTimeout(5000);
const url = `http://127.0.0.1:${PORT}/index.html`;

let falhas = 0;
const chk = (nome, ok, extra = "") => {
  console.log((ok ? "PASS " : "FALHA ") + nome + (ok ? "" : "  " + extra));
  if (!ok) falhas++;
};

// ---- primeira instalação ----
// As esperas abaixo são por SINAIS reais (o controller a mudar, a marca de
// atualização pendente, o evento de load) — nunca por segundos contados. O
// número só existe para o ensaio não ficar pendurado para sempre, por isso é
// generoso de propósito.
//
// Não era. Com 20s, este ficheiro passava sozinho e falhava quando corria a
// seguir à auditoria: dois Chromium a disputar o mesmo CPU chegam para a
// instalação do service worker demorar mais do que isso. Um ensaio que falha
// por a máquina estar ocupada não distingue defeito de ruído — e a partir daí
// deixa de valer como prova de coisa nenhuma.
// O convite de sessão abre-se sozinho a quem não tem sessão, e `ocupado()`
// conta qualquer `.modal:not(.hidden)` — com ele aberto a app nunca recarrega,
// e o último caso deste ficheiro mede o contrário do que diz medir.
//
// Só que o convite depende de `FirebaseAuth.configured`, e isso depende de o
// SDK ter vindo do gstatic. Sem rede à Google não abre, e o ensaio passava por
// isso, não por a app estar certa: verde no contentor, vermelho no Mac. É a
// mesma dependência de ambiente que saiu do audit e do preview.
//
// A pré-condição passa a ser dita em voz alta, antes da primeira carga, em vez
// de ser herdada da rede.
await page.addInitScript(() => {
  try { sessionStorage.setItem("rp.signinPrompt", "off"); } catch (e) {}
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 45000 });
chk("service worker assume o controlo", true);

// Segunda abertura: na PRIMEIRA instalação não há controller e o reload é
// deliberadamente suprimido (não há versão anterior para substituir). É a
// partir da segunda abertura que uma atualização deve ser apanhada — que é
// exatamente a situação de quem já tem a app no ecrã principal.
await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 45000 });
const corInicial = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

// ---- "publica-se" uma versão nova: CSS diferente + CACHE novo ----
const css = (await readFile(join(ROOT, "css/style.css"))).toString();
patch.set("css/style.css", css.replace("--bg: #f6f1e7;", "--bg: rgb(1, 2, 3);"));
const sw = (await readFile(join(ROOT, "sw.js"))).toString();
patch.set("sw.js", sw.replace(/foodboxd-v\d+/, "foodboxd-v999"));

// ---- caso 1: app livre -> apanha sozinha ----
const recarregou = page.waitForEvent("load", { timeout: 60000 });
await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
await recarregou.catch(() => {});
// Esperar pela cor, não por 1200 ms — ver a nota longa no caso 3. Onde se
// afirma que uma coisa MUDOU, espera-se pela mudança.
await page.waitForFunction(
  () => getComputedStyle(document.body).backgroundColor === "rgb(1, 2, 3)",
  null, { timeout: 20000 }).catch(() => {});
const corNova = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
chk("apanha a versão nova sem reinstalar", corNova === "rgb(1, 2, 3)", `cor=${corNova} (era ${corInicial})`);
chk("a cache antiga foi limpa",
  (await page.evaluate(() => caches.keys())).join(",") === "foodboxd-v999",
  (await page.evaluate(() => caches.keys())).join(","));

// ---- caso 2: com uma folha aberta -> espera ----
// Recarregar antes de começar: o reload do caso 1 pode deixar a página sem
// controller no momento em que o script corre, e aí a app suprime o reload
// seguinte de propósito (trata-o como primeira instalação). Este passo põe o
// ensaio no mesmo estado de quem já tem a app aberta há algum tempo.
await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 45000 });
patch.set("css/style.css", css.replace("--bg: #f6f1e7;", "--bg: rgb(4, 5, 6);"));
patch.set("sw.js", sw.replace(/foodboxd-v\d+/, "foodboxd-v1000"));
await page.evaluate(() => document.getElementById("filters-sheet").classList.remove("hidden"));
await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
// Esperar pelo sinal real — a app marca no <html> que tem uma versão à espera
// — em vez de contar segundos. Sem isto o ensaio corre com o browser e falha
// por corrida, não por defeito: já apanhei uma passagem e uma falha seguidas.
// Este `await` estava sem rede: quando esgotava, rebentava com um traço de
// pilha em vez de uma linha de FALHA. Apanhei-o uma vez em dez, a parar com
// exatamente 3 PASS — e não o voltei a reproduzir em seis corridas, por isso
// não digo que está resolvido, digo que está **domado**.
//
// E o que ele escondia era pior do que o traço de pilha: se o sinal não
// chegasse, a afirmação seguinte — "não recarrega com uma folha aberta" —
// **passava por engano**, porque a cor continuava a ser a antiga por não ter
// havido atualização nenhuma para travar. Um verde a dizer o contrário do que
// mede. Por isso o sinal passa a ser uma afirmação com nome.
const pendenteChegou = await page.waitForFunction(
  () => document.documentElement.dataset.atualizacaoPendente === "1",
  null, { timeout: 60000 }).then(() => true).catch(() => false);
chk("a versão nova fica à espera enquanto a folha está aberta", pendenteChegou,
  "o sinal atualizacaoPendente não chegou em 60s — sem ele, a afirmação seguinte não mede nada");
// Aqui a espera por tempo É a certa, e fica de propósito: o que se afirma é que
// a cor **não** mudou. Não há condição por que esperar — esperar por uma
// não-mudança é dar-lhe tempo para acontecer e ver que não aconteceu. A gate
// verdadeira é o `atualizacaoPendente` acima, que garante que a versão nova já
// está à porta; se ela entrasse, entrava dentro deste tempo.
await page.waitForTimeout(1500);
const corComFolha = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
chk("não recarrega com uma folha aberta", corComFolha === "rgb(1, 2, 3)", `cor=${corComFolha}`);

// ---- fecha a folha e a app volta à frente -> aí sim ----
// O contrato real da app é este: recarrega quando VOLTA À FRENTE e já está
// livre. Fechar a folha sozinho não dispara nada — é o visibilitychange que o
// faz, e é isso que se simula aqui em vez de chamar a função à mão.
const recarregou2 = page.waitForEvent("load", { timeout: 60000 });
await page.evaluate(() => document.getElementById("filters-sheet").classList.add("hidden"));
await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await recarregou2.catch(() => {});
// Idem: afirma-se uma mudança, espera-se pela mudança.
await page.waitForFunction(
  () => getComputedStyle(document.body).backgroundColor === "rgb(4, 5, 6)",
  null, { timeout: 20000 }).catch(() => {});
const corDepois = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
chk("recarrega quando volta à frente já sem a folha", corDepois === "rgb(4, 5, 6)", `cor=${corDepois}`);

// ---- caso 3: o convite de sessão NÃO pode bloquear atualizações ----
// Ele abre-se sozinho a quem não tem sessão e ninguém o fecha. Enquanto contava
// como "ocupado", a app ficava ocupada para sempre: quem chegasse sem sessão
// nunca mais recebia uma versão nova. Distingue-se de uma folha aberta, que é
// trabalho a decorrer de verdade — essa continua a suspender o recarregamento.
await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 45000 });
patch.set("css/style.css", css.replace("--bg: #f6f1e7;", "--bg: rgb(7, 8, 9);"));
patch.set("sw.js", sw.replace(/foodboxd-v\d+/, "foodboxd-v1001"));
const recarregou3 = page.waitForEvent("load", { timeout: 60000 });
await page.evaluate(() => document.getElementById("signin-modal").classList.remove("hidden"));
// Esperar pela COR nova, não por 1500 ms — e, antes dela, pela MARCA que a
// própria app expõe (`atualizacaoPendente`), que é o sinal de que o SW novo
// assumiu. A versão só-com-cor voltou a falhar no CI a 25/08 com o mesmo
// cor=rgb(4, 5, 6) da oitava lição: o update() é um pedido, não uma garantia,
// e num runner lento pode não apanhar o SW novo à primeira. Repete-se o
// pedido até a marca aparecer (3 tentativas), e o chk final imprime a marca
// e o estado do SW quando falha — o próximo vermelho no CI conta a história
// completa em vez de uma cor órfã.
for (let tentativa = 0; tentativa < 3; tentativa++) {
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  const marcou = await page.waitForFunction(
    () => document.documentElement.dataset.atualizacaoPendente === "1" ||
          getComputedStyle(document.body).backgroundColor === "rgb(7, 8, 9)",
    null, { timeout: 10000 }).then(() => true).catch(() => false);
  if (marcou) break;
}
await recarregou3.catch(() => {});
await page.waitForFunction(
  () => getComputedStyle(document.body).backgroundColor === "rgb(7, 8, 9)",
  null, { timeout: 20000 }).catch(() => {});
const estado3 = await page.evaluate(async () => ({
  cor: getComputedStyle(document.body).backgroundColor,
  marca: document.documentElement.dataset.atualizacaoPendente || null,
  sw: await navigator.serviceWorker.getRegistration().then((r) =>
    r ? { installing: !!r.installing, waiting: !!r.waiting, active: !!r.active } : null)
}));
chk("o convite de sessão não trava a atualização", estado3.cor === "rgb(7, 8, 9)",
  JSON.stringify(estado3));

await browser.close();
srv.close();
console.log(falhas ? `\n${falhas} falha(s)` : "\natualização automática: funciona");
process.exit(falhas ? 1 : 0);
