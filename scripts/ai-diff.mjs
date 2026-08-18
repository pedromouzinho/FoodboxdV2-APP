// Compara o payload de IA antigo com o novo, lado a lado (npm run ai:diff).
//
// A pergunta "é a melhor combinação de informação?" não tem resposta universal:
// o perfil é calculado por pessoa e os defeitos pesam de forma diferente
// conforme os dados. Por isso isto não decide nada — imprime as duas respostas
// e quem julga é quem lê.
//
//   node scripts/ai-diff.mjs            só mede os payloads (não gasta IA)
//   node scripts/ai-diff.mjs --chamar   chama mesmo a função e mostra as respostas
//
// Precisa de um token: FOODBOXD_TOKEN=<idToken> para --chamar.

const ENDPOINT = process.env.FOODBOXD_AI || "https://foodboxd.pt/api/ai";
const CHAMAR = process.argv.includes("--chamar");

// Quatro formas de perfil, porque a mudança não pode ficar afinada a uma pessoa.
const PERFIS = {
  "variado (13 cozinhas, opiniões fortes)": [
    { name: "Tasca do Zé", cuisine: "portuguesa", stars: 5, dishes: ["Açorda de marisco"], note: "A açorda é das melhores que comi. Voltamos sempre.", visits: 4 },
    { name: "Sushi Kaido", cuisine: "japonesa", stars: 5, dishes: ["Nigiri de salmão"], note: "Peixe impecável, balcão pequeno. Reservar.", visits: 2 },
    { name: "Trattoria Vera", cuisine: "italiana", stars: 4, dishes: ["Cacio e pepe"], note: "", visits: 1 },
    { name: "Burger House", cuisine: "americana", stars: 1, dishes: [], note: "Carne seca, demorou 40 minutos.", visits: 1 },
    { name: "Burger Two", cuisine: "americana", stars: 2, dishes: [], note: "", visits: 1 }
  ],
  "focado (tudo português, poucas notas)": [
    { name: "Monte d'Açorda", cuisine: "portuguesa", stars: 5, dishes: ["Açorda"], note: "", visits: 2 },
    { name: "O Ricardo", cuisine: "portuguesa", stars: 4, dishes: ["Migas"], note: "Pedir o borrego.", visits: 1 },
    { name: "Laranjinha", cuisine: "portuguesa", stars: 4, dishes: [], note: "", visits: 1 }
  ],
  "generoso (dá 4-5 a tudo)": [
    { name: "A", cuisine: "portuguesa", stars: 5, dishes: [], note: "", visits: 1 },
    { name: "B", cuisine: "japonesa", stars: 5, dishes: [], note: "", visits: 1 },
    { name: "C", cuisine: "italiana", stars: 4, dishes: [], note: "", visits: 1 },
    { name: "D", cuisine: "mariscos", stars: 5, dishes: [], note: "", visits: 1 }
  ],
  "escasso (3 registos, no limiar)": [
    { name: "Tasca", cuisine: "portuguesa", stars: 4, dishes: [], note: "", visits: 1 },
    { name: "Café", cuisine: "cafe", stars: 3, dishes: [], note: "", visits: 1 },
    { name: "Marisqueira", cuisine: "mariscos", stars: 5, dishes: ["Sapateira"], note: "A sapateira estava cheia.", visits: 1 }
  ]
};

// Ruído: sítios da lista partilhada onde a pessoa nunca foi. É o que torna o
// catálogo real — 49 sítios para descrever quem avaliou 5.
const RUIDO = Array.from({ length: 44 }, (_, i) => ({
  id: `x${i}`, name: `Sítio ${i}`, town: "Lisboa", region: "Lisboa",
  cuisine: ["portuguesa", "italiana", "asiatica", "doces"][i % 4], styles: ["casual"],
  specialty: "Prato da casa", groupAvg: 3.8 + (i % 3) * 0.4
}));

const legacy = (c, st) => (c === "doces" || c === "cafe") ? "pastelaria"
  : (st || []).includes("fine-dining") ? "fine-dining"
  : (st || []).includes("petiscos") ? "petiscos" : "tradicional";

