// O que este arnês prova (npm run test:persistencia):
//
//   1. O CONTRATO DA GRAVAÇÃO — tudo o que o persistNow (js/userdata.js) manda
//      tem de chegar ao corpo que o saveUserDoc (js/db.js) grava. O PATCH do
//      Firestore vai SEM updateMask, portanto substitui o documento inteiro:
//      um campo que falte na lista do saveUserDoc não é "ficar como estava",
//      é APAGADO da nuvem. Foi assim que a lista de bloqueados (diretriz 1.2
//      da App Store) se perdia a cada gravação: o persistNow passava
//      `blocked`, o saveUserDoc não o codificava, e cada estrela dada apagava
//      os bloqueios. Visto vermelho a 25/08/2026 antes da correção.
//
//   2. AS TRÊS FUNÇÕES DE PRIVACIDADE — podeVerPerfil, canSeeUser e o filtro
//      de bloqueados do applyGroupFilter decidem quem vê o quê, e nenhum dos
//      arneses de browser as exercita. São puras o suficiente para correr
//      aqui, no código REAL (js/userdata.js por cima de js/db.js), sem
//      browser e sem emulador.
//
// Como corre: um contexto de vm com window/location/fetch falsos, os três
// ficheiros verdadeiros carregados lá dentro (config.js, db.js, userdata.js),
// e um fetch que grava cada PATCH em vez de o mandar à rede. O setUser corre
// a sério — o que se afirma é o comportamento, não uma cópia dele.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import vm from "node:vm";

const ROOT = resolve(import.meta.dirname, "..");

