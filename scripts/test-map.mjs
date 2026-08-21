// Prova o enquadramento do mapa sem a chave da Google (npm run test:map).
//
// Com uma Google Maps a fingir — só o suficiente para o MapModule se considerar
// disponível e registar o que lhe pedem — verifica que:
//   · abre enquadrado nos sítios, uma só vez;
//   · mudar de filtro NÃO re-enquadra (senão o mapa saltava das mãos);
//   · recentrar volta a enquadrar;
//   · um só sítio trava o zoom em 14;
//   · zero sítios não rebenta e cai no resetView.
//
// Sem isto, o enquadramento só se conseguia verificar no telemóvel.
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

// Google Maps a fingir, só o suficiente para o MapModule se considerar
// disponível e registar o que lhe pedem. É a única forma de provar o
// enquadramento sem a chave real.
await p.addInitScript(() => {
  window.__fit = [];
  window.__zoom = 9;
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
});
// O bootstrap carrega o script da Google e só depois chama initApp. Sem rede,
// isso falha e o mapa fica indisponível — por isso responde-se ao pedido com um
// script que chama o callback, como a Google faria.
await p.route("https://maps.googleapis.com/**", (route) =>
  route.fulfill({ status: 200, contentType: "application/javascript", body: "window.initApp && window.initApp();" }));
await p.goto("http://127.0.0.1:8803/index.html",{waitUntil:"domcontentloaded",timeout:30000});
await p.waitForTimeout(3000);
const r = await p.evaluate(()=>({ fits: window.__fit, zoom: window.__zoom }));
console.log("chamadas a fitBounds:", r.fits.length);
console.log("enquadramento:", r.fits[0]);
// mudar de filtro não deve re-enquadrar
await p.click("#filters-btn"); await p.waitForTimeout(300);
await p.click('#category-filters .chip[data-category="portuguesa"]'); await p.waitForTimeout(400);
console.log("depois de filtrar, chamadas:", (await p.evaluate(()=>window.__fit.length)));
// recentrar deve enquadrar outra vez
await p.click("#filters-apply"); await p.waitForTimeout(300);
await p.click("#map-recenter-btn"); await p.waitForTimeout(300);
console.log("depois de recentrar, chamadas:", (await p.evaluate(()=>window.__fit.length)));
// um só sítio: o zoom tem de ser travado, senão o fitBounds mergulha na rua
await p.evaluate(()=>{ window.__fit=[]; window.__zoom=21; });
await p.click("#filters-btn"); await p.waitForTimeout(200);
await p.fill("#search-input","Monte"); await p.waitForTimeout(400);
await p.click("#filters-apply"); await p.waitForTimeout(200);
await p.click("#map-recenter-btn"); await p.waitForTimeout(400);
console.log("um só sítio — enquadrou:", (await p.evaluate(()=>window.__fit.length))===1,
            "| zoom travado em:", await p.evaluate(()=>window.__zoom));
// zero resultados: não pode rebentar, e cai no resetView
await p.fill("#search-input","zzznadaaqui"); await p.waitForTimeout(400);
await p.evaluate(()=>{ window.__fit=[]; });
await p.click("#map-recenter-btn"); await p.waitForTimeout(300);
console.log("zero sítios — sem fitBounds:", (await p.evaluate(()=>window.__fit.length))===0,
            "| zoom do resetView:", await p.evaluate(()=>window.__zoom));
await b.close(); srv.close();
