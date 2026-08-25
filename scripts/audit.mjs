// Auditoria profunda antes de produção (npm run audit).
//
// Percorre 17 cenas — todos os ecrãs, vistas e folhas — em claro e escuro, com
// um conjunto de dados realista injetado, e mede o que só se vê num browser:
// contraste real de cada nó de texto contra o fundo que está mesmo lá, alvos de
// toque, campos abaixo de 16px, nomes acessíveis, ids repetidos, transbordo
// horizontal e texto cortado.
//
// A diferença para uma auditoria de tokens: aqui compõem-se as camadas
// semi-transparentes e sobe-se a árvore até encontrar cor opaca. Foi assim que
// apareceu o "Mudar foto" a 1:1 — o --overlay-scrim existia só no bloco escuro,
// e em claro o botão ficava branco sobre a foto.
import { chromium, devices } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
const T={".html":"text/html",".css":"text/css",".js":"text/javascript",".json":"application/json",".webmanifest":"application/manifest+json",".svg":"image/svg+xml",".png":"image/png"};
// Este arnês serve o `js/config.js` com a chave do Maps vazia, de propósito.
//
// Sem isto dependem de a rede à Google falhar depressa: é o `onerror` do script
// que faz a app arrancar. Num contentor sem rede falha em milissegundos e tudo
// corre; num Mac com rede o script CARREGA e a Google recusa-o por referrer, o
// `onerror` nunca dispara, e os testes esgotam o tempo à espera de uma app que
// só arranca 10s depois. Testes verdes de um lado e vermelhos do outro, com o
// mesmo código.
//
// Com a chave vazia o `index.html` toma o ramo que já existe — arranca já, sem
// pedido nenhum à Google — e o resultado é o mesmo em qualquer máquina.
//
// (O `test-map.mjs` NÃO faz isto, e é de propósito: ele interceta o pedido e
// responde com um script que chama o `initApp`, para poder provar o
// enquadramento com o mapa a existir. Precisa da chave para o pedido acontecer.)
function semChaveDoMaps(corpo, ficheiro) {
  if (!ficheiro.endsWith("config.js")) return corpo;
  return corpo.toString().replace(/GOOGLE_MAPS_API_KEY:\s*"[^"]*"/, 'GOOGLE_MAPS_API_KEY: ""');
}

const srv=createServer(async(rq,rs)=>{const p=rq.url.split("?")[0];const f=join(process.cwd(),p==="/"?"index.html":p);
  try{const b=semChaveDoMaps(await readFile(f),f);rs.writeHead(200,{"Content-Type":T[extname(f)]||"application/octet-stream"});rs.end(b);}catch{rs.writeHead(404).end("x");}});
await new Promise(ok=>srv.listen(8799,"127.0.0.1",ok));

