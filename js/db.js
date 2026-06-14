// Shared cloud data, backed by Firebase Firestore (REST API, no SDK).
//   restaurants/  — community-added places (shown for everyone)
//   overrides/    — per-restaurant edits, e.g. category, shared for everyone
//
// If FIREBASE_PROJECT_ID / FIREBASE_API_KEY are blank, every method is a safe
// no-op and the app falls back to per-browser localStorage.

const DB = (() => {
  let docsBase = "";
  let apiKey = "";
  let ready = false;

  function init() {
    if (!CONFIG.FIREBASE_PROJECT_ID || !CONFIG.FIREBASE_API_KEY) return;
    apiKey = CONFIG.FIREBASE_API_KEY;
    docsBase = `https://firestore.googleapis.com/v1/projects/${CONFIG.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
    ready = true;
  }

  function isAvailable() {
    return ready;
  }

  function keyQ() {
    return `key=${encodeURIComponent(apiKey)}`;
  }

  // ---- Firestore typed-value encoding/decoding ----
  function encodeValue(value) {
    if (typeof value === "number") return { doubleValue: value };
    if (typeof value === "boolean") return { booleanValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
    return { stringValue: value == null ? "" : String(value) };
  }
  function decodeValue(v) {
    if (v.stringValue !== undefined) return v.stringValue;
    if (v.doubleValue !== undefined) return Number(v.doubleValue);
    if (v.integerValue !== undefined) return Number(v.integerValue);
    if (v.booleanValue !== undefined) return v.booleanValue;
    if (v.timestampValue !== undefined) return v.timestampValue;
    if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(decodeValue);
    return null;
  }
  function decodeFields(doc) {
    const out = {};
    Object.entries(doc.fields || {}).forEach(([k, v]) => (out[k] = decodeValue(v)));
    return out;
  }

  function docToRestaurant(doc) {
    const f = decodeFields(doc);
    return {
      id: doc.name.split("/").pop(),
      name: f.name,
      town: f.town,
      region: f.region || "Alentejo",
      category: f.category || "tradicional",
      lat: f.lat,
      lng: f.lng,
      notes: f.notes || "",
      tags: f.tags || [f.category || "tradicional"],
      mapsQuery: f.mapsQuery || `${f.name}, ${f.town}, Portugal`,
      createdAt: f.createdAt || "",
      source: "community"
    };
  }

  // ---- Restaurants ----
  async function fetchAll() {
    if (!ready) return [];
    try {
      const res = await fetch(`${docsBase}/restaurants?${keyQ()}&pageSize=300`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.documents || [])
        .map(docToRestaurant)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    } catch (e) {
      return [];
    }
  }

  async function add(restaurant) {
    if (!ready) throw new Error("Cloud database not configured.");
    const fields = {
      name: encodeValue(restaurant.name),
      town: encodeValue(restaurant.town),
      region: encodeValue(restaurant.region),
      category: encodeValue(restaurant.category),
      lat: encodeValue(restaurant.lat),
      lng: encodeValue(restaurant.lng),
      notes: encodeValue(restaurant.notes || ""),
      tags: encodeValue(restaurant.tags || [restaurant.category]),
      mapsQuery: encodeValue(restaurant.mapsQuery),
      createdAt: { timestampValue: new Date().toISOString() }
    };
    const res = await fetch(`${docsBase}/restaurants?${keyQ()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Could not save (${res.status}).`);
    return docToRestaurant(await res.json());
  }

  // ---- Overrides (shared edits, e.g. category) ----
  async function fetchOverrides() {
    if (!ready) return {};
    try {
      const res = await fetch(`${docsBase}/overrides?${keyQ()}&pageSize=300`);
      if (!res.ok) return {};
      const data = await res.json();
      const map = {};
      (data.documents || []).forEach((doc) => {
        const id = doc.name.split("/").pop();
        const f = decodeFields(doc);
        if (f.category) map[id] = f.category;
      });
      return map;
    } catch (e) {
      return {};
    }
  }

  // Upsert a single restaurant's category override (shared for everyone).
  async function setOverride(id, category) {
    if (!ready) throw new Error("Cloud database not configured.");
    const fields = {
      category: encodeValue(category),
      updatedAt: { timestampValue: new Date().toISOString() }
    };
    const res = await fetch(`${docsBase}/overrides/${encodeURIComponent(id)}?${keyQ()}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Could not save (${res.status}).`);
    return true;
  }

  return { init, isAvailable, fetchAll, add, fetchOverrides, setOverride };
})();