function antigo(sitios) {
  const catalog = sitios.map((s, i) => {
    const e = { id: `m${i}`, name: s.name, town: "Évora", region: "Alentejo", cuisine: s.cuisine, styles: ["casual"], visited: true };
    if (s.stars) e.myStars = s.stars;
    if (s.dishes.length) e.myDishes = s.dishes;
    return e; // sem myNote, sem visits, sem lastVisit
  }).concat(RUIDO);
  const catWeights = {}; const liked = [];
  sitios.forEach((s) => {
    catWeights[legacy(s.cuisine, ["casual"])] = (catWeights[legacy(s.cuisine, ["casual"])] || 0) + s.stars;
    if (s.stars >= 4) liked.push(...s.dishes);
  });
  const sum = sitios.reduce((a, s) => a + s.stars, 0);
  return { catalog, profile: { name: "Pedro", visitedCount: sitios.length,
    avgStars: Math.round((sum / sitios.length) * 10) / 10, catWeights,
    likedDishes: [...new Set(liked)].slice(0, 20) } };
}

function novo(sitios) {
  const meus = sitios.map((s, i) => {
    const e = { id: `m${i}`, name: s.name, town: "Évora", region: "Alentejo", cuisine: s.cuisine, styles: ["casual"], visited: true };
    if (s.stars) e.myStars = s.stars;
    if (s.dishes.length) e.myDishes = s.dishes;
    if (s.note) e.myNote = s.note;
    if (s.visits) { e.visits = s.visits; e.lastVisit = "2026-07-0" + (i + 1); }
    return e;
  });
  const porCozinha = {}; const pratos = new Map();
  sitios.forEach((s) => {
    const a = (porCozinha[s.cuisine] = porCozinha[s.cuisine] || { total: 0, sitios: 0 });
    a.total += s.stars; a.sitios++;
    if (s.stars >= 4) s.dishes.forEach((d) => {
      const k = d.toLowerCase();
      const p = pratos.get(k) || { prato: d, vezes: 0, sitios: [], estrelas: 0 };
      p.vezes++; p.estrelas = Math.max(p.estrelas, s.stars); if (p.sitios.length < 3) p.sitios.push(s.name);
      pratos.set(k, p);
    });
  });
  const cozinhas = Object.entries(porCozinha)
    .map(([cozinha, a]) => ({ cozinha, media: Math.round((a.total / a.sitios) * 10) / 10, sitios: a.sitios }))
    .sort((a, b) => b.media - a.media || b.sitios - a.sitios);
  const sum = sitios.reduce((a, s) => a + s.stars, 0);
  return { catalog: meus.concat(RUIDO), profile: {
    name: "Pedro", visitedCount: sitios.length, ratedCount: sitios.length,
    avgStars: Math.round((sum / sitios.length) * 10) / 10,
    cuisines: cozinhas.filter((c) => c.media > 2),
    dislikedCuisines: cozinhas.filter((c) => c.media <= 2),
    likedDishes: [...pratos.values()].sort((a, b) => b.vezes - a.vezes).slice(0, 20)
  } };
}

const tam = (o) => JSON.stringify(o).length;
// ~4 caracteres por token é a regra prática; serve para uma ordem de grandeza.
const tok = (o) => Math.round(tam(o) / 4);

async function chamar(body) {
  const t = process.env.FOODBOXD_TOKEN;
  if (!t) throw new Error("falta FOODBOXD_TOKEN");
  const res = await fetch(ENDPOINT, { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
    body: JSON.stringify({ action: "tasteProfile", ...body, near: { town: "Évora", region: "Alentejo" } }) });
  if (!res.ok) throw new Error(res.status + " " + (await res.text()).slice(0, 200));
  return (await res.json()).result;
}

for (const [nome, sitios] of Object.entries(PERFIS)) {
  const a = antigo(sitios), n = novo(sitios);
  console.log("\n" + "=".repeat(72) + "\n" + nome + "\n" + "=".repeat(72));
  console.log(`payload   antigo ~${tok(a)} tokens   novo ~${tok(n)} tokens   (${n.catalog.length} sítios)`);
  console.log("\n-- agregado ANTIGO --\n" + JSON.stringify(a.profile, null, 1));
  console.log("\n-- agregado NOVO --\n" + JSON.stringify(n.profile, null, 1));
  if (!CHAMAR) continue;
  for (const [rot, body] of [["ANTIGO", a], ["NOVO", n]]) {
    try {
      const r = await chamar(body);
      console.log(`\n-- resposta ${rot} --\n${r.summary}`);
      if (r.avoids) console.log("não procuras: " + r.avoids);
      console.log("cozinhas: " + (r.cuisines || []).join(", "));
      console.log("pesquisas: " + (r.mapsQueries || []).map((q) => q.query).join(" | "));
    } catch (e) { console.log(`\n-- resposta ${rot} -- ERRO: ${e.message}`); }
  }
}
console.log(CHAMAR ? "" : "\n(só medição — usa --chamar com FOODBOXD_TOKEN para ver as respostas do modelo)");