const SEED = () => {
  const amigos=[{uid:"a1",displayName:"Leonor Carvalho",photoURL:"",town:"Évora"},
                {uid:"a2",displayName:"Miguel",photoURL:"",town:"Porto"},
                {uid:"a3",displayName:"Rita Nunes Pereira da Silva",photoURL:"",town:"Faro"}];
  const seg=new Set(["a1","a2"]);
  const ids=window.__ids||[];
  const rat={};
  ids.slice(0,6).forEach((id,i)=>{rat[id]={stars:(i%5)+1,note:i%2?"Muito bom, voltamos. A açorda estava excelente e o serviço rápido.":"",
    dishes:i%3?["Açorda de marisco","Migas com entrecosto"]:[],updatedAt:`2026-0${(i%8)+1}-1${i}`};});
  Object.assign(UserData,{
    isCloud:()=>true, me:()=>({uid:"eu",displayName:"Pedro Mouzinho",photoURL:""}),
    others:()=>amigos, everyone:()=>[...amigos,{uid:"eu",displayName:"Pedro Mouzinho",photoURL:""}],
    getFollowing:()=>[...seg], isFollowing:(u)=>seg.has(u),
    follow:async(u)=>{seg.add(u);}, unfollow:async(u)=>{seg.delete(u);},
    isVisited:(i)=>ids.slice(0,4).includes(i), isPriority:(i)=>ids.slice(4,6).includes(i),
    getRating:(i)=>rat[i]||null, getHistory:(i)=>rat[i]?[{date:"2026-08-01",with:["a1"]}]:[],
    visitDate:(e)=>e.date, visitWith:(e)=>e.with||[],
    getTasteProfile:()=>({summary:"O teu gosto gravita em torno da cozinha portuguesa tradicional, com forte atração pelas tascas e petiscos do Alentejo.",
      cuisines:["portuguesa","mariscos"],dishes:["açorda","migas"],vibe:"informal",price:"€€"}),
    getGroups:()=>[{id:"g1",name:"Roadtrip Alentejo",code:"ABC123"}], getActiveGroupId:()=>null,
    getSharing:()=>({global:true,groupIds:[]}), visitedBy:()=>amigos.slice(0,2), priorityBy:()=>[],
    ratingsFor:()=>[{uid:"a1",stars:5},{uid:"a2",stars:4}]
  });
  DB.searchProfiles=async()=>amigos;
};

