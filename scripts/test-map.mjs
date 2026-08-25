// Prova o enquadramento do mapa sem a chave da Google (npm run test:map).
//
// Com uma Google Maps a fingir — só o suficiente para o MapModule se considerar
// disponível e registar o que lhe pedem — verifica que:
//   · abre enquadrado NA ZONA (um outlier em Barcelona não estica o mapa até
//     à Península inteira — era o defeito medido na app real a 25/08);
//   · os pins entram no clusterer quando a lib está presente;
//   · mudar de filtro NÃO re-enquadra (senão o mapa saltava das mãos);
//   · recentrar volta a enquadrar;
//   · um só sítio trava o zoom em 14;
//   · zero sítios não rebenta e cai no resetView.
//
// Este arnês IMPRIMIA em vez de afirmar — saía com 0 mesmo com o enquadramento
// errado, e o CLAUDE.md mandava comparar os números à mão. Passou a afirmar a
// 25/08: cada número-chave é um chk com nome, e o exit é não-zero na falha.
import { chromium, devices } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
const T={".html":"text/html",".css":"text/css",".js":"text/javascript",".json":"application/json",".webmanifest":"application/manifest+json",".svg":"image/svg+xml",".png":"image/png"};
const srv=createServer(async(rq,rs)=>{const p=rq.url.split("?")[0];const f=join(process.cwd(),p==="/"?"index.html":p);
  try{const b=await readFile(f);rs.writeHead(200,{"Content-Type":T[extname(f)]||"application/octet-stream"});rs.end(b);}catch{rs.writeHead(404).end("x");}});
await new Promise(ok=>srv.listen(8803,"127.0.0.1",ok));
const b=await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const c=await b.newContext({...devices["iPhone 13 Pro"]});
const p=await c.newPage(); p.setDefaultTimeout(4000);

let falhas = 0;
const chk = (nome, ok, extra = "") => {
  console.log((ok ? "PASS " : "FALHA ") + nome + (ok ? "" : "  " + extra));
  if (!ok) falhas++;
};

// O convite de sessão abre-se sozinho a quem não tem sessão, e o scrim dele
// intercepta os cliques deste ensaio — todas as cenas morriam em timeout. Só
// aparece se `FirebaseAuth.configured`, ou seja, se o SDK tiver vindo do
// gstatic: sem rede à Google não abre e o ensaio passa por acidente. Mesma
// dependência de ambiente que saiu do test-update.
await p.addInitScript(() => {
  try { sessionStorage.setItem("rp.signinPrompt", "off"); } catch (e) {}
  // Desarma o vigia do portão: este ensaio mede o enquadramento do mapa, e num
  // ambiente sem rede à Google a entrada levantava-se aos 6s sobre a cena.
  window.__semPortao = true;
  // O OUTLIER: um restaurante local em Barcelona, semeado como a app o
  // guardaria. É a razão de ser do fitToZone — o defeito era o fitBounds
  // esticar até ele e abrir a Península inteira.
  try {
    localStorage.setItem("portugalRestaurants.custom", JSON.stringify([{
      id: "outlier-bcn", name: "Outlier Barcelona", town: "Barcelona",
      region: "Espanha", country: "Espanha", category: "tradicional",
      lat: 41.3874, lng: 2.1686, tags: ["tradicional"], mapsQuery: "x", source: "custom"
    }]));
  } catch (e) {}
});

// Google Maps a fingir, só o suficiente para o MapModule se considerar
// disponível e registar o que lhe pedem. É a única forma de provar o
// enquadramento sem a chave real. O clusterer falso conta os pins que recebe.
await p.addInitScript(() => {
  window.__fit = [];
  window.__zoom = 9;
  window.__cluster = 0;
  const LatLng = function(lat,lng){ this.lat=()=>lat; this.lng=()=>lng; };
  const Bounds = function(sw,ne){ this.sw=sw; this.ne=ne; };
  window.google = { maps: {
    LatLng, LatLngBounds: Bounds,
    Map: function(){ return {
      fitBounds:(bnds,pad)=>{ window.__fit.push({
        south:bnds.sw.lat(), west:bnds.sw.lng(), north:bnds.ne.lat(), east:bnds.ne.lng(), pad }); },
      setCenter:()=>{}, setZoom:(z)=>{window.__zoom=z;}, getZoom:()=>window.__zoom,
      panTo:()=>{}, getCenter:()=>new LatLng(0,0), getBounds:()=>new Bounds(new LatLng(0,0),new LatLng(1,1))
    };},
    Marker: function(){ return { setMap:()=>{}, addListener:()=>{}, setAnimation:()=>{}, setIcon:()=>{}, setZIndex:()=>{} };},
    InfoWindow: function(){ return { open:()=>{}, close:()=>{}, setContent:()=>{} };},
    DirectionsService: function(){ return {};},
    DirectionsRenderer: function(){ return { setDirections:()=>{} };},
    Size: function(){}, Point: function(){}, Animation:{BOUNCE:1},
    event: { addListenerOnce:(o,e,cb)=>{ setTimeout(cb,10); }, trigger:()=>{} },
    places: { PlacesService: function(){ return { textSearch:()=>{}, getDetails:()=>{}, findPlaceFromQuery:()=>{} };}, PlacesServiceStatus:{OK:"OK"} },
    Geocoder: function(){ return { geocode:()=>{} };}, GeocoderStatus:{OK:"OK"}
  }};
  window.__clusterHist = [];
  window.markerClusterer = {
    MarkerClusterer: function (opts) {
      window.__cluster = (opts && opts.markers ? opts.markers.length : 0);
      window.__clusterHist.push(window.__cluster);
      return {
        clearMarkers: () => {},
        addMarkers: (ms) => { window.__cluster = ms.length; window.__clusterHist.push(ms.length); },
        setMap: () => {}
      };
    }
  };
});
// O bootstrap carrega o script da Google e só depois chama initApp. Sem rede,
// isso falha e o mapa fica indisponível — por isso responde-se ao pedido com um
// script que chama o callback, como a Google faria.
await p.route("https://maps.googleapis.com/**", (route) =>
  route.fulfill({ status: 200, contentType: "application/javascript", body: "window.initApp && window.initApp();" }));
