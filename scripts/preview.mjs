// Abre a app num Chromium — telemóvel e ecrã grande, em claro e escuro — e
// reporta o que as verificações de sintaxe não conseguem ver.
//
//   node scripts/preview.mjs                    (serve ./ e usa localhost)
//   node scripts/preview.mjs <url>              (um canal de QA, por exemplo)
//
// Nasceu de um erro real: uma consolidação de CSS fundiu a lista de seletores
// do chip com o corpo da regra do ponto de cor. O ficheiro continuou válido —
// chavetas certas, zero duplicados, zero tokens indefinidos — e todos os chips
// da app passaram a pontos de 8px. Nenhum verificador estático apanha isso.
// Só se vê a abrir a app. É para isso que este ficheiro existe.
//
// A passagem de ecrã grande nasceu do mesmo tipo de erro: todos os arneses
// corriam só em iPhone, e o desktop ficou meses com a barra de separadores
// meia fora do ecrã sem ninguém dar por isso. Verificar só uma largura é
// verificar só metade da app.

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
      let body = await readFile(file);
      if (SAFE && file.endsWith("style.css")) {
        body = body.toString()
          .replaceAll("env(safe-area-inset-top)", SAFE.top)
          .replaceAll("env(safe-area-inset-bottom)", SAFE.bottom);
      }
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

// PWA_SAFE=1 substitui os env(safe-area-inset-*) por valores reais de iPhone
// com notch: é a única forma de reproduzir aqui a geometria da app instalada,
// onde a barra de separadores e o ecrã têm de encaixar ao pixel.
const SAFE = process.env.PWA_SAFE ? { top: "59px", bottom: "34px" } : null;

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

// Duas larguras: o telemóvel, que é a camada base, e um ecrã grande, onde as
// regras de desktop vivem e onde nunca ninguém tinha olhado.
const VISTAS = [
  { nome: "telemovel", opts: devices["iPhone 13 Pro"] },
  { nome: "desktop", opts: { viewport: { width: 1440, height: 900 } } }
];

for (const vista of VISTAS)
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ ...vista.opts, colorScheme: scheme });
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
  await page.screenshot({ path: join(OUT, `${vista.nome}-${scheme}-app.png`) });

  // Os modais não abrem sem sessão iniciada, por isso força-se o estado.
  // O ecrã de sessão entrou na lista quando passou a ter duas opções: é o que
  // a App Review olha para a diretriz 4.8, e não estava a ser visto por ninguém.
  for (const id of ["signin-modal", "add-restaurant-modal", "ai-modal", "profile-modal", "people-modal"]) {
    const abriu = await page.evaluate((i) => {
      const m = document.getElementById(i);
      if (!m) return false;
      document.querySelectorAll(".modal").forEach((x) => x.classList.add("hidden"));
      m.classList.remove("hidden");
      return true;
    }, id);
    if (!abriu) continue;
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, `${vista.nome}-${scheme}-${id}.png`) });
  }

  const a = await page.evaluate(AUDIT);
  console.log(`\n[${vista.nome} · ${scheme}]  corpo: ${a.corpo}`);
  if (vista.nome === "desktop") {
    // As duas afirmações que teriam apanhado a captura que deu origem a isto:
    // a pastilha da barra tinha `left: 0` da regra base e `translateX(-50%)`
    // da regra de desktop, e ficava meia fora do ecrã à esquerda.
    const d = await page.evaluate(() => {
      const box = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
      const barra = box(".tabbar");
      const mapa = box("#map");
      return {
        centroBarra: barra ? Math.round(barra.left + barra.width / 2) : null,
        centroJanela: Math.round(innerWidth / 2),
        largura: document.documentElement.scrollWidth,
        janela: innerWidth,
        alturaMapa: mapa ? Math.round(mapa.height) : null,
        duasColunas: !document.querySelector(".map-area").hidden && !document.querySelector(".list-pane").hidden
      };
    });
    if (d.centroBarra === null || Math.abs(d.centroBarra - d.centroJanela) > 1) {
      bloqueadores++;
      console.log(`  ERRO — barra descentrada: centro em ${d.centroBarra}, janela em ${d.centroJanela}`);
    } else console.log("  barra de separadores: centrada");
    if (d.largura > d.janela) {
      bloqueadores++;
      console.log(`  ERRO — transbordo horizontal: ${d.largura}px numa janela de ${d.janela}px`);
    } else console.log("  sem transbordo horizontal");
    // Relatório, não bloqueador: o mapa não desenha sem rede, mas a altura do
    // contentor diz se o espaço existe ou se o problema é de layout.
    console.log(`  #map: ${d.alturaMapa}px de altura · duas colunas: ${d.duasColunas ? "sim" : "NÃO"}`);
    if (!d.duasColunas) bloqueadores++;
  }
  if (SAFE && vista.nome === "telemovel") {
    // A moldura tem de encaixar: o ecrã acaba exatamente onde a barra começa.
    const m = await page.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect()[s === ".tabbar" ? "top" : "bottom"]) : null; };
      return { ecra: r("#screen-mapa"), barra: r(".tabbar") };
    });
    if (m.ecra !== null && m.barra !== null && m.ecra !== m.barra) {
      bloqueadores++;
      console.log(`  ERRO — moldura desencaixada: ecrã acaba em ${m.ecra}, barra começa em ${m.barra}`);
    } else console.log("  moldura da PWA: encaixa");
  }
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
