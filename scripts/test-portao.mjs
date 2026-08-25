// O portão de entrada (npm run test:portao).
//
// Mede UMA coisa: com a rede à Google em baixo, a app NÃO pode abrir sem
// sessão. Foi medido ao contrário em produção a 25/08/2026: com o gstatic
// bloqueado, o módulo do SDK do Firebase (import estático) morre em silêncio,
// o `firebase-auth-ready` nunca dispara, o `onAuthChange` nunca corre, e a
// app abria INTEIRA, com os restaurantes todos, sem ninguém ter entrado — o
// contrário do que a nota ao revisor da App Store diz. É o tipo de rede que
// existe: um hotel, um cativo, uma firewall de empresa.
//
// O ensaio serve a app localmente, BLOQUEIA tudo o que vá para
// gstatic.com/googleapis.com (à exceção do próprio servidor local), espera o
// prazo do vigia com folga, e afirma que o ecrã de entrada está de pé com o
// aviso e o botão de tentar de novo à vista.
//
// Este é o quinto arnês da família "depende da rede à Google" do CLAUDE.md —
// e é o único em que essa dependência é o PRÓPRIO objeto de medição, por isso
// bloqueia-a explicitamente por rota em vez de esperar que o ambiente a negue.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { chromium, devices } from "playwright";

const ROOT = resolve(import.meta.dirname, "..");
const PORT = 8806;
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
const ctx = await browser.newContext({ ...devices["iPhone 13 Pro"] });
// A rede à Google, em baixo — a de verdade, por rota, igual em todas as
// máquinas. abort("connectionfailed") imita o cativo/hotel.
await ctx.route(/gstatic\.com|googleapis\.com|google\.com/, (r) => r.abort("connectionfailed"));
const page = await ctx.newPage();
page.setDefaultTimeout(4000);

let falhas = 0;
const chk = (nome, ok, extra = "") => {
  console.log((ok ? "PASS " : "FALHA ") + nome + (ok ? "" : "  " + extra));
  if (!ok) falhas++;
};

await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });

// O vigia do portão tem um prazo próprio; espera-se pelo SINAL (o ecrã de
// entrada visível) com um teto folgado, nunca por segundos contados às cegas.
// Se o teto esgotar, o valor fica à vista na falha — a lição da oitava.
const apareceu = await page
  .waitForSelector("#entrada:not([hidden])", { timeout: 12000 })
  .then(() => true)
  .catch(() => false);
chk("sem rede à Google, o ecrã de entrada está de pé", apareceu,
  `#entrada hidden=${await page.evaluate(() => { const e = document.getElementById("entrada"); return e ? e.hidden : "sem elemento"; })}`);

const semSessao = await page.evaluate(() => document.body.classList.contains("sem-sessao"));
chk("a casca fica atrás do portão (body.sem-sessao)", semSessao === true);

const aviso = await page.evaluate(() => {
  const e = document.querySelector("#entrada [data-entrada-estado]");
  return e ? e.textContent.trim() : "";
});
chk("há um aviso a dizer que o serviço de contas não veio", aviso.length > 0, `estado: "${aviso}"`);

const botao = await page.evaluate(() => {
  const b = document.querySelector("#entrada [data-entrada-reload]");
  return b ? !b.hidden : false;
});
chk("e um botão de tentar de novo à vista", botao === true);

await browser.close();
srv.close();
console.log(falhas ? `\nportão: ${falhas} FALHA(S)` : "\nportão: fecha quando a Google não vem");
process.exitCode = falhas ? 1 : 0;
