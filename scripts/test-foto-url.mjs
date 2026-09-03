// A tradução do URL da foto (npm run test:foto-url). Node puro, sem browser.
//
// Mede a função `foto` das Cloud Functions: recebe um URL do Places que morre
// em dias e devolve o `lh3` para onde ele redireciona, que dura e é livre.
//
// Node puro e não um caso do test:fotos porque o que está em causa é o
// contrato de rede da função — que cabeçalho lê, o que aceita e o que recusa.
// Um browser não acrescentava nada, e o CORS impedia-o de sequer tentar.
//
// A LISTA BRANCA É METADE DO ENSAIO. Esta função busca um URL escolhido pelo
// cliente; sem prefixo obrigatório era uma porta para a rede interna do
// projeto — os metadados da instância, o Firestore por dentro (SSRF).
//
// E a primeira versão destes casos era um FALSO VERDE, apanhado a correr contra
// a função sem lista branca: dois dos três continuaram verdes. Os URLs
// recusados apontavam para FORA, portanto o pedido — quando acontecia — nunca
// chegava a este servidor e o contador não o via; e o "devolve null" passava
// porque um endereço inalcançável também dá null, pela razão errada. Agora o
// URL de controlo aponta para AQUI e responde com um 302 válido: sem lista
// branca, a função devolve-o e o contador conta. Vermelho nos três.
import { createServer } from "node:http";

let falhas = 0;
const chk = (nome, ok, extra = "") => {
  console.log((ok ? "PASS " : "FALHA ") + nome + (ok ? "" : "  " + extra));
  if (!ok) falhas++;
};

// A Google a fingir: o GetPhoto responde 302 para o lh3, como o real (medido
// a 03/09/2026 — 302 com Location, e o lh3 a servir 155 688 bytes de JPEG).
let pedidos = 0;
const srv = createServer((rq, rs) => {
  pedidos++;
  if (rq.url.startsWith("/mau-destino")) {
    rs.writeHead(302, { Location: "https://exemplo-mau.test/roubado" });
    return rs.end();
  }
  rs.writeHead(302, { Location: "https://lh3.googleusercontent.com/place-photos/FAKE=s1600-w800" });
  rs.end();
});
await new Promise((ok) => srv.listen(8809, "127.0.0.1", ok));

const { __testFoto } = await import("../functions/index.js");
const { resolverFoto, FOTO_ORIGEM, FOTO_DESTINO } = __testFoto;

const BOM = "https://maps.googleapis.com/maps/api/place/js/PhotoService.GetPhoto?1sABC";
// O primeiro aponta para ESTE servidor de propósito: é o único que consegue
// provar que a recusa é real, porque um pedido a ele é visível daqui.
const MAUS = [
  ["http://127.0.0.1:8809/nao-devia-ser-buscado", "um endereço local (o controlo)"],
  ["http://169.254.169.254/latest/meta-data/", "metadados da instância"],
  ["http://127.0.0.1:8080/v1/projects/x/databases/(default)/documents/userData/alguem", "o Firestore por dentro"],
  ["file:///etc/passwd", "um ficheiro do disco"],
  ["https://maps.googleapis.com.exemplo-mau.test/maps/api/place/js/PhotoService.GetPhoto?x", "um domínio parecido"],
  ["https://maps.googleapis.com/maps/api/geocode/json?address=x", "outro endpoint da Google"],
  ["", "vazio"],
  [null, "nulo"]
];

// ---- 1 · a expressão ------------------------------------------------------
const passou = MAUS.filter(([u]) => FOTO_ORIGEM.test(String(u))).map(([, n]) => n);
chk("a lista branca recusa tudo o que não é um GetPhoto da Google",
  passou.length === 0, `deixou passar: ${passou.join(", ")}`);
chk("e aceita o GetPhoto a sério", FOTO_ORIGEM.test(BOM));

// ---- 2 · o comportamento: recusa, e não chega a buscar ---------------------
pedidos = 0;
const saidas = await Promise.all(MAUS.map(([u]) => resolverFoto(u)));
const naoNulos = saidas.map((r, i) => (r === null ? null : MAUS[i][1])).filter(Boolean);
chk("um URL recusado devolve null", naoNulos.length === 0, `devolveram URL: ${naoNulos.join(", ")}`);
chk("e NUNCA chega a ser buscado", pedidos === 0, `este servidor recebeu ${pedidos} pedido(s)`);

// ---- 3 · o destino também é verificado ------------------------------------
// Se a Google — ou alguém pelo caminho — redirecionar para outro sítio, esse
// URL não pode ser guardado: ia parar à cache partilhada, que todos leem.
chk("o destino tem de ser o lh3", FOTO_DESTINO.test("https://lh3.googleusercontent.com/place-photos/X"));
chk("e um destino estranho é recusado", !FOTO_DESTINO.test("https://exemplo-mau.test/roubado"));

srv.close();
console.log(falhas ? `\ntradução do URL da foto: ${falhas} FALHA(S)` : "\ntradução do URL da foto: tudo verde");
process.exit(falhas ? 1 : 0);