const CHECKS = () => {
  const out={contraste:[],alvos:[],campos:[],semNome:[],semAlt:[],idsRepetidos:[],transbordo:null,cortado:[]};
  const lum=(c)=>{const [r,g,b]=c;const f=(v)=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};return .2126*f(r)+.7152*f(g)+.0722*f(b);};
  // O color-mix() computa para color(srgb r g b / a), não para rgba() — e sem
  // isto qualquer fundo feito com color-mix era lido como inexistente.
  const parse=(s)=>{
    let m=s.match(/rgba?\(([^)]+)\)/);
    if(m){const p=m[1].split(/[,\s\/]+/).filter(Boolean).map(parseFloat);
      return {rgb:p.slice(0,3), a:p.length>3?p[3]:1};}
    m=s.match(/color\(srgb\s+([^)]+)\)/);
    if(m){const p=m[1].split(/[\s\/]+/).filter(Boolean).map(parseFloat);
      return {rgb:p.slice(0,3).map(v=>v*255), a:p.length>3?p[3]:1};}
    return null;
  };
  // Compõe as camadas semi-transparentes sobre o que está por trás, em vez de
  // as tratar como opacas: é assim que o olho as vê.
  const bgOf=(el)=>{
    const pilha=[];
    let n=el;
    while(n&&n!==document.documentElement){
      const c=parse(getComputedStyle(n).backgroundColor);
      if(c&&c.a>0){ pilha.push(c); if(c.a>=1) break; }
      n=n.parentElement;
    }
    const base=parse(getComputedStyle(document.body).backgroundColor);
    let out=(base&&base.a>=1)?base.rgb:[255,255,255];
    for(let i=pilha.length-1;i>=0;i--){
      const c=pilha[i];
      out=[0,1,2].map(k=>c.rgb[k]*c.a + out[k]*(1-c.a));
    }
    return out;
  };
  const ratio=(a,b)=>{const la=lum(a),lb=lum(b);return (Math.max(la,lb)+.05)/(Math.min(la,lb)+.05);};
  const vis=(el)=>{const r=el.getBoundingClientRect();return el.offsetParent!==null&&r.width>0&&r.height>0;};

  // texto real contra o fundo real
  document.querySelectorAll("body *").forEach((el)=>{
    if(!vis(el))return;
    const txt=[...el.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>n.textContent.trim()).join(" ");
    if(!txt)return;
    const cs=getComputedStyle(el);
    const fgc=parse(cs.color); if(!fgc||fgc.a<0.9)return; const fg=fgc.rgb;
    const r=ratio(fg,bgOf(el));
    const px=parseFloat(cs.fontSize), bold=parseInt(cs.fontWeight,10)>=700;
    const min=(px>=24||(px>=18.66&&bold))?3:4.5;
    if(r<min) out.contraste.push({txt:txt.slice(0,40),cls:(el.className||el.tagName).toString().slice(0,30),r:+r.toFixed(2),min,px});
  });
  document.querySelectorAll("button,a,[role=button],input,select,textarea").forEach((el)=>{
    if(!vis(el))return;
    const r=el.getBoundingClientRect();
    // A caixa do elemento NÃO é o alvo de toque quando há um ::after a esticá-lo.
    //
    // O `.linklike` da app faz exatamente isso: o texto tem 22px de altura e um
    // `::after` absoluto de 44px centrado por cima. Media-se a caixa e a lista
    // vinha cheia de "linklike 82x22" que não são defeito nenhum — e uma lista
    // com falsos positivos treina quem a lê a saltá-la, que é a maneira de um
    // alvo pequeno a sério passar despercebido.
    //
    // Mede-se o maior dos dois. Só conta se o pseudo estiver posicionado: um
    // ::after no fluxo não é área de toque, é conteúdo.
    let lw=r.width, lh=r.height;
    for (const pseudo of ["::after","::before"]) {
      const cs=getComputedStyle(el,pseudo);
      if(!cs || cs.content==="none" || cs.position==="static") continue;
      const pw=parseFloat(cs.width), ph=parseFloat(cs.height);
      if(pw>lw) lw=pw;
      if(ph>lh) lh=ph;
    }
    if(lw<44||lh<44) out.alvos.push({cls:(el.className||el.tagName).toString().slice(0,28),d:Math.round(lw)+"x"+Math.round(lh)});
    if(/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)&&parseFloat(getComputedStyle(el).fontSize)<16)
      out.campos.push(el.id||el.name||el.type);
    if(/^(BUTTON|A)$/.test(el.tagName)&&!el.textContent.trim()&&!el.getAttribute("aria-label")&&!el.getAttribute("title"))
      out.semNome.push((el.className||el.tagName).toString().slice(0,28));
  });
  document.querySelectorAll("img").forEach((el)=>{ if(vis(el)&&el.alt===null) out.semAlt.push(el.src.slice(-30)); });
  const seen=new Set();
  document.querySelectorAll("[id]").forEach((el)=>{ if(seen.has(el.id)) out.idsRepetidos.push(el.id); seen.add(el.id); });
  out.transbordo = document.documentElement.scrollWidth > document.documentElement.clientWidth
    ? document.documentElement.scrollWidth+" > "+document.documentElement.clientWidth : null;
  // texto cortado sem ellipsis
  document.querySelectorAll("body *").forEach((el)=>{
    if(!vis(el))return;
    const cs=getComputedStyle(el);
    if(el.scrollWidth>el.clientWidth+2 && cs.overflowX!=="auto" && cs.overflowX!=="scroll" && cs.textOverflow!=="ellipsis" && el.children.length===0)
      out.cortado.push({cls:(el.className||el.tagName).toString().slice(0,28),txt:el.textContent.trim().slice(0,30)});
  });
  return out;
};

const b=await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const problemas={contraste:new Map(),alvos:new Map(),campos:new Set(),semNome:new Set(),semAlt:new Set(),idsRepetidos:new Set(),transbordo:new Set(),cortado:new Map(),erros:new Set()};
const add=(m,k,v)=>{ if(!m.has(k)) m.set(k,v); };

