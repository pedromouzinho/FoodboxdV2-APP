// Shared cloud list, backed by Firebase Firestore. Talks to Firestore's REST
// API directly with fetch (no SDK/CDN needed), so additions made by anyone
// show up for everyone.
//
// If FIREBASE_PROJECT_ID / FIREBASE_API_KEY are blank, every method is a safe
// no-op and the app falls back to per-browser localStorage additions.

const DB = (() => {
  let collectionUrl = "";
  let apiKey = "";
  let ready = false;

  function init() {
    if (!CONFIG.FIREBASE_PROJECT_ID || !CONFIG.FIREBASE_API_KEY) return;
    apiKey = CONFIG.FIREBASE_API_KEY;
    collectionUrl =
      `https://firestore.googleapis.com/v1/projects/${CONFIG.FIREBASE_PROJECT_ID}` +
      `/databases/(default)/documents/restaurants`;
    ready = true;
  }

  function isAvailable() {
    return ready;
  }

  // ---- Firestore typed-value encoding/decoding -----------------------------

  function encodeValue(value) {
    if (typeof value === "number") return { doubleValue: value };
    if (typeof value === "boolean") return { booleanValue: value };
    if (Array.isArray(value)) {
      return { arrayValue: { values: value.map(encodeValue) } };
    }
    return { stringValue: value == null ? "" : String(value) };
  }

  function decodeValue(value) {
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.doubleValue !== undefined) return Number(value.doubleValue);
    if (value.integerValue !== undefined) return Number(value.integerValue);
    if (value.booleanValue !== undefined) return value.booleanValue;
    if (value.timestampValue !== undefined) return value.timestampValue;
    if (value.arrayValue !== undefined) {
      return (value.arrayValue.values || []).map(decodeValue);
    }
    return null;
  }

  function encodeFields(restaurant) {
    return {
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
  }

  function docToRestaurant(doc) {
    const fields = doc.fields || {};
    const decoded = {};
    Object.keys(fields).forEach((key) => {
      decoded[key] = decodeValue(fields[key]);
    });
    return {
      id: doc.name.split("/").pop(),
      name: decoded.name,
      town: decoded.town,
      region: decoded.region || "Alentejo",
      category: decoded.category || "tradicional",
      lat: decoded.lat,
      lng: decoded.lng,
      notes: decoded.notes || "",
      tags: decoded.tags || [decoded.category || "tradicional"],
      mapsQuery: decoded.mapsQuery || `${decoded.name}, ${decoded.town}, Portugal`,
      createdAt: decoded.createdAt || "",
      source: "community"
    };
  }

  // ---- Public API ----------------------------------------------------------

  async function fetchAll() {
    if (!ready) return [];
    try {
      const res = await fetch(`${collectionUrl}?key=${encodeURIComponent(apiKey)}&pageSize=300`);
      if (!res.ok) return [];
      const data = await res.json();
      const docs = data.documents || [];
      return docs
        .map(docToRestaurant)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    } catch (e) {
      return [];
    }
  }

  async function add(restaurant) {
    if (!ready) throw new Error("Cloud database not configured.");
    const res = await fetch(`${collectionUrl}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: encodeFields(restaurant) })
    });
    if (!res.ok) {
      throw new Error(`Could not save (${res.status}).`);
    }
    const doc = await res.json();
    return docToRestaurant(doc);
  }

  return { init, isAvailable, fetchAll, add };
})();
