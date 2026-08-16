// Semeia o emulador do Firestore com o mínimo para a app fazer sentido: alguns
// restaurantes, duas pessoas e uma aresta de "segue". Sem isto o emulador
// arranca vazio e não se consegue testar nem a lista, nem o feed, nem o mapa.
//
//   node scripts/seed-emulator.js
//
// O emulador aplica as regras de firebase/firestore.rules como a produção, por
// isso a semeadura autentica-se como dono ("Bearer owner"), o token especial que
// só o emulador aceita — em produção não é nada e a chamada seria rejeitada.
// RECUSA-SE a correr se o emulador não estiver a responder, para nunca haver
// hipótese de isto tocar na base de dados real.

const PROJECT = "app-restaurantes-499400";
const HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;

const RESTAURANTS = [
  { name: "Tasca do Zé", town: "Évora", region: "Alentejo", country: "Portugal", cuisine: "portuguesa", styles: ["tasca"], lat: 38.5714, lng: -7.9135 },
  { name: "Marisqueira Atlântico", town: "Matosinhos", region: "Norte", country: "Portugal", cuisine: "mariscos", styles: ["casual"], lat: 41.1836, lng: -8.6960 },
  { name: "Trattoria Vera", town: "Lisboa", region: "Lisboa", country: "Portugal", cuisine: "italiana", styles: ["casual"], lat: 38.7223, lng: -9.1393 },
  { name: "Sushi Kaido", town: "Porto", region: "Norte", country: "Portugal", cuisine: "japonesa", styles: ["fine-dining"], lat: 41.1579, lng: -8.6291 },
  { name: "Pastelaria Aurora", town: "Coimbra", region: "Centro", country: "Portugal", cuisine: "doces", styles: [], lat: 40.2033, lng: -8.4103 },
  { name: "Churrasqueira da Praça", town: "Faro", region: "Algarve", country: "Portugal", cuisine: "churrasco", styles: ["takeaway"], lat: 37.0194, lng: -7.9304 }
];

const PEOPLE = [
  { uid: "seed-ana", displayName: "Ana (teste)" },
  { uid: "seed-bruno", displayName: "Bruno (teste)" }
];

function encode(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === "object") return { mapValue: { fields: fields(value) } };
  return { stringValue: String(value) };
}
const fields = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, encode(v)]));

async function put(path, data) {
  const res = await fetch(`${BASE}/${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields: fields(data) })
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
}

(async () => {
  try {
    const ping = await fetch(`http://${HOST}/`);
    if (!ping.ok) throw new Error(String(ping.status));
  } catch {
    console.error(`O emulador não responde em ${HOST}. Corre primeiro: npm run emu:start`);
    process.exit(1);
  }

  const now = new Date().toISOString();
  for (const [i, r] of RESTAURANTS.entries()) {
    await put(`restaurants/seed-${i + 1}`, { ...r, addedBy: PEOPLE[i % 2].uid, createdAt: now });
    console.log("  restaurante:", r.name);
  }
  for (const p of PEOPLE) {
    await put(`profiles/${p.uid}`, { displayName: p.displayName, photoURL: "", updatedAt: now });
    await put(`userData/${p.uid}`, { displayName: p.displayName, photoURL: "", visited: {}, priority: {}, ratings: {} });
    console.log("  pessoa:", p.displayName);
  }
  // Uma aresta em cada sentido, para o feed ter o que mostrar dos dois lados.
  for (const [a, b] of [[PEOPLE[0], PEOPLE[1]], [PEOPLE[1], PEOPLE[0]]]) {
    await put(`follows/${a.uid}_${b.uid}`, { followerUid: a.uid, targetUid: b.uid, createdAt: now });
  }
  console.log(`\nFeito. Abre http://127.0.0.1:8788 (npm run preview) ou a consola em http://127.0.0.1:4000`);
})().catch((e) => { console.error("ERRO", e.message); process.exit(1); });
