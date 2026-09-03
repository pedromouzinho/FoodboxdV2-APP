# FOODBOXD — DIFF REPORT

**Source (a):** GitHub Repo (branch: `claude/beautiful-davinci-vsyokk`)
**Target (b):** Workspace (`/Users/x251367@bcpcorp.net/dbdeai`)
**Date:** 2026-06-16

## Summary

- **5 files modified**, **1 new file**
- **+130 lines added**, **-10 lines removed**
- Features: Wishlist timestamps, Geo validation, Photo source attribution, SEC-001 fix

---

## js/userdata.js (+29 -6 lines)

### Changes:
- Added `priorityAt: {}` to `mine` state object
- Added timestamp logic to `setPriority()` (writes ISO timestamp on add, deletes on remove)
- Added `priorityAt` to `persistNow` payload
- Added `priorityAt(id)` getter function
- Added `canSeeUser(targetUid)` helper (SEC-001 fix)
- Exposed both in module return

```diff
@@ mine state @@
-  let mine = { visited: new Set(), priority: new Set(), ratings: {}, history: {} };
+  let mine = { visited: new Set(), priority: new Set(), ratings: {}, history: {}, priorityAt: {} };

@@ setUser - doc loading @@
         ratings: doc.ratings || {},
-        history: doc.history || {}
+        history: doc.history || {},
+        priorityAt: doc.priorityAt || {}
       };

@@ clearUser @@
-    mine = { visited: new Set(), priority: new Set(), ratings: {}, history: {} };
+    mine = { visited: new Set(), priority: new Set(), ratings: {}, history: {}, priorityAt: {} };

@@ persistNow payload @@
       priority: [...mine.priority],
+        priorityAt: mine.priorityAt,
       ratings: mine.ratings,

@@ setPriority @@
   function setPriority(id, on) {
     if (!cloud) return;
-    if (on) mine.priority.add(id);
-    else mine.priority.delete(id);
+    if (on) {
+      mine.priority.add(id);
+      if (!mine.priorityAt[id]) mine.priorityAt[id] = new Date().toISOString();
+    } else {
+      mine.priority.delete(id);
+      delete mine.priorityAt[id];
+    }
     scheduleSave();
   }

@@ NEW: priorityAt getter @@
+  function priorityAt(id) {
+    return (cloud && mine.priorityAt && mine.priorityAt[id]) || null;
+  }

@@ NEW: canSeeUser (SEC-001) @@
+  function canSeeUser(targetUid) {
+    if (!cloud || !targetUid) return false;
+    if (targetUid === uid) return true;
+    return group.some((g) => g.uid === targetUid);
+  }

@@ return object @@
-    leaveGroup
+    leaveGroup,
+    canSeeUser,
+    priorityAt
   };
```

---

## js/app.js (+5 -3 lines)

### Changes:
- `renderPhotos`: filter `others` by `canSeeUser()` + empty array for unauthenticated
- `photoTile()`: added `data-photo-source`, `data-photo-badge`, `data-photo-uid`
- Google gallery images: added `data-photo-source="google"` + badge

```diff
@@ renderPhotos — others filter (SEC-001) @@
-    const others = me ? photos.filter((p) => p.uid !== me.uid) : photos;
+    const others = me ? photos.filter((p) => p.uid !== me.uid && UserData.canSeeUser(p.uid)) : [];

@@ photoTile — source attribution @@
   function photoTile(p) {
-    return `<button type="button" class="photo-tile" data-photo-url="${esc(p.url)}" title="${esc(p.author || "")}">
+    const source = p.source || "user";
+    const badge = source === "google" ? "Google" : (p.author || "");
+    return `<button type="button" class="photo-tile" data-photo-url="${esc(p.url)}" data-photo-source="${source}" data-photo-badge="${esc(badge)}" data-photo-uid="${esc(p.uid || "")}" title="${esc(p.author || "")}">
       <img src="${esc(p.url)}" alt="" loading="lazy" />
     </button>`;
   }

@@ Google gallery images @@
-  `<img class="gallery-img" data-photo-url="${esc(p)}" src="${esc(p)}" ...>`
+  `<img class="gallery-img" data-photo-source="google" data-photo-badge="Google" data-photo-url="${esc(p)}" src="${esc(p)}" ...>`
```

---

## js/addRestaurant.js (+21 -0 lines)

### Changes:
- Added `pendingGeoConfirm` state variable
- Reset in `open()` and `close()`
- Geo validation block before `buildRestaurantFromForm` (2-click confirm)

```diff
@@ state @@
   let mode = "wishlist";
+  let pendingGeoConfirm = false;

@@ open() @@
     mode = m === "experience" ? "experience" : "wishlist";
+    pendingGeoConfirm = false;