// O clusterer real vem de CDN; aqui já há um falso e o pedido nem deve pesar.
await p.route("https://unpkg.com/**", (route) =>
  route.fulfill({ status: 200, contentType: "application/javascript", body: "/* stub */" }));
await p.goto("http://127.0.0.1:8803/index.html",{waitUntil:"domcontentloaded",timeout:30000});
await p.waitForTimeout(3000);

// O ecrã de entrada tapa tudo enquanto não houver sessão, e este ensaio não tem
// como iniciar uma. O que se mede é o ENQUADRAMENTO, que não depende de sessão.
await p.evaluate(()=>{
  const e=document.getElementById("entrada");
  if(e) e.hidden=true;
  document.body.classList.remove("sem-sessao");
});
const r = await p.evaluate(()=>({ fits: window.__fit, zoom: window.__zoom, cluster: window.__cluster }));
console.log("enquadramento:", JSON.stringify(r.fits[0]));
chk("abre com UM fitBounds", r.fits.length === 1, `foram ${r.fits.length}`);
// O número que apanha o defeito: com o outlier em Barcelona (lng 2.17) e o
// fitBounds antigo, o span de longitude era ~11 graus. A zona certa (Portugal
// continental) cabe em <6.
const span0 = r.fits.length ? Math.abs(r.fits[0].east - r.fits[0].west) : 999;
chk("o enquadramento ignora o outlier (span de longitude < 6°)", span0 < 6,
  `span=${span0.toFixed(2)}° — leste=${r.fits.length ? r.fits[0].east.toFixed(2) : "?"}`);
// Neste arnês a lista são os 10 curados + o outlier (o CONFIG dá-se como
// emulador em localhost e o fetchAll cai num emulador que não há → 0 da
// comunidade). Compara-se ao contador REAL do ecrã, não a um número sonhado —
// foi assim que a primeira versão desta afirmação exigiu >60 pins de uma
// produção que nunca esteve cá.
const nDaLista = await p.evaluate(() =>
  parseInt((document.getElementById("list-count") || {}).textContent || "0", 10));
chk("os pins entram todos no clusterer", r.cluster === nDaLista && r.cluster > 0,
  `cluster=${r.cluster} lista=${nDaLista} hist=${await p.evaluate(() => JSON.stringify(window.__clusterHist))}`);

// mudar de filtro não deve re-enquadrar
await p.click("#filters-btn"); await p.waitForTimeout(300);
await p.click('#category-filters .chip[data-category="portuguesa"]'); await p.waitForTimeout(400);
chk("filtrar não re-enquadra", (await p.evaluate(()=>window.__fit.length)) === 1,
  `chamadas=${await p.evaluate(()=>window.__fit.length)}`);
// recentrar deve enquadrar outra vez
await p.click("#filters-apply"); await p.waitForTimeout(300);
await p.click("#map-recenter-btn"); await p.waitForTimeout(300);
chk("recentrar re-enquadra", (await p.evaluate(()=>window.__fit.length)) === 2,
  `chamadas=${await p.evaluate(()=>window.__fit.length)}`);
// um só sítio: o zoom tem de ser travado, senão o fitBounds mergulha na rua
await p.evaluate(()=>{ window.__fit=[]; window.__zoom=21; });
await p.click("#filters-btn"); await p.waitForTimeout(200);
await p.fill("#search-input","Monte"); await p.waitForTimeout(400);
await p.click("#filters-apply"); await p.waitForTimeout(200);
await p.click("#map-recenter-btn"); await p.waitForTimeout(400);
chk("um só sítio enquadra uma vez", (await p.evaluate(()=>window.__fit.length)) === 1);
chk("… com o zoom travado em 14", (await p.evaluate(()=>window.__zoom)) === 14,
  `zoom=${await p.evaluate(()=>window.__zoom)}`);
// zero resultados: não pode rebentar, e cai no resetView
await p.fill("#search-input","zzznadaaqui"); await p.waitForTimeout(400);
await p.evaluate(()=>{ window.__fit=[]; });
await p.click("#map-recenter-btn"); await p.waitForTimeout(300);
chk("zero sítios não chama fitBounds", (await p.evaluate(()=>window.__fit.length)) === 0);
chk("… e o resetView põe o zoom a 9", (await p.evaluate(()=>window.__zoom)) === 9,
  `zoom=${await p.evaluate(()=>window.__zoom)}`);

await b.close(); srv.close();
console.log(falhas ? `\nmapa: ${falhas} FALHA(S)` : "\nmapa: enquadra na zona, e só quando se pede");
process.exitCode = falhas ? 1 : 0;
