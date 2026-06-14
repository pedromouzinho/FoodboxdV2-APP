// Per-person marks (visited / priority / ratings+notes / visit history) and the
// group view (everyone's marks), layered on top of DB (Firestore).
//
// Two modes:
//   • Signed out  → "visited" uses localStorage (Storage); priority/ratings/
//                    history are disabled (the UI invites you to sign in).
//   • Signed in   → everything reads/writes my userData/{uid} cloud doc, and
//                    the group's docs are loaded so friends see each other.
//
// On first ever sign-in we migrate any local "visited" into the cloud so the
// switch is seamless.

const UserData = (() => {
  let cloud = false; // signed in + Firebase available
  let uid = "";
  let displayName = "";
  let photoURL = "";
  let getToken = null; // async () => idToken
  let onboarded = false; // has this account already seen the onboarding tour?

  // my marks (used in cloud mode)
  let mine = { visited: new Set(), priority: new Set(), ratings: {}, history: {} };
  let group = []; // [{ uid, displayName, photoURL, visited:[], priority:[], ratings:{}, history:{} }]

  let onChange = null; // called after async loads complete
  let saveTimer = null;

  function init(opts) {
    onChange = (opts && opts.onChange) || null;
  }

  function isCloud() {
    return cloud;
  }
  function me() {
    return { uid, displayName, photoURL };
  }

  // ---- session lifecycle ----
  async function setUser(user, tokenGetter) {
    uid = user.uid;
    displayName = user.displayName || user.email || "Amigo";
    photoURL = user.photoURL || "";
    getToken = tokenGetter;
    cloud = DB.isAvailable();
    if (!cloud) return;

    try {
      const token = await getToken();
      let doc = await DB.fetchUserDoc(uid, token);
      const firstTime = !doc;
      if (!doc) doc = {};
      mine = {
        visited: new Set(doc.visited || []),
        priority: new Set(doc.priority || []),
        ratings: doc.ratings || {},
        history: doc.history || {}
      };
      // Prefer a custom profile photo saved in the cloud over Google's, so it
      // survives the next sign-in.
      if (doc.photoURL) photoURL = doc.photoURL;
      // Onboarding is once-per-account (cloud), so the tour can't reappear on a
      // new device / the installed PWA's separate storage.
      onboarded = doc.onboarded === true;
      // First sign-in: fold in whatever was marked locally before logging in.
      if (firstTime) {
        Storage.getVisited().forEach((id) => mine.visited.add(id));
        await persistNow();
      }
      await reloadGroup();
    } catch (e) {
      // On failure, degrade to local-only so the app still works.
      cloud = false;
    }
    if (onChange) onChange();
  }

  function clearUser() {
    cloud = false;
    uid = displayName = photoURL = "";
    getToken = null;
    onboarded = false;
    mine = { visited: new Set(), priority: new Set(), ratings: {}, history: {} };
    group = [];
    if (onChange) onChange();
  }

  async function reloadGroup() {
    if (!cloud) {
      group = [];
      return;
    }
    try {
      const token = await getToken();
      group = await DB.fetchAllUsers(token);
    } catch (e) {
      group = [];
    }
  }

  // Update my profile photo (custom upload) — persists and refreshes the UI.
  function setPhotoURL(url) {
    photoURL = url || "";
    if (!cloud) { if (onChange) onChange(); return; }
    syncMineToGroup();
    persistNow().catch(() => {});
    if (onChange) onChange();
  }

  // Keep my entry in the in-memory group snapshot current so badges (visited
  // by N, group average) reflect my changes immediately, before the save lands.
  function syncMineToGroup() {
    if (!cloud) return;
    const snap = {
      uid,
      displayName,
      photoURL,
      visited: [...mine.visited],
      priority: [...mine.priority],
      ratings: mine.ratings,
      history: mine.history
    };
    const idx = group.findIndex((g) => g.uid === uid);
    if (idx >= 0) group[idx] = snap;
    else group.push(snap);
  }

  // ---- persistence (debounced full-doc write) ----
  function scheduleSave() {
    if (!cloud) return;
    syncMineToGroup();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      persistNow().catch(() => {});
    }, 500);
  }
  async function persistNow() {
    if (!cloud) return;
    const token = await getToken();
    await DB.saveUserDoc(
      uid,
      {
        displayName,
        photoURL,
        visited: [...mine.visited],
        priority: [...mine.priority],
        ratings: mine.ratings,
        history: mine.history,
        onboarded
      },
      token
    );
    syncMineToGroup();
  }

  // ---- onboarding (tour shown once per account) ----
  function isOnboarded() { return cloud && onboarded; }
  function markOnboarded() {
    if (!cloud || onboarded) return;
    onboarded = true;
    scheduleSave();
  }

  // ---- visited (works in both modes) ----
  function isVisited(id) {
    return cloud ? mine.visited.has(id) : Storage.isVisited(id);
  }
  function setVisited(id, on) {
    if (cloud) {
      if (on) mine.visited.add(id);
      else mine.visited.delete(id);
      scheduleSave();
    } else {
      Storage.setVisited(id, on);
    }
  }
  function visitedCount(ids) {
    return ids.filter((id) => isVisited(id)).length;
  }

  // ---- priority / ratings / history (cloud only) ----
  function isPriority(id) {
    return cloud && mine.priority.has(id);
  }
  function setPriority(id, on) {
    if (!cloud) return;
    if (on) mine.priority.add(id);
    else mine.priority.delete(id);
    scheduleSave();
  }
  function getRating(id) {
    return (cloud && mine.ratings[id]) || null;
  }
  function setRating(id, stars, note, dishes) {
    if (!cloud) return;
    const list = Array.isArray(dishes) ? dishes : [];
    if (!stars && !note && !list.length) {
      delete mine.ratings[id];
    } else {
      mine.ratings[id] = { stars: stars || 0, note: note || "", dishes: list, updatedAt: new Date().toISOString() };
    }
    scheduleSave();
  }
  function getHistory(id) {
    return (cloud && mine.history[id]) || [];
  }
  function addVisit(id, isoDate) {
    if (!cloud) return;
    const list = mine.history[id] || [];
    list.push(isoDate);
    list.sort();
    mine.history[id] = list;
    mine.visited.add(id); // a recorded visit implies visited
    scheduleSave();
  }
  function removeVisit(id, isoDate) {
    if (!cloud) return;
    const list = mine.history[id] || [];
    const idx = list.indexOf(isoDate);
    if (idx >= 0) list.splice(idx, 1);
    if (list.length) mine.history[id] = list;
    else delete mine.history[id];
    scheduleSave();
  }
  function lastVisit(id) {
    const h = getHistory(id);
    return h.length ? h[h.length - 1] : null;
  }

  // ---- group queries ----
  function others() {
    return group.filter((g) => g.uid !== uid);
  }
  // Everyone in the group, including me (group already holds my synced snapshot).
  function everyone() {
    return group.slice();
  }
  // Everyone (incl. me) who has visited this restaurant.
  function visitedBy(id) {
    return group.filter((g) => (g.visited || []).includes(id));
  }
  // Everyone (incl. me) who flagged it as priority.
  function priorityBy(id) {
    return group.filter((g) => (g.priority || []).includes(id));
  }
  // Ratings from the group (incl. me) for this restaurant.
  function ratingsFor(id) {
    return group
      .map((g) => {
        const r = (g.ratings || {})[id];
        const dishes = (r && Array.isArray(r.dishes)) ? r.dishes : [];
        if (!r || (!r.stars && !r.note && !dishes.length)) return null;
        return { uid: g.uid, name: g.displayName, photoURL: g.photoURL, stars: r.stars || 0, note: r.note || "", dishes, updatedAt: r.updatedAt || "" };
      })
      .filter(Boolean);
  }
  function avgRating(id) {
    const rs = ratingsFor(id).filter((r) => r.stars > 0);
    if (!rs.length) return null;
    return rs.reduce((s, r) => s + r.stars, 0) / rs.length;
  }

  return {
    init,
    isCloud,
    me,
    setUser,
    setPhotoURL,
    isOnboarded,
    markOnboarded,
    clearUser,
    reloadGroup,
    isVisited,
    setVisited,
    visitedCount,
    isPriority,
    setPriority,
    getRating,
    setRating,
    getHistory,
    addVisit,
    removeVisit,
    lastVisit,
    others,
    everyone,
    visitedBy,
    priorityBy,
    ratingsFor,
    avgRating
  };
})();