@@ close() @@
     form.reset();
+    pendingGeoConfirm = false;

@@ onSubmit — after coords validation, before buildRestaurantFromForm @@
+      // Geo validation: warn if coords fall outside declared region (non-blocking)
+      if (!pendingGeoConfirm && typeof GeoValidate !== "undefined") {
+        const declaredRegion = regionInput ? regionInput.value.trim() : "";
+        try {
+          const check = GeoValidate.isWithinRegion(declaredRegion, coords.lat, coords.lng);
+          if (check && !check.ok) {
+            setStatus(
+              `Esta localização parece estar fora de ${declaredRegion || "Portugal"}. Carrega novamente para guardar mesmo assim.`,
+              "warning"
+            );
+            pendingGeoConfirm = true;
+            submitBtn.textContent = "Guardar mesmo assim";
+            submitBtn.disabled = false;
+            return;
+          }
+        } catch (e) { /* fail-open: ignore validation errors */ }
+      }
```

---

## js/geoValidate.js (NEW FILE — 50 lines)

Novo modulo IIFE. Bounding boxes NUTS-II + 10 distritos. `isWithinRegion(region, lat, lng)` retorna `{ ok, reason, expected }`. Fail-open by design.

```javascript
const GeoValidate = (() => {
  const REGION_BOUNDS = {
    "norte":    { latMin: 40.85, latMax: 42.20, lngMin: -8.90, lngMax: -6.15 },
    "centro":   { latMin: 39.40, latMax: 41.05, lngMin: -9.05, lngMax: -6.80 },
    "lisboa":   { latMin: 38.45, latMax: 39.45, lngMin: -9.55, lngMax: -8.55 },
    "alentejo": { latMin: 37.30, latMax: 39.50, lngMin: -8.95, lngMax: -6.90 },
    "algarve":  { latMin: 36.95, latMax: 37.55, lngMin: -9.00, lngMax: -7.35 },
    "acores":   { latMin: 36.90, latMax: 39.80, lngMin: -31.40, lngMax: -24.90 },
    "madeira":  { latMin: 32.35, latMax: 33.20, lngMin: -17.35, lngMax: -16.20 },
    "porto":    { latMin: 40.90, latMax: 41.50, lngMin: -8.75, lngMax: -7.90 },
    // + braga, coimbra, faro, evora, setubal, aveiro, leiria, viseu, santarem
  };
  const PORTUGAL_BOUNDS = { latMin: 32.30, latMax: 42.20, lngMin: -31.40, lngMax: -6.15 };

  function normalizeKey(s) { /* remove accents, lowercase */ }
  function inBox(box, lat, lng) { /* bounds check */ }

  function isWithinRegion(region, lat, lng) {
    // no-coords → ok: true
    // unknown region → ok: true (fail-open)
    // inside box → ok: true
    // outside box → ok: false, reason: "outside"
  }

  return { isWithinRegion };
})();
```

---

## css/style.css (+73 -0 lines)

### Changes (appended at end):

```css
/* Feed de amigos: chips de filtro (Feature 2) */
.feed-filters.chip-tabs { flex-wrap: nowrap; overflow-x: auto; overscroll-behavior-x: contain; ... }
.feed-filters .chip-tab { flex: 0 0 auto; scroll-snap-align: start; }

/* Geo validation warning (Feature 3) */
.geo-warn { display: flex; gap: var(--sp-2); padding: var(--sp-3); background: color-mix(...); ... }
@keyframes geo-warn-in { from { opacity: 0; } to { opacity: 1; } }

/* Fotos: distincao user vs Google (Feature 4) */
.photo-tile[data-photo-source="user"] { box-shadow: inset 0 0 0 2px var(--accent); }
.photo-tile[data-photo-source="google"] { box-shadow: inset 0 0 0 2px var(--text-muted); opacity: 0.85; }
.photo-tile[data-photo-source]::after { content: attr(data-photo-badge); position: absolute; ... }

/* Feed item hidden state */
.feed-item[hidden] { display: none !important; }
```

---

## index.html (+2 -1 lines)

### Changes:
- Added `<script src="js/geoValidate.js">` before `addRestaurant.js`

```diff
   <script src="js/planner.js"></script>
-  <script src="js/addRestaurant.js"></script>
+  <script src="js/geoValidate.js"></script>
+    <script src="js/addRestaurant.js"></script>
   <script src="js/ai.js"></script>
```

---

## Pendente

- [ ] `sw.js`: bump `foodboxd-v42` → `foodboxd-v43`
- [ ] Feature 2 (Filtros feed amigos): CSS pronto, falta JS wiring no `app.js`
- [ ] Testar `canSeeUser` com utilizadores em grupos diferentes
