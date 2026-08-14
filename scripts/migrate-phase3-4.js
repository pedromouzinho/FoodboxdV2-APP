// One-off migration for the two-axis categories (Phase 3) and the follow-based
// social model (Phase 4). NOT part of the app — run it manually, once, right
// before deploying the matching client:
//
//   GOOGLE_APPLICATION_CREDENTIALS=/path/sa.json node scripts/migrate-phase3-4.js [--apply]
//
// Without --apply it only prints what it would do. The follow/profile steps must
// run BEFORE the new firestore.rules go live, or people briefly lose their feed.

const admin = require("../functions/node_modules/firebase-admin");

const APPLY = process.argv.includes("--apply");
const CUISINES = [
  "portuguesa", "mariscos", "churrasco", "italiana", "japonesa", "asiatica",
  "indiana", "americana", "mexicana", "mediterranica", "vegetariana", "doces", "cafe"
];
const STYLES = ["tasca", "petiscos", "fine-dining", "casual", "takeaway"];
const LEGACY = {
  tradicional: { cuisine: "portuguesa", styles: ["tasca"] },
  petiscos: { cuisine: "portuguesa", styles: ["petiscos"] },
  pastelaria: { cuisine: "doces", styles: [] },
  "fine-dining": { cuisine: "portuguesa", styles: ["fine-dining"] }
};

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

// Ask the deployed `ai` function to classify a place on both axes. Falls back to
// the legacy mapping when the AI can't answer, so a place is never left blank.
async function classify(idToken, r) {
  try {
    const res = await fetch("https://app-restaurantes-499400.web.app/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + idToken },
      body: JSON.stringify({
        action: "categorize",
        name: r.name, town: r.town, notes: r.notes || "",
        googleTypes: r.tags || [], priceLevel: ""
      })
    });
    if (!res.ok) return null;
    const out = (await res.json()).result;
    if (!out || !CUISINES.includes(out.cuisine)) return null;
    return { cuisine: out.cuisine, styles: (out.styles || []).filter((s) => STYLES.includes(s)) };
  } catch (e) { return null; }
}

async function idTokenForMigration() {
  const custom = await admin.auth().createCustomToken("migration-bot");
  const key = "AIzaSyC0jNIN7D7g5gTpMWZYC8pk36fvJXuUrnc"; // public web API key
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${key}`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: custom, returnSecureToken: true }) }
  );
  return (await res.json()).idToken;
}

async function migrateCategories() {
  console.log("\n=== FASE 3 — cozinha + estilo ===");
  const token = await idTokenForMigration();
  const snap = await db.collection("restaurants").get();
  let changed = 0;
  for (const doc of snap.docs) {
    const r = doc.data();
    if (r.cuisine) { console.log(`  (já feito) ${r.name}`); continue; }
    const ai = await classify(token, r);
    const fallback = LEGACY[r.category] || LEGACY.tradicional;
    const next = ai || fallback;
    console.log(`  ${r.name}: ${r.category} -> ${next.cuisine} [${next.styles.join(", ") || "—"}]${ai ? "" : "  (fallback)"}`);
    if (APPLY) await doc.ref.update({ cuisine: next.cuisine, styles: next.styles });
    changed++;
  }
  console.log(`  ${changed} restaurantes ${APPLY ? "atualizados" : "a atualizar"}`);
}

async function migrateSocial() {
  console.log("\n=== FASE 4 — profiles + follows cruzados ===");
  const snap = await db.collection("userData").get();
  const users = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  console.log(`  ${users.length} utilizadores`);

  for (const u of users) {
    console.log(`  profile: ${u.displayName || u.uid}`);
    if (APPLY) {
      await db.collection("profiles").doc(u.uid).set({
        displayName: u.displayName || "", photoURL: u.photoURL || "",
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
  }
  // Everyone who is already using the app keeps seeing everyone else — the point
  // of the migration is to change the MODEL, not to empty anyone's feed.
  let edges = 0;
  for (const a of users) {
    for (const b of users) {
      if (a.uid === b.uid) continue;
      if (APPLY) {
        await db.collection("follows").doc(`${a.uid}_${b.uid}`).set({
          followerUid: a.uid, targetUid: b.uid, createdAt: new Date().toISOString()
        }, { merge: true });
      }
      edges++;
    }
  }
  console.log(`  ${edges} follows ${APPLY ? "criados" : "a criar"}`);
}

(async () => {
  console.log(APPLY ? "MODO: aplicar" : "MODO: simulação (usa --apply para gravar)");
  await migrateCategories();
  await migrateSocial();
  console.log("\nFeito.");
  process.exit(0);
})().catch((e) => { console.error("ERRO", e); process.exit(1); });
