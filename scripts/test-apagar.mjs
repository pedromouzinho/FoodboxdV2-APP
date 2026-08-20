// Apagar uma conta é a única operação irreversível da app, corre com
// privilégios de administrador e toca sete coleções. Não se manda isto para
// produção com base em ler o código.
//
// Semeia uma conta completa no emulador, apaga-a, e verifica as duas metades da
// promessa que o ecrã de confirmação faz: o que tem de desaparecer desapareceu,
// e o que tem de ficar ficou.
//
//   firebase emulators:start --only auth,firestore,functions,storage \
//     --project app-restaurantes-499400
//   node scripts/test-apagar.mjs
//
// Corre a cascata diretamente (exports.__test), sem passar pelo HTTP: o que tem
// risco é a cascata, não as quinze linhas de endpoint que copiam o `ai`.

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "app-restaurantes-499400";

const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);

let mod;
try {
  mod = require("../functions/index.js");
} catch (e) {
  console.error("Não consegui carregar functions/index.js:", e && e.message);
  console.error("O emulador está a correr? (npm run emu:start)");
  process.exit(2);
}
const admin = require("../functions/node_modules/firebase-admin");
const db = admin.firestore();

const EU = "conta-a-apagar";
const OUTRO = "quem-fica";

let falhas = 0;
function ok(nome, condicao, extra) {
  if (!condicao) falhas++;
  console.log((condicao ? "PASS " : "FALHA ") + nome + (condicao ? "" : "  " + (extra ?? "")));
}

async function existe(caminho) {
  const [col, id] = caminho.split("/");
  return (await db.collection(col).doc(id).get()).exists;
}

// ---- semear -----------------------------------------------------------------
// Uma conta com tudo o que uma conta real tem, e um segundo utilizador para as
// relações não serem só consigo próprias.

async function semear() {
  const b = db.batch();
  b.set(db.collection("userData").doc(EU), { visited: ["r1"], ratings: { r1: { stars: 5 } }, tasteNote: "não como picante" });
  b.set(db.collection("profiles").doc(EU), { displayName: "Quem sai", photoURL: "" });
  b.set(db.collection("userData").doc(OUTRO), { visited: ["r1"] });
  b.set(db.collection("profiles").doc(OUTRO), { displayName: "Quem fica" });

  b.set(db.collection("comments").doc("c1"), { uid: EU, restaurantId: "r1", text: "minha" });
  b.set(db.collection("comments").doc("c2"), { uid: EU, restaurantId: "r2", text: "minha também" });
  b.set(db.collection("comments").doc("c3"), { uid: OUTRO, restaurantId: "r1", text: "de outra pessoa" });

  b.set(db.collection("photos").doc("p1"), { uid: EU, restaurantId: "r1", url: "x" });
  b.set(db.collection("photos").doc("p2"), { uid: OUTRO, restaurantId: "r1", url: "y" });

  // As duas direções. A segunda é a razão de isto ser uma função e não código
  // no cliente: as regras não deixam ninguém apagar uma aresta de outra pessoa.
  b.set(db.collection("follows").doc(`${EU}_${OUTRO}`), { followerUid: EU, targetUid: OUTRO });
  b.set(db.collection("follows").doc(`${OUTRO}_${EU}`), { followerUid: OUTRO, targetUid: EU });

  b.set(db.collection("visitInvites").doc("i1"), { fromUid: EU, toUid: OUTRO, status: "pending" });
  b.set(db.collection("visitInvites").doc("i2"), { fromUid: OUTRO, toUid: EU, status: "pending" });

  // Um grupo que tem de sobreviver com outro dono, e outro que fica vazio.
  b.set(db.collection("groups").doc("g-partilhado"), { name: "Jantares", code: "AAA", ownerUid: EU, members: [EU, OUTRO] });
  b.set(db.collection("groups").doc("g-so-meu"), { name: "Sozinho", code: "BBB", ownerUid: EU, members: [EU] });

  // O que NÃO pode desaparecer: está na lista partilhada e outras pessoas usam-no.
  b.set(db.collection("restaurants").doc("r1"), { name: "Monte d'Açorda", addedByUid: EU });
  await b.commit();

  try {
    await admin.auth().createUser({ uid: EU, email: "sai@exemplo.pt", password: "abcdef" });
  } catch (e) {
    if (!/already exists/i.test(e && e.message)) throw e;
  }

  // Ficheiros a sério no Storage. O nome começa pelo uid de quem enviou — é a
  // convenção que as regras impõem na escrita e por onde a cascata os encontra.
  const bucket = admin.storage().bucket();
  await bucket.file(`restaurants/r1/${EU}-1.jpg`).save(Buffer.from("meu"), { contentType: "image/jpeg" });
  await bucket.file(`avatars/${EU}-avatar.jpg`).save(Buffer.from("eu"), { contentType: "image/jpeg" });
  await bucket.file(`restaurants/r1/${OUTRO}-1.jpg`).save(Buffer.from("dele"), { contentType: "image/jpeg" });
}