let falhas = 0;
function chk(nome, cond, extra) {
  if (cond) console.log(`PASS ${nome}`);
  else {
    falhas++;
    console.log(`FALHA ${nome}${extra ? ` — ${extra}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// O contexto: o mínimo de browser de que os três ficheiros precisam.
// ---------------------------------------------------------------------------
const gravacoes = []; // todos os PATCH a /userData/ — { url, fields }
const errosGravados = []; // todos os POST a /errosClient — { fields }
let docNoServidor = null; // o que o fetchUserDoc devolve (null → 404)

function fazerFetch() {
  return async function fetchFalso(url, opts = {}) {
    const metodo = (opts.method || "GET").toUpperCase();
    if (url.includes("/errosClient") && metodo === "POST") {
      errosGravados.push(JSON.parse(opts.body).fields || {});
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (url.includes("/userData/") && metodo === "GET") {
      if (!docNoServidor) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => docNoServidor };
    }
    if (url.includes("/userData/") && metodo === "PATCH") {
      const corpo = JSON.parse(opts.body);
      gravacoes.push({ url, fields: corpo.fields || {} });
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (url.includes(":runQuery")) return { ok: true, status: 200, json: async () => [] };
    // profiles, follows, o resto: aceitar e seguir.
    return { ok: true, status: 200, json: async () => ({}) };
  };
}

function novoContexto() {
  const ctx = {
    console, setTimeout, clearTimeout,
    window: {},
    location: { hostname: "127.0.0.1" },
    fetch: fazerFetch(),
    Storage: { getVisited: () => [], isVisited: () => false, setVisited: () => {} }
  };
  ctx.window = ctx; // window.CONFIG = CONFIG (config.js) tem de assentar aqui
  vm.createContext(ctx);
  for (const f of ["js/config.js", "js/db.js", "js/userdata.js"]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  vm.runInContext("DB.init(); UserData.init({});", ctx);
  return ctx;
}

const utilizador = {
  uid: "eu-teste", email: "eu@teste.pt", displayName: "Eu Teste",
  photoURL: "", metadata: { creationTime: "2026-01-01" }
};
const token = async () => "token-falso";
const pausa = (ms = 20) => new Promise((r) => setTimeout(r, ms));

// Firestore typed-value → JS, só o que as afirmações precisam.
function descodificar(v) {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(descodificar);
  if (v.mapValue !== undefined) {
    const o = {};
    Object.entries(v.mapValue.fields || {}).forEach(([k, x]) => (o[k] = descodificar(x)));
    return o;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. O contrato da gravação
// ---------------------------------------------------------------------------
{
  const ctx = novoContexto();
  docNoServidor = null; // primeira sessão: o setUser grava logo (migração local)
  ctx.u = utilizador; ctx.t = token;
  await vm.runInContext("UserData.setUser(u, t)", ctx);
  await pausa();

  const ultima = gravacoes[gravacoes.length - 1];
  chk("há uma gravação do userData na primeira sessão", !!ultima);

  // A lista é o que o persistNow (js/userdata.js) passa ao saveUserDoc.
  // Se o persistNow ganhar campos novos, esta lista tem de crescer com ele —
  // é esse o contrato que o arnês guarda.
  const contrato = [
    "displayName", "photoURL", "visited", "priority", "priorityAt", "ratings",
    "history", "onboarded", "homeTown", "activeGroup", "tasteProfile",
    "tasteGenDay", "tasteNote", "audienceGlobal", "visibleTo", "shareGroups",
    "blocked", "blockedNames", "destaques", "favoritos", "visibilidade",
    "followPrefs", "pushEnabled"
  ];
  const chaves = ultima ? Object.keys(ultima.fields) : [];
  const emFalta = contrato.filter((c) => !chaves.includes(c));
  chk("o corpo gravado leva tudo o que o persistNow manda", emFalta.length === 0,
    `em falta: ${emFalta.join(", ")}`);

  // Bloquear alguém tem de chegar à nuvem — e sobreviver à sessão seguinte.
  gravacoes.length = 0;
  await vm.runInContext(`UserData.blockUser("uid-mau", "Fulano Mau")`, ctx);
  await pausa();
  const comBloqueio = gravacoes[gravacoes.length - 1];
  const blocked = comBloqueio && comBloqueio.fields.blocked
    ? descodificar(comBloqueio.fields.blocked) : null;
  const nomes = comBloqueio && comBloqueio.fields.blockedNames
    ? descodificar(comBloqueio.fields.blockedNames) : null;
  chk("bloquear grava o uid na nuvem", Array.isArray(blocked) && blocked.includes("uid-mau"),
    `blocked gravado: ${JSON.stringify(blocked)}`);
  chk("o nome de quem foi bloqueado vai junto", !!nomes && nomes["uid-mau"] === "Fulano Mau");

  // A volta completa: a sessão seguinte lê o que esta gravou.
  if (comBloqueio) {
    const ctx2 = novoContexto();
    docNoServidor = { fields: comBloqueio.fields };
    ctx2.u = utilizador; ctx2.t = token;
    await vm.runInContext("UserData.setUser(u, t)", ctx2);
    await pausa();
    const aindaBloqueado = vm.runInContext(`UserData.isBlocked("uid-mau")`, ctx2);
    chk("o bloqueio sobrevive à sessão seguinte", aindaBloqueado === true);
  } else {
    chk("o bloqueio sobrevive à sessão seguinte", false, "não houve gravação para reler");
  }
}

// ---------------------------------------------------------------------------
// 2. As três funções de privacidade
// ---------------------------------------------------------------------------
{
  const ctx = novoContexto();
  // Sessão com: sigo "amiga" e "malvisto"; "malvisto" está bloqueado.
  docNoServidor = {
    fields: {
      displayName: { stringValue: "Eu Teste" },
      blocked: { arrayValue: { values: [{ stringValue: "malvisto" }] } },
      blockedNames: { mapValue: { fields: { malvisto: { stringValue: "M." } } } },
      audienceGlobal: { booleanValue: true }
    }
  };
  const fetchBase = ctx.fetch;
  ctx.fetch = async (url, opts = {}) => {
    if (url.includes(":runQuery") && (opts.body || "").includes("follows")) {
      return { ok: true, status: 200, json: async () => ([
        { document: { name: "x/follows/eu-teste_amiga", fields: { followerUid: { stringValue: "eu-teste" }, targetUid: { stringValue: "amiga" } } } },
        { document: { name: "x/follows/eu-teste_malvisto", fields: { followerUid: { stringValue: "eu-teste" }, targetUid: { stringValue: "malvisto" } } } }
      ]) };
    }
    if (url.includes("/userData/amiga")) {
      return { ok: true, status: 200, json: async () => ({ name: "p/d/userData/amiga", fields: { displayName: { stringValue: "Amiga" } } }) };
    }
    if (url.includes("/userData/malvisto")) {
      return { ok: true, status: 200, json: async () => ({ name: "p/d/userData/malvisto", fields: { displayName: { stringValue: "M." } } }) };
    }
    return fetchBase(url, opts);
  };
  ctx.u = utilizador; ctx.t = token;
  await vm.runInContext("UserData.setUser(u, t)", ctx);
  await pausa();

  chk("canSeeUser: quem sigo, vejo",
    vm.runInContext(`UserData.canSeeUser("amiga")`, ctx) === true);
  chk("canSeeUser: bloqueado é bloqueado mesmo que o siga",
    vm.runInContext(`UserData.canSeeUser("malvisto")`, ctx) === false);
  chk("canSeeUser: um desconhecido não se vê",
    vm.runInContext(`UserData.canSeeUser("estranho")`, ctx) === false);
  chk("o filtro do grupo deixa o bloqueado de fora do feed",
    vm.runInContext(`UserData.everyone().every((p) => p.uid !== "malvisto")`, ctx) === true);
  chk("o filtro do grupo mantém quem não está bloqueado",
    vm.runInContext(`UserData.everyone().some((p) => p.uid === "amiga")`, ctx) === true);

  const casos = [
    [{ uid: "outra", visibilidade: "todos" }, false, true, "todos → qualquer pessoa vê"],
    [{ uid: "outra", visibilidade: "seguidores" }, true, true, "seguidores → seguidor vê"],
    [{ uid: "outra", visibilidade: "seguidores" }, false, false, "seguidores → não-seguidor não vê"],
    [{ uid: "outra", visibilidade: "ninguem" }, true, false, "ninguem → nem seguidor vê"]
  ];
  for (const [perfil, souSeguidor, esperado, nome] of casos) {
    ctx.perfilCaso = perfil; ctx.souSeguidorCaso = souSeguidor;
    const obtido = vm.runInContext("UserData.podeVerPerfil(perfilCaso, souSeguidorCaso)", ctx);
    chk(`podeVerPerfil: ${nome}`, obtido === esperado, `devolveu ${obtido}`);
  }
  chk("podeVerPerfil: o próprio vê-se sempre",
    vm.runInContext(`UserData.podeVerPerfil({ uid: "eu-teste", visibilidade: "ninguem" }, false)`, ctx) === true);

  // As preferências de push são PRIVADAS: a máscara da vista social (o que o
  // servidor manda dos amigos) não as pode pedir. Mede-se o URL do pedido,
  // não a intenção do código.
  const urls = [];
  const fetchAntes = ctx.fetch;
  ctx.fetch = async (url, opts) => { urls.push(url); return fetchAntes(url, opts); };
  await vm.runInContext(`DB.fetchUsersByIds(["alguem"], "tok")`, ctx);
  const urlSocial = urls.find((u) => u.includes("mask.fieldPaths")) || "";
  chk("a máscara social não pede followPrefs nem pushEnabled",
    urlSocial.length > 0 && !urlSocial.includes("followPrefs") && !urlSocial.includes("pushEnabled"),
    urlSocial.slice(0, 200));
  ctx.fetch = fetchAntes;
}

// ---------------------------------------------------------------------------
// 3. O registo de erros do cliente (js/erros.js → coleção errosClient)
// ---------------------------------------------------------------------------
{
  const ctx = novoContexto();
  ctx.navigator = { userAgent: "arnes-teste" };
  ctx.location.pathname = "/";
  ctx.addEventListener = () => {}; // os listeners reais são do browser; aqui chama-se registar() à mão
  ctx.FirebaseAuth = { configured: true, getToken: async () => "token-falso" };
  let carregou = true;
  try {
    vm.runInContext(readFileSync(join(ROOT, "js/erros.js"), "utf8"), ctx, { filename: "js/erros.js" });
  } catch (e) { carregou = false; }
  chk("js/erros.js existe e carrega", carregou);

  if (carregou) {
    docNoServidor = null;
    ctx.u = utilizador; ctx.t = token;
    await vm.runInContext("UserData.setUser(u, t)", ctx);
    await pausa();
    errosGravados.length = 0;

    ctx.errCaso = new Error("x".repeat(900)); // maior do que o limite da regra
    await vm.runInContext(`Erros.registar(errCaso, "teste")`, ctx);
    await pausa();
    const g = errosGravados[0];
    chk("um erro registado chega à coleção errosClient", !!g);
    const msg = g && g.msg ? descodificar(g.msg) : "";
    chk("a mensagem vai truncada ao limite da regra (500)", msg.length > 0 && msg.length <= 500,
      `tamanho: ${msg.length}`);
    chk("o uid gravado é o da sessão", g && descodificar(g.uid) === "eu-teste");

    await vm.runInContext(`Erros.registar(errCaso, "teste")`, ctx);
    await pausa();
    chk("o mesmo erro não é gravado duas vezes na sessão", errosGravados.length === 1,
      `gravações: ${errosGravados.length}`);
  } else {
    ["um erro registado chega à coleção errosClient",
     "a mensagem vai truncada ao limite da regra (500)",
     "o uid gravado é o da sessão",
     "o mesmo erro não é gravado duas vezes na sessão"].forEach((n) => chk(n, false, "sem módulo"));
  }
}

// ---------------------------------------------------------------------------
// 4. O filtro de conteúdo dos comentários (js/filtro.js — diretriz 1.2)
// ---------------------------------------------------------------------------
{
  const ctx = { console };
  vm.createContext(ctx);
  let carregou = true;
  try {
    vm.runInContext(readFileSync(join(ROOT, "js/filtro.js"), "utf8"), ctx, { filename: "js/filtro.js" });
  } catch (e) { carregou = false; }
  chk("js/filtro.js existe e carrega", carregou);

  const casos = [
    ["A açorda estava excelente, voltamos de certeza.", true, "texto normal passa"],
    ["Serviço lento mas a comida compensa. 4 estrelas!", true, "crítica negativa legítima passa"],
    ["que grande merda de sítio", false, "palavrão direto é recusado"],
    ["isto é uma m3rd@ pegada", false, "palavrão disfarçado com números é recusado"],
    ["FUCK this place", false, "palavrão em inglês é recusado"],
    ["o empregado é um filho da puta", false, "insulto composto é recusado"]
  ];
  for (const [texto, esperado, nome] of casos) {
    if (!carregou) { chk(`filtro: ${nome}`, false, "sem módulo"); continue; }
    ctx.textoCaso = texto;
    const r = vm.runInContext("Filtro.avaliar(textoCaso)", ctx);
    chk(`filtro: ${nome}`, !!r && r.ok === esperado, `devolveu ${JSON.stringify(r)}`);
  }
}

console.log(falhas ? `\npersistência/privacidade: ${falhas} FALHA(S)` : "\npersistência e privacidade: tudo no sítio");
process.exitCode = falhas ? 1 : 0;
