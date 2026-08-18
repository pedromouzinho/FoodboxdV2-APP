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
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
chk("service worker assume o controlo", true);

// Segunda abertura: na PRIMEIRA instalação não há controller e o reload é
// deliberadamente suprimido (não há versão anterior para substituir). É a
// partir da segunda abertura que uma atualização deve ser apanhada — que é
// exatamente a situação de quem já tem a app no ecrã principal.
await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
const corInicial = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

// ---- "publica-se" uma versão nova: CSS diferente + CACHE novo ----
const css = (await readFile(join(ROOT, "css/style.css"))).toString();
patch.set("css/style.css", css.replace("--bg: #f6f1e7;", "--bg: rgb(1, 2, 3);"));
const sw = (await readFile(join(ROOT, "sw.js"))).toString();
patch.set("sw.js", sw.replace(/foodboxd-v\d+/, "foodboxd-v999"));

// ---- caso 1: app livre -> apanha sozinha ----
const recarregou = page.waitForEvent("load", { timeout: 20000 });
await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
await recarregou.catch(() => {});
await page.waitForTimeout(1200);
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
await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
patch.set("css/style.css", css.replace("--bg: #f6f1e7;", "--bg: rgb(4, 5, 6);"));
patch.set("sw.js", sw.replace(/foodboxd-v\d+/, "foodboxd-v1000"));
await page.evaluate(() => document.getElementById("filters-sheet").classList.remove("hidden"));
await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
// Esperar pelo sinal real — a app marca no <html> que tem uma versão à espera
// — em vez de contar segundos. Sem isto o ensaio corre com o browser e falha
// por corrida, não por defeito: já apanhei uma passagem e uma falha seguidas.
await page.waitForFunction(() => document.documentElement.dataset.atualizacaoPendente === "1",
  null, { timeout: 20000 });
await page.waitForTimeout(1500);
const corComFolha = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
chk("não recarrega com uma folha aberta", corComFolha === "rgb(1, 2, 3)", `cor=${corComFolha}`);

// ---- fecha a folha e a app volta à frente -> aí sim ----
// O contrato real da app é este: recarrega quando VOLTA À FRENTE e já está
// livre. Fechar a folha sozinho não dispara nada — é o visibilitychange que o
// faz, e é isso que se simula aqui em vez de chamar a função à mão.
const recarregou2 = page.waitForEvent("load", { timeout: 25000 });
await page.evaluate(() => document.getElementById("filters-sheet").classList.add("hidden"));
await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await recarregou2.catch(() => {});
await page.waitForTimeout(1200);
const corDepois = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
chk("recarrega quando volta à frente já sem a folha", corDepois === "rgb(4, 5, 6)", `cor=${corDepois}`);

await browser.close();
srv.close();
console.log(falhas ? `\n${falhas} falha(s)` : "\natualização automática: funciona");
process.exit(falhas ? 1 : 0);
