// Abre a app num Chromium com viewport de iPhone, em claro e escuro, e reporta
// o que as verificações de sintaxe não conseguem ver.
//
//   node scripts/preview.mjs                    (serve ./ e usa localhost)
//   node scripts/preview.mjs <url>              (um canal de QA, por exemplo)
//
// Nasceu de um erro real: uma consolidação de CSS fundiu a lista de seletores
// do chip com o corpo da regra do ponto de cor. O ficheiro continuou válido —
// chavetas certas, zero duplicados, zero tokens indefinidos — e todos os chips
// da app passaram a pontos de 8px. Nenhum verificador estático apanha isso.
// Só se vê a abrir a app. É para isso que este ficheiro existe.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { chromium, devices } from "playwright";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, ".preview");
const PORT = 8788;
const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon"
};

function serve() {
  const s = createServer(async (req, res) => {
    const path = decodeURIComponent(req.url.split("?")[0]);
    const file = join(ROOT, path === "/" ? "index.html" : path);
    try {
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("404");
    }
  });
  return new Promise((ok) => s.listen(PORT, "127.0.0.1", () => ok(s)));
}

// Só as regras que se conseguem afirmar sem dados reais na app. Nada de
// aproximações: um falso alarme aqui custa mais do que a verificação vale.
const AUDIT = () => ({
  campos: [...document.querySelectorAll("input,textarea,select")]
    .map((e) => [e.id || e.name || e.type, getComputedStyle(e).fontSize])
    .filter(([, fs]) => parseFloat(fs) < 16),
  alvos: [...document.querySelectorAll("button,a,[role=button]")]
    .filter((e) => e.offsetParent !== null && e.getBoundingClientRect().width > 0)
    .map((e) => {
      const r = e.getBoundingClientRect();
      return [(e.className || e.tagName).toString().slice(0, 40), Math.round(r.width) + "x" + Math.round(r.height)];
    })
    .filter(([, d]) => d.split("x").map(Number).some((n) => n < 44)),
  corpo: getComputedStyle(document.body).fontSize
});

const arg = process.argv[2];
const server = arg ? null : await serve();
const url = arg || `http://127.0.0.1:${PORT}/index.html`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  ...(process.env.HTTPS_PROXY && arg ? { proxy: { server: process.env.HTTPS_PROXY } } : {})
});
// Bloqueadores param a verificação; alvos de toque são um relatório, porque a
// altura dos chips (36px) é uma decisão de design do handoff e não um descuido.
let bloqueadores = 0;

for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ ...devices["iPhone 13 Pro"], colorScheme: scheme });
  const page = await ctx.newPage();
  // Erros de JavaScript contam sempre. Falhas de rede a terceiros (Maps,
  // fontes, Firebase) não: numa máquina sem acesso a esses domínios seriam um
  // alarme falso constante, e não dizem nada sobre o código.
  const erros = new Set();
  const rede = new Set();
  page.on("pageerror", (e) => erros.add(String(e).slice(0, 200)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text().slice(0, 200);
    (/Failed to load resource|ERR_|net::/.test(t) ? rede : erros).add(t);
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, `${scheme}-app.png`) });

  // Os modais não abrem sem sessão iniciada, por isso força-se o estado.
  for (const id of ["add-restaurant-modal", "ai-modal", "profile-modal", "people-modal"]) {
    const abriu = await page.evaluate((i) => {
      const m = document.getElementById(i);
      if (!m) return false;
      document.querySelectorAll(".modal").forEach((x) => x.classList.add("hidden"));
      m.classList.remove("hidden");
      return true;
    }, id);
    if (!abriu) continue;
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, `${scheme}-${id}.png`) });
  }

  const a = await page.evaluate(AUDIT);
  console.log(`\n[${scheme}]  corpo: ${a.corpo}`);
  if (erros.size) { bloqueadores++; console.log("  ERRO de consola:"); [...erros].forEach((e) => console.log("   ", e)); }
  if (a.campos.length) { bloqueadores++; console.log("  ERRO — campos abaixo de 16px (o iOS amplia a página):", a.campos); }
  else console.log("  campos: todos a 16px ou mais");
  if (a.alvos.length) {
    // Mede-se a caixa do elemento. Chips e .mark-visit são 36px por desenho do
    // handoff e estendem a área de toque com um ::after — que isto não vê. Por
    // isso é relatório e não bloqueador: serve para nada passar despercebido.
    const tipos = [...new Set(a.alvos.map(([c, d]) => `${c.split(" ")[0]} (${d})`))];
    console.log(`  a rever — ${a.alvos.length} caixas abaixo de 44px:`, tipos.join(", "));
  }
  if (rede.size) console.log(`  (${rede.size} falhas de rede a terceiros, ignoradas)`);
  if (!erros.size && !a.campos.length) console.log("  sem bloqueadores");
  await ctx.close();
}

await browser.close();
server?.close();
console.log(`\nCapturas em ${OUT}`);
process.exit(bloqueadores ? 1 : 0);