for (const scheme of ["light","dark"]) {
  const c=await b.newContext({...devices["iPhone 13 Pro"],colorScheme:scheme});
  const p=await c.newPage();
  // O convite de sessão abre-se sozinho a quem não tem sessão e o scrim dele
  // intercepta todos os cliques — as 17 cenas de cada tema morriam em timeout.
  // Só aparece se `FirebaseAuth.configured`, ou seja, se o SDK tiver vindo do
  // gstatic: sem rede à Google não abre e a auditoria passava por acidente.
  // Sobrava do tempo em que o convite de sessão se dispensava por sessionStorage.
  // Esse caminho deixou de existir com o ecrã de entrada — fica aqui como
  // inofensivo em vez de dar a impressão de que ainda faz alguma coisa.
  // Sem isto, cada seletor ausente custa 30s e a auditoria nunca acaba.
  p.setDefaultTimeout(3000);
  p.on("pageerror",e=>problemas.erros.add(scheme+": "+String(e).slice(0,140)));
  p.on("console",m=>{if(m.type()==="error"&&!/Failed to load|ERR_|net::/.test(m.text()))problemas.erros.add(scheme+": "+m.text().slice(0,140));});
  await p.goto("http://127.0.0.1:8799/index.html",{waitUntil:"domcontentloaded",timeout:30000});
  await p.waitForTimeout(2600);
  await p.evaluate(()=>{const a=document.getElementById("ios-a2hs"); if(a) a.classList.add("hidden");});
  await p.evaluate(async()=>{ window.__ids=(await (await fetch("data/restaurants.json")).json()).map(r=>r.id); });
  await p.evaluate(SEED);

  const cenas=[
    // O ecrã de entrada é agora um ecrã como os outros e tem de ser auditado:
    // é o PRIMEIRO que qualquer pessoa vê, tem campos de texto (onde 16px não
    // é preferência — abaixo disso o iOS faz zoom ao focar) e tem o contraste
    // de um formulário sobre o fundo da marca.
    ["Entrada", async()=>{ await p.evaluate(()=>{
      const e=document.getElementById("entrada"); if(e) e.hidden=false;
      // Esconder a casca de verdade, e não só cobri-la: senão o audit media o
      // mapa e a tabbar por baixo e atribuía os alvos deles a esta cena — que
      // foi o que aconteceu à primeira, e dava a impressão de que o ecrã de
      // entrada tinha defeitos que não são dele.
      document.querySelectorAll(".topbar,.tabbar,.screen").forEach(x=>{ x.style.display="none"; });
    }); }],
    ["Entrada (criar conta)", async()=>{ await p.click('#entrada [data-entrada-modo]'); }],
    // E a partir daqui esconde-se, senão tapa tudo o resto.
    //
    // É um desvio deliberado e vale a pena dizer porquê: sem sessão a app agora
    // não deixa passar daqui, e o audit não tem como iniciar sessão. O que ele
    // mede — contraste, alvos, transbordo, ids repetidos — é do desenho dos
    // ecrãs, e esse não muda por haver ou não sessão. O que ele NÃO passa a
    // medir é o bloqueio em si; isso é o test:update e o simulador.
    ["Mapa (mapa)", async()=>{
      await p.evaluate(()=>{
        const e=document.getElementById("entrada"); if(e) e.hidden=true;
        document.body.classList.remove("sem-sessao");
        document.querySelectorAll(".topbar,.tabbar,.screen").forEach(x=>{ x.style.display=""; });
      });
      await p.click('[data-tab-nav="mapa"]'); await p.click('[data-map-mode="mapa"]');
    }],
    ["Mapa (lista)", async()=>{ await p.click('[data-map-mode="lista"]'); }],
    ["Filtros", async()=>{ await p.click("#filters-btn"); }],
    ["Filtros (expandido)", async()=>{ await p.click(".chip-more").catch(()=>{}); }],
    ["fechar filtros", async()=>{ await p.click("#filters-apply"); }],
    ["Diário · Restaurantes", async()=>{ await p.click('[data-tab-nav="diario"]'); }],
    ["Diário · Críticas", async()=>{ await p.click('[data-dview="criticas"]'); }],
    ["Diário · Pratos", async()=>{ await p.click('[data-dview="pratos"]'); }],
    ["Amigos", async()=>{ await p.click('[data-tab-nav="amigos"]'); }],
    ["Amigos · leaderboard", async()=>{ await p.click('[data-atab="leaderboard"]'); }],
    ["Perfil", async()=>{ await p.click('[data-tab-nav="perfil"]'); }],
    ["Seguir pessoas", async()=>{ await p.click('[data-perfil="pessoas"]'); }],
    ["fechar pessoas", async()=>{ await p.click(".sheet-close[data-close-people]"); }],
    // O TUTORIAL, passo a passo.
    //
    // Um passo cujo seletor não casa NÃO dá erro: o destaque desaparece, o balão
    // centra-se, e ninguém repara. Foi assim que dois dos cinco passos passaram
    // meses a apontar a separadores que já não existiam. Aqui percorre-se o
    // tutorial inteiro e afirma-se que cada passo com alvo destaca mesmo alguma
    // coisa — o primeiro é centrado de propósito e é o único isento.
    ["Tutorial", async()=>{
      await p.click('[data-tab-nav="perfil"]');
      await p.click('[data-perfil="tutorial"]');
      await p.waitForTimeout(400);
    }],
    ["Tutorial · todos os passos apontam a algo", async()=>{
      const r = await p.evaluate(async () => {
        const falhas = [];
        const hl = document.getElementById("tour-highlight");
        const total = document.querySelectorAll("#tour-dots .tour-dot").length;
        for (let i = 1; i < total; i++) {
          document.getElementById("tour-next").click();
          await new Promise((r) => setTimeout(r, 120));
          const visivel = hl && getComputedStyle(hl).display !== "none";
          if (!visivel) falhas.push(document.getElementById("tour-title").textContent);
        }
        return { falhas, total };
      });
      if (r.falhas.length) throw new Error("passos sem destaque: " + r.falhas.join(", "));
      // O tutorial esconde passos cujo alvo não existe — o "Pergunta-me"
      // desaparece quando o backend de IA não responde, e neste ensaio não
      // responde. Sem um mínimo, um seletor partido faria o passo desaparecer
      // em silêncio e a afirmação de cima passava na mesma.
      //
      // Seis é o que está sempre lá: boas-vindas + os quatro separadores + a
      // porta de adicionar.
      if (r.total < 6) throw new Error(`só ${r.total} passos — algum alvo deixou de existir`);
    }],
    ["fechar tutorial", async()=>{ await p.click("#tour .tour-x[data-tour-skip]"); }],

    ["Ficha (O sítio)", async()=>{ await p.click('[data-tab-nav="mapa"]'); await p.click('[data-map-mode="lista"]'); await p.click("#restaurant-list .card"); }],
    ["Ficha (experiência)", async()=>{ await p.click('[data-tab="experiencia"]'); }],
    ["Registar visita", async()=>{ await p.click("[data-open-visit-sheet]").catch(async()=>{ await p.click("[data-open-visit]"); }); }],
    // Pela PORTA, e não a forçar a classe.
    //
    // Antes fazia `classList.remove("hidden")` no modal, e por isso a auditoria
    // passava mesmo que o botão que o abre estivesse desligado — não havia
    // teste nenhum a cobrir a abertura. Clicar no "+" faz a cena falhar se a
    // porta se partir, que é metade do que este ensaio devia dizer.
    ["Adicionar (pela porta)", async()=>{
      await p.click(".visit-close[data-close-visit]");
      // A ficha fica aberta da cena anterior e tapa a barra de cima — o "+"
      // está lá, mas por baixo. Fechá-la é o que põe a porta ao alcance.
      await p.click(".detail-close[data-close-detail]");
      await p.waitForTimeout(300);
      await p.click("#add-open-btn");
    }],
    ["Adicionar · já fui", async()=>{ await p.click('#add-restaurant-modal [data-escolha="fui"]'); }],
  ];
  for (const [nome, agir] of cenas) {
    try { await agir(); } catch(e) { problemas.erros.add(`${scheme}: cena "${nome}" falhou — ${String(e.message).split("\n")[0].slice(0,70)}`); continue; }
    await p.waitForTimeout(450);
    const r = await p.evaluate(CHECKS);
    r.contraste.forEach(x=>add(problemas.contraste, x.cls+"|"+x.r, {...x, cena:nome, tema:scheme}));
    r.alvos.forEach(x=>add(problemas.alvos, x.cls+"|"+x.d, {...x, cena:nome}));
    r.campos.forEach(x=>problemas.campos.add(`${nome}: ${x}`));
    r.semNome.forEach(x=>problemas.semNome.add(`${nome}: ${x}`));
    r.semAlt.forEach(x=>problemas.semAlt.add(`${nome}: ${x}`));
    r.idsRepetidos.forEach(x=>problemas.idsRepetidos.add(x));
    if(r.transbordo) problemas.transbordo.add(`${nome}: ${r.transbordo}`);
    r.cortado.forEach(x=>add(problemas.cortado, x.cls+"|"+x.txt, {...x, cena:nome}));
  }
  // AS DUAS PÁGINAS PUBLICADAS.
  //
  // A /privacidade e a /ajuda estão no ar em foodboxd.pt e nunca tinham passado
  // por aqui — nem contraste, nem alvos de toque, nem tema escuro. São
  // documentos à parte, com os tokens no próprio ficheiro, portanto uma
  // regressão no tema escuro de uma delas não aparecia em mais lado nenhum.
  //
  // Apanhado por um agente a rever os textos, não por este arnês. A zona cega
  // era permanente e existia desde que as páginas foram escritas.
  for (const [nome, ficheiro] of [["Privacidade", "privacidade.html"], ["Ajuda", "ajuda.html"], ["Termos", "termos.html"]]) {
    try {
      await p.goto(`http://127.0.0.1:8799/${ficheiro}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await p.waitForTimeout(600);
      const r = await p.evaluate(CHECKS);
      r.contraste.forEach(x=>add(problemas.contraste, x.cls+"|"+x.r, {...x, cena:nome, tema:scheme}));
      r.alvos.forEach(x=>add(problemas.alvos, x.cls+"|"+x.d, {...x, cena:nome}));
      r.campos.forEach(x=>problemas.campos.add(`${nome}: ${x}`));
      r.semNome.forEach(x=>problemas.semNome.add(`${nome}: ${x}`));
      r.semAlt.forEach(x=>problemas.semAlt.add(`${nome}: ${x}`));
      r.idsRepetidos.forEach(x=>problemas.idsRepetidos.add(x));
      if(r.transbordo) problemas.transbordo.add(`${nome}: ${r.transbordo}`);
    } catch(e) {
      problemas.erros.add(`${scheme}: página "${nome}" falhou — ${String(e.message).split("\n")[0].slice(0,70)}`);
    }
  }

  await c.close();
}
await b.close(); srv.close();

const sec=(t,v)=>{ console.log("\n## "+t); if(!v.length){console.log("   nada"); return;} v.forEach(x=>console.log("   "+x)); };
sec("Erros de JavaScript / cenas falhadas", [...problemas.erros]);
sec("Contraste abaixo do mínimo", [...problemas.contraste.values()].map(x=>`${x.r}:1 (min ${x.min}) ${x.px}px · ${x.cls} · "${x.txt}" · ${x.cena} · ${x.tema}`));
sec("Campos abaixo de 16px", [...problemas.campos]);
sec("Botões/links sem nome acessível", [...problemas.semNome]);
sec("Imagens sem alt", [...problemas.semAlt]);
sec("Ids repetidos no DOM", [...problemas.idsRepetidos]);
sec("Transbordo horizontal", [...problemas.transbordo]);
sec("Texto cortado sem ellipsis", [...problemas.cortado.values()].map(x=>`${x.cls} · "${x.txt}" · ${x.cena}`));
sec("Alvos abaixo de 44px", [...problemas.alvos.values()].map(x=>`${x.cls} ${x.d} · ${x.cena}`));
