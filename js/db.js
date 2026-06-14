// Shared cloud data, backed by Firebase Firestore (REST API, no SDK).
//   restaurants/  — community-added places (shown for everyone)
//   overrides/    — per-restaurant edits, e.g. category, shared for everyone
//   userData/     — one doc per signed-in person: their visited/priority/
//                   ratings/notes/history (personal, but visible to the group)
//   comments/     — shared comments per restaurant
//
// If FIREBASE_PROJECT_ID / FIREBASE_API_KEY are blank, every method is a safe
// no-op and the app falls back to per-browser localStorage.
//
// Authenticated calls (userData writes, comments) accept a Firebase ID token
// and send it as a Bearer header so Firestore rules see request.auth.uid.

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

  function authHeaders(token) {
    const h = { "Content-Type": "application/json" };
    if (token) h.Authorization = "Bearer " + token;
    return h;
  }

  // ---- Firestore typed-value encoding/decoding ----
  function encodeValue(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === "number") {
      return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    }
    if (typeof value === "boolean") return { booleanValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
    if (typeof value === "object") return { mapValue: { fields: encodeFields(value) } };
    return { stringValue: String(value) };
  }
  function encodeFields(obj) {
    const f = {};
    Object.entries(obj || {}).forEach(([k, v]) => (f[k] = encodeValue(v)));
    return f;
  }
  function decodeValue(v) {
    if (v.stringValue !== undefined) return v.stringValue;
    if (v.doubleValue !== undefined) return Number(v.doubleValue);
    if (v.integerValue !== undefined) return Number(v.integerValue);
    if (v.booleanValue !== undefined) return v.booleanValue;
    if (v.timestampValue !== undefined) return v.timestampValue;
    if (v.nullValue !== undefined) return null;
    if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(decodeValue);
    if (v.mapValue !== undefined) return decodeFields(v.mapValue);
    return null;
  }
  function decodeFields(doc) {
    const out = {};
    Object.entries((doc && doc.fields) || {}).forEach(([k, v]) => (out[k] = decodeValue(v)));
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
      addedByUid: f.addedByUid || "",
      addedByName: f.addedByName || "",
      verified: f.verified === true,
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

  // token is optional: when present (signed in) we stamp who added the place.
  async function add(restaurant, token) {
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
      verified: encodeValue(!!restaurant.verified),
      createdAt: { timestampValue: new Date().toISOString() }
    };
    if (restaurant.addedByUid) fields.addedByUid = encodeValue(restaurant.addedByUid);
    if (restaurant.addedByName) fields.addedByName = encodeValue(restaurant.addedByName);
    const res = await fetch(`${docsBase}/restaurants?${keyQ()}`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Could not save (${res.status}).`);
    return docToRestaurant(await res.json());
  }

  // Delete a community restaurant (Firestore rules only allow its author).
  async function deleteRestaurant(id, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const res = await fetch(`${docsBase}/restaurants/${encodeURIComponent(id)}?${keyQ()}`, {
      method: "DELETE",
      headers: authHeaders(token)
    });
    if (!res.ok) throw new Error(`Could not delete (${res.status}).`);
    return true;
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
      headers: authHeaders(),
      body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Could not save (${res.status}).`);
    return true;
  }

  // ---- Per-user data (userData/{uid}) ----
  // Stored shape: { displayName, photoURL, visited:[id], priority:[id],
  //   ratings:{ id:{stars,note,updatedAt} }, history:{ id:[ISO date] } }

  // Load one person's doc. Returns the decoded object, or null if it doesn't
  // exist yet (HTTP 404). Needs a token (rules require auth to read).
  async function fetchUserDoc(uid, token) {
    if (!ready) return null;
    const res = await fetch(`${docsBase}/userData/${encodeURIComponent(uid)}?${keyQ()}`, {
      headers: authHeaders(token)
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Could not load profile (${res.status}).`);
    return decodeFields(await res.json());
  }

  // Overwrite my own doc (rules allow only request.auth.uid == uid).
  async function saveUserDoc(uid, data, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const fields = encodeFields({
      displayName: data.displayName || "",
      photoURL: data.photoURL || "",
      visited: data.visited || [],
      priority: data.priority || [],
      ratings: data.ratings || {},
      history: data.history || {},
      updatedAt: new Date().toISOString()
    });
    const res = await fetch(`${docsBase}/userData/${encodeURIComponent(uid)}?${keyQ()}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Could not save profile (${res.status}).`);
    return true;
  }

  // Everyone's docs (for the group view). Needs a token (rules require auth).
  async function fetchAllUsers(token) {
    if (!ready) return [];
    try {
      const res = await fetch(`${docsBase}/userData?${keyQ()}&pageSize=300`, {
        headers: authHeaders(token)
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.documents || []).map((doc) => {
        const f = decodeFields(doc);
        return {
          uid: doc.name.split("/").pop(),
          displayName: f.displayName || "",
          photoURL: f.photoURL || "",
          visited: f.visited || [],
          priority: f.priority || [],
          ratings: f.ratings || {},
          history: f.history || {}
        };
      });
    } catch (e) {
      return [];
    }
  }

  // ---- Comments (comments/{autoId}) ----
  async function fetchComments(restaurantId) {
    if (!ready) return [];
    try {
      // Equality filter only (single-field auto index — no composite index
      // needed). We order by createdAt client-side below.
      const body = {
        structuredQuery: {
          from: [{ collectionId: "comments" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "restaurantId" },
              op: "EQUAL",
              value: { stringValue: restaurantId }
            }
          },
          limit: 100
        }
      };
      const res = await fetch(`${docsBase}:runQuery?${keyQ()}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
      if (!res.ok) return [];
      const rows = await res.json();
      return (rows || [])
        .filter((row) => row.document)
        .map((row) => {
          const f = decodeFields(row.document);
          return {
            id: row.document.name.split("/").pop(),
            uid: f.uid || "",
            author: f.author || "Anónimo",
            photoURL: f.photoURL || "",
            text: f.text || "",
            createdAt: f.createdAt || ""
          };
        })
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    } catch (e) {
      return [];
    }
  }

  // Map a runQuery row to a comment object (includes restaurantId so callers
  // can link a critique back to its restaurant).
  function rowToComment(row) {
    const f = decodeFields(row.document);
    return {
      id: row.document.name.split("/").pop(),
      restaurantId: f.restaurantId || "",
      uid: f.uid || "",
      author: f.author || "Anónimo",
      photoURL: f.photoURL || "",
      text: f.text || "",
      createdAt: f.createdAt || ""
    };
  }

  // All comments written by one user, across every restaurant (newest first).
  async function fetchCommentsByUser(uid, max) {
    if (!ready || !uid) return [];
    try {
      const body = {
        structuredQuery: {
          from: [{ collectionId: "comments" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "uid" },
              op: "EQUAL",
              value: { stringValue: uid }
            }
          },
          limit: max || 100
        }
      };
      const res = await fetch(`${docsBase}:runQuery?${keyQ()}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
      if (!res.ok) return [];
      const rows = await res.json();
      return (rows || [])
        .filter((row) => row.document)
        .map(rowToComment)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    } catch (e) {
      return [];
    }
  }

  // Most recent comments across every restaurant and user (newest first).
  async function fetchRecentComments(max) {
    if (!ready) return [];
    try {
      const body = {
        structuredQuery: {
          from: [{ collectionId: "comments" }],
          orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
          limit: max || 100
        }
      };
      const res = await fetch(`${docsBase}:runQuery?${keyQ()}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
      if (!res.ok) return [];
      const rows = await res.json();
      return (rows || [])
        .filter((row) => row.document)
        .map(rowToComment)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    } catch (e) {
      return [];
    }
  }

  async function addComment(comment, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const fields = encodeFields({
      restaurantId: comment.restaurantId,
      uid: comment.uid,
      author: comment.author,
      photoURL: comment.photoURL || "",
      text: comment.text
    });
    fields.createdAt = { timestampValue: new Date().toISOString() };
    const res = await fetch(`${docsBase}/comments?${keyQ()}`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Could not post comment (${res.status}).`);
    const doc = await res.json();
    const f = decodeFields(doc);
    return {
      id: doc.name.split("/").pop(),
      uid: f.uid,
      author: f.author,
      photoURL: f.photoURL || "",
      text: f.text,
      createdAt: f.createdAt || new Date().toISOString()
    };
  }

  // ---- Photos (photos/{autoId}) — metadata only; file lives in Storage ----
  async function fetchPhotos(restaurantId) {
    if (!ready) return [];
    try {
      const body = {
        structuredQuery: {
          from: [{ collectionId: "photos" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "restaurantId" },
              op: "EQUAL",
              value: { stringValue: restaurantId }
            }
          },
          limit: 100
        }
      };
      const res = await fetch(`${docsBase}:runQuery?${keyQ()}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
      if (!res.ok) return [];
      const rows = await res.json();
      return (rows || [])
        .filter((row) => row.document)
        .map((row) => {
          const f = decodeFields(row.document);
          return {
            id: row.document.name.split("/").pop(),
            uid: f.uid || "",
            author: f.author || "",
            url: f.url || "",
            path: f.path || "",
            createdAt: f.createdAt || ""
          };
        })
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    } catch (e) {
      return [];
    }
  }

  // Most recent photos across every restaurant and user (newest first).
  async function fetchRecentPhotos(max) {
    if (!ready) return [];
    try {
      const body = {
        structuredQuery: {
          from: [{ collectionId: "photos" }],
          orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
          limit: max || 60
        }
      };
      const res = await fetch(`${docsBase}:runQuery?${keyQ()}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
      if (!res.ok) return [];
      const rows = await res.json();
      return (rows || [])
        .filter((row) => row.document)
        .map((row) => {
          const f = decodeFields(row.document);
          return {
            id: row.document.name.split("/").pop(),
            restaurantId: f.restaurantId || "",
            uid: f.uid || "",
            author: f.author || "",
            url: f.url || "",
            path: f.path || "",
            createdAt: f.createdAt || ""
          };
        })
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    } catch (e) {
      return [];
    }
  }

  async function addPhoto(photo, token) {
    if (!ready) throw new Error("Cloud database not configured.");
    const fields = encodeFields({
      restaurantId: photo.restaurantId,
      uid: photo.uid,
      author: photo.author || "",
      url: photo.url,
      path: photo.path || ""
    });
    fields.createdAt = { timestampValue: new Date().toISOString() };
    const res = await fetch(`${docsBase}/photos?${keyQ()}`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Could not save photo (${res.status}).`);
    const doc = await res.json();
    const f = decodeFields(doc);
    return {
      id: doc.name.split("/").pop(),
      uid: f.uid,
      author: f.author || "",
      url: f.url,
      path: f.path || "",
      createdAt: f.createdAt || new Date().toISOString()
    };
  }

  return {
    init,
    isAvailable,
    fetchAll,
    add,
    deleteRestaurant,
    fetchOverrides,
    setOverride,
    fetchUserDoc,
    saveUserDoc,
    fetchAllUsers,
    fetchComments,
    fetchCommentsByUser,
    fetchRecentComments,
    addComment,
    fetchPhotos,
    fetchRecentPhotos,
    addPhoto
  };
})();