async function ficheiroExiste(caminho) {
  try {
    const [existe] = await admin.storage().bucket().file(caminho).exists();
    return existe;
  } catch (e) {
    return null; // sem Storage não se afirma nada
  }
}

async function limpar() {
  for (const col of ["userData", "profiles", "comments", "photos", "follows", "visitInvites", "groups", "restaurants"]) {
    const snap = await db.collection(col).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await admin.auth().deleteUser(EU).catch(() => {});
  await admin.auth().deleteUser(OUTRO).catch(() => {});
  try {
    const bucket = admin.storage().bucket();
    const [fs] = await bucket.getFiles({ prefix: "" });
    await Promise.all(fs.map((f) => f.delete().catch(() => {})));
  } catch (e) { /* sem Storage, nada a limpar */ }
}

// ---- correr -----------------------------------------------------------------

await limpar();
await semear();
ok("a semente ficou de pé", await existe(`userData/${EU}`));

const contagem = await mod.__test.apagarConta(EU);
console.log("  contagem:", JSON.stringify(contagem));

// ---- o que tem de desaparecer ----------------------------------------------

ok("userData apagado", !(await existe(`userData/${EU}`)));
ok("profile apagado", !(await existe(`profiles/${EU}`)));
ok("comentários meus apagados",
  (await db.collection("comments").where("uid", "==", EU).get()).empty);
ok("fotos minhas apagadas",
  (await db.collection("photos").where("uid", "==", EU).get()).empty);
ok("as pessoas que eu seguia deixam de o ser", !(await existe(`follows/${EU}_${OUTRO}`)));
// A afirmação que justifica esta função existir.
ok("quem me seguia deixa de me seguir", !(await existe(`follows/${OUTRO}_${EU}`)));
ok("convites que enviei apagados", !(await existe("visitInvites/i1")));
ok("convites que recebi apagados", !(await existe("visitInvites/i2")));

let auth = null;
try { auth = await admin.auth().getUser(EU); } catch (e) { auth = null; }
ok("a conta de Auth deixou de existir", auth === null);

// O passo do Storage é melhor-esforço e engole erros de propósito: se não houver
// bucket, `contagem` traz null e não se afirma nada em vez de se afirmar falso.
if (contagem.ficheirosRestaurantes === null) {
  console.log("  (sem Storage — as afirmações sobre ficheiros não correram)");
} else {
  ok("a minha foto saiu do Storage", (await ficheiroExiste(`restaurants/r1/${EU}-1.jpg`)) === false);
  ok("o meu avatar saiu do Storage", (await ficheiroExiste(`avatars/${EU}-avatar.jpg`)) === false);
  ok("a foto da outra pessoa ficou", (await ficheiroExiste(`restaurants/r1/${OUTRO}-1.jpg`)) === true);
}

// ---- o que tem de ficar -----------------------------------------------------

ok("o restaurante que acrescentei continua na lista partilhada", await existe("restaurants/r1"),
  "o ecrã de confirmação promete isto — se cair, a promessa é falsa");
ok("comentários de outras pessoas intactos", await existe("comments/c3"));
ok("fotos de outras pessoas intactas", await existe("photos/p2"));
ok("a conta da outra pessoa intacta", await existe(`userData/${OUTRO}`));

// ---- grupos: ninguém fica preso num grupo sem dono -------------------------

const partilhado = await db.collection("groups").doc("g-partilhado").get();
ok("o grupo com mais gente sobrevive", partilhado.exists);
ok("e passa a ser de quem lá ficou",
  partilhado.exists && partilhado.data().ownerUid === OUTRO,
  partilhado.exists ? `dono=${partilhado.data().ownerUid}` : "não existe");
ok("e eu já não sou membro",
  partilhado.exists && !(partilhado.data().members || []).includes(EU));
ok("o grupo que era só meu desaparece", !(await existe("groups/g-so-meu")));

// ---- correr duas vezes não pode rebentar ------------------------------------
// Uma pessoa que carrega duas vezes, ou uma rede que repete o pedido, não pode
// receber um erro de servidor por a conta já não existir.
let segunda = "correu";
try { await mod.__test.apagarConta(EU); } catch (e) { segunda = e && e.message; }
ok("apagar outra vez não rebenta", segunda === "correu", segunda);

await limpar();

// ---- o que este ficheiro NÃO cobre ------------------------------------------
//
// A camada HTTP: que o `conta` recuse um pedido sem token, ou com o uid de outra
// pessoa no corpo. São quinze linhas copiadas do `ai`, que já corre em produção.
//
// E o comportamento em produção com uma conta grande: aqui apagam-se dois
// comentários, não seiscentos. Os lotes de 400 existem para isso, mas quem os vê
// a funcionar a sério é o primeiro apagamento real.

console.log(falhas ? `\n${falhas} falha(s)` : "\napagar conta: leva o que é meu e deixa o que é dos outros");
process.exit(falhas ? 1 : 0);
