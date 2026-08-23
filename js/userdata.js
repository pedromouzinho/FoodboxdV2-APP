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
  let createdAt = ""; // quando a conta foi criada (metadata do Auth), para o Perfil
  let getToken = null; // async () => idToken
  let onboarded = false; // has this account already been through first-use?
  let homeTown = null;   // {name, lat, lng} — onde a pessoa come normalmente
  let tasteProfile = null; // last AI-generated taste profile (feeds "Sugere-me")
  let tasteGenDay = ""; // YYYY-MM-DD of the last background taste-profile run
  // O que a pessoa escreve sobre o próprio gosto. É a única fonte de preferência
  // sem sítio associado — "não como picante", "prefiro peixe", "detesto sítios
  // barulhentos" — coisas que nenhuma avaliação consegue revelar.
  let tasteNote = "";

  // my marks (used in cloud mode)
  let mine = { visited: new Set(), priority: new Set(), priorityAt: {}, ratings: {}, history: {} };
  let group = []; // the active social view: [{ uid, displayName, photoURL, visited:[], priority:[], ratings:{}, history:{} }]

  // Groups: every signed-in user is loaded into `allUsers`; `group` is `allUsers`
  // filtered to the active group's members (or everyone when no group is active).
  let allUsers = [];
  let myGroups = []; // [{ id, name, code, ownerUid, members:[uid] }]
  let activeGroupId = null; // null → "Todos" (global view)

  // Activity sharing scope. Default (and legacy docs): visible to everyone.
  let audienceGlobal = true;
  let shareGroupIds = []; // when not global, the group ids I chose to share with
  let visibleTo = []; // legacy: kept so older docs aren't broken by a rewrite
  let following = []; // uids I follow — the source of my feed from now on

  let onChange = null; // called after async loads complete
  let saveTimer = null;

  function init(opts) {
    onChange = (opts && opts.onChange) || null;
  }

  function isCloud() {
    return cloud;
  }
  function me() {
    return { uid, displayName, photoURL, createdAt };
  }

  // O nome chegou depois de a sessão já existir — é o caso da Apple, que só o
  // manda na primeira autorização e já com o `setUser` feito.
  //
  // Isto importa para lá do Perfil: o nome que os AMIGOS veem sai daqui, pelo
  // `upsertProfile`, e não do chip. Sem esta função, a pessoa passava a primeira
  // sessão inteira a aparecer como "Amigo" na lista de toda a gente — porque com
  // "Ocultar o meu email" o `emailUsavel` é vazio e o fallback do `setUser` é
  // mesmo esse. Curava-se no arranque seguinte, e a primeira sessão de uma conta
  // acabada de criar é precisamente onde isso não serve.
  //
  // De propósito não passa pelo `onAuthChange`: esse corre o `setUser` inteiro e
  // arranca o onboarding, e chamá-lo outra vez a meio da primeira sessão fá-lo-ia
  // arrancar duas vezes.
  async function nomeMudou(novo) {
    if (!novo || !uid || novo === displayName) return;
    displayName = novo;
    syncMineToGroup();          // a minha entrada no grupo passa a ter o nome
    if (onChange) onChange();   // redesenha o Perfil e as listas
    if (!cloud) return;
    try {
      const token = await getToken();
      await DB.upsertProfile(uid, { displayName, photoURL }, token);
    } catch (e) { /* fica para o arranque seguinte */ }
  }

  // ---- session lifecycle ----
  async function setUser(user, tokenGetter) {
    uid = user.uid;
    // O email serve de nome quando é um email de pessoa. Com "Ocultar o meu
    // email" da Apple é um endereço de reencaminhamento — `b7r5f2k72k@
    // privaterelay.appleid.com` — que não é nome de ninguém e ficava à vista
    // no Perfil e na lista de amigos. Nesse caso vale mais "Amigo".
    const emailUsavel = user.email && !/@privaterelay\.appleid\.com$/i.test(user.email)
      ? user.email : "";
    displayName = user.displayName || emailUsavel || "Amigo";
    photoURL = user.photoURL || "";
    createdAt = (user.metadata && user.metadata.creationTime) || "";
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
        priorityAt: doc.priorityAt || {},
        ratings: doc.ratings || {},
        history: doc.history || {}
      };
      // Prefer a custom profile photo saved in the cloud over Google's, so it
      // survives the next sign-in.
      if (doc.photoURL) photoURL = doc.photoURL;
      // Onboarding is once-per-account (cloud), so the tour can't reappear on a
      // new device / the installed PWA's separate storage.
      onboarded = doc.onboarded === true;
      homeTown = doc.homeTown || null;
      activeGroupId = doc.activeGroup || null;
      tasteProfile = doc.tasteProfile || null;
      tasteGenDay = doc.tasteGenDay || "";
      tasteNote = doc.tasteNote || "";
      audienceGlobal = doc.audienceGlobal !== false; // default + legacy: global
      shareGroupIds = Array.isArray(doc.shareGroups) ? doc.shareGroups : [];
      visibleTo = Array.isArray(doc.visibleTo) ? doc.visibleTo : [];
      const legacyAudience = doc.audienceGlobal === undefined; // stamp it so others can query me
      // First sign-in: fold in whatever was marked locally before logging in.
      if (firstTime) {
        Storage.getVisited().forEach((id) => mine.visited.add(id));
        await persistNow();
      }
      DB.upsertProfile(uid, { displayName, photoURL }, token).catch(() => {});
      await reloadGroup();
      // visibleTo is derived from current group membership — recompute and
      // re-persist if the snapshot drifted (e.g. someone joined a shared group).
      const fresh = computeVisibleTo();
      if (legacyAudience || fresh.join(",") !== visibleTo.join(",")) {
        visibleTo = fresh;
        if (!firstTime) persistNow().catch(() => {});
      } else {
        visibleTo = fresh;
      }
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
    homeTown = null;
    mine = { visited: new Set(), priority: new Set(), priorityAt: {}, ratings: {}, history: {} };
    group = [];
    allUsers = [];
    myGroups = [];
    activeGroupId = null;
    tasteProfile = null;
    tasteGenDay = "";
    tasteNote = "";
    createdAt = "";
    audienceGlobal = true;
    shareGroupIds = [];
    visibleTo = [];
    following = [];
    if (onChange) onChange();
  }

  async function reloadGroup() {
    if (!cloud) {
      group = allUsers = myGroups = [];
      return;
    }
    try {
      const token = await getToken();
      const [followIds, groups] = await Promise.all([
        DB.fetchFollowing(uid, token),
        DB.fetchMyGroups(uid, token)
      ]);
      following = followIds;
      // Everyone I follow, plus me. One read each — the rules can't validate a
      // bulk query against a follow edge.
      const users = await DB.fetchUsersByIds(followIds, token);
      allUsers = users;
      myGroups = groups;
      // Drop a stale active group (e.g. removed remotely).
      if (activeGroupId && !myGroups.some((g) => g.id === activeGroupId)) activeGroupId = null;
      applyGroupFilter();
    } catch (e) {
      group = allUsers = myGroups = [];
    }
  }

  // Narrow `allUsers` down to the active group's members (or show everyone).
  function applyGroupFilter() {
    const grp = activeGroupId ? myGroups.find((g) => g.id === activeGroupId) : null;
    if (grp) {
      const ids = new Set(grp.members || []);
      group = allUsers.filter((u) => ids.has(u.uid));
    } else {
      group = allUsers.slice();
    }
    syncMineToGroup();
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
      priorityAt: mine.priorityAt,
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
        priorityAt: mine.priorityAt,
        ratings: mine.ratings,
        history: mine.history,
        onboarded,
        homeTown: homeTown || null,
        activeGroup: activeGroupId || "",
        tasteProfile: tasteProfile || null,
        tasteGenDay: tasteGenDay || "",
        tasteNote: tasteNote || "",
        audienceGlobal,
        visibleTo: computeVisibleTo(),
        shareGroups: shareGroupIds
      },
      token
    );
    syncMineToGroup();
  }

  // The uids allowed to read my activity. Global → nobody special (rules let all
  // signed-in users read). Otherwise → the members of the groups I chose to share.
  function computeVisibleTo() {
    if (audienceGlobal) return [];
    const ids = new Set(shareGroupIds);
    const uids = new Set([uid]);
    myGroups.forEach((g) => { if (ids.has(g.id)) (g.members || []).forEach((m) => uids.add(m)); });
    return [...uids];
  }
  function getSharing() { return { global: audienceGlobal, groupIds: shareGroupIds.slice() }; }
  async function setSharing(opts) {
    if (!cloud) return;
    audienceGlobal = (opts && opts.global) !== false;
    shareGroupIds = opts && Array.isArray(opts.groupIds) ? opts.groupIds.slice() : [];
    visibleTo = computeVisibleTo();
    await persistNow();
    if (onChange) onChange();
  }
  // Leave a group: remove only my own uid from its members (rules allow this).
  async function leaveGroup(groupId) {
    if (!cloud) return;
    const g = myGroups.find((x) => x.id === groupId);
    if (!g) return;
    const token = await getToken();
    const members = (g.members || []).filter((m) => m !== uid);
    await DB.addGroupMember(groupId, members, token);
    myGroups = myGroups.filter((x) => x.id !== groupId);
    shareGroupIds = shareGroupIds.filter((id) => id !== groupId);
    if (activeGroupId === groupId) activeGroupId = null;
    visibleTo = computeVisibleTo();
    applyGroupFilter();
    await persistNow();
    if (onChange) onChange();
  }

  // ---- taste profile (AI-generated; durable so it keeps feeding recommend) ----
  function getTasteProfile() { return tasteProfile; }
  function setTasteProfile(p) {
    tasteProfile = p || null;
    if (cloud) persistNow().catch(() => {});
  }
  // Limite generoso mas real: é uma nota, não um ensaio, e vai num prompt.
  const TASTE_NOTE_MAX = 600;
  function getTasteNote() { return tasteNote; }
  function setTasteNote(t) {
    const v = String(t || "").trim().slice(0, TASTE_NOTE_MAX);
    if (v === tasteNote) return false;
    tasteNote = v;
    // A nota só vale se chegar ao perfil. Limpar a marca do dia faz com que a
    // próxima geração corra, em vez de a nota ficar guardada sem efeito até
    // amanhã. (`markTasteGen("")` não serve: o `||` lá dentro põe hoje.)
    tasteGenDay = "";
    if (cloud) persistNow().catch(() => {});
    return true;
  }

  function getTasteGenDay() { return tasteGenDay; }
  function markTasteGen(day) {
    tasteGenDay = day || new Date().toISOString().slice(0, 10);
    if (cloud) persistNow().catch(() => {});
  }

  // ---- groups (create / join by code / switch active) ----
  const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I/L
  function genCode(n = 6) {
    let s = "";
    for (let i = 0; i < n; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    return s;
  }
  function getGroups() { return myGroups.slice(); }
  function getActiveGroupId() { return activeGroupId; }
  function activeGroup() { return activeGroupId ? myGroups.find((g) => g.id === activeGroupId) || null : null; }

  // Switch the active social view (null = everyone). Persists the choice.
  function setActiveGroup(id) {
    activeGroupId = id || null;
    applyGroupFilter();
    if (cloud) persistNow().catch(() => {});
    if (onChange) onChange();
  }

  async function createGroup(name) {
    if (!cloud) throw new Error("Inicie sessão para criar um grupo.");
    const token = await getToken();
    const g = await DB.createGroup({ name: (name || "").trim() || "O meu grupo", code: genCode(), ownerUid: uid, members: [uid] }, token);
    myGroups.push(g);
    activeGroupId = g.id;
    applyGroupFilter();
    await persistNow();
    if (onChange) onChange();
    return g;
  }

  async function joinGroup(code) {
    if (!cloud) throw new Error("Inicie sessão para entrar num grupo.");
    const norm = (code || "").trim().toUpperCase();
    if (!norm) throw new Error("Introduza um código.");
    const token = await getToken();
    const g = await DB.fetchGroupByCode(norm, token);
    if (!g) throw new Error("Código não encontrado.");
    if (!(g.members || []).includes(uid)) {
      const members = [...(g.members || []), uid];
      await DB.addGroupMember(g.id, members, token);
      g.members = members;
    }
    if (!myGroups.some((x) => x.id === g.id)) myGroups.push(g);
    activeGroupId = g.id;
    // A group is a shortcut for "these people": joining follows them all, so the
    // feed keeps working in a follow-based world.
    await Promise.all((g.members || [])
      .filter((m) => m !== uid && !following.includes(m))
      .map((m) => DB.followUser(uid, m, token).then(() => { following.push(m); }).catch(() => {})));
    await reloadGroup();
    await persistNow();
    if (onChange) onChange();
    return g;
  }

  // ---- primeira utilização (uma vez por conta) ----
  function isOnboarded() { return cloud && onboarded; }
  function markOnboarded() {
    if (!cloud || onboarded) return;
    onboarded = true;
    scheduleSave();
  }
  // A cidade de referência centra o mapa em algo reconhecível em vez do centro
  // geográfico de Portugal. Campo novo: só acrescenta, nada depende dele.
  function getHomeTown() { return homeTown; }
  function setHomeTown(town) {
    if (!town || typeof town.lat !== "number" || typeof town.lng !== "number") return;
    homeTown = { name: String(town.name || ""), lat: town.lat, lng: town.lng };
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
    if (on) { mine.priority.add(id); if (!mine.priorityAt[id]) mine.priorityAt[id] = new Date().toISOString(); }
    else { mine.priority.delete(id); delete mine.priorityAt[id]; }
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
  // A visit entry is either a plain ISO string (legacy) or { date, with:[uid] }.
  // These two helpers are the only place that difference is allowed to matter —
  // they also normalize friends' docs, which can hold either shape.
  function visitDate(entry) {
    return typeof entry === "string" ? entry : ((entry && entry.date) || "");
  }
  function visitWith(entry) {
    return (entry && typeof entry === "object" && Array.isArray(entry.with)) ? entry.with : [];
  }
  function getHistory(id) {
    return (cloud && mine.history[id]) || [];
  }
  function addVisit(id, isoDate, withUids) {
    if (!cloud) return;
    const companions = Array.isArray(withUids) ? withUids.filter(Boolean) : [];
    const list = mine.history[id] || [];
    list.push(companions.length ? { date: isoDate, with: companions } : isoDate);
    list.sort((a, b) => (visitDate(a) < visitDate(b) ? -1 : 1));
    mine.history[id] = list;
    mine.visited.add(id); // a recorded visit implies visited
    scheduleSave();
  }
  function removeVisit(id, isoDate) {
    if (!cloud) return;
    const list = mine.history[id] || [];
    const idx = list.findIndex((e) => visitDate(e) === isoDate);
    if (idx >= 0) list.splice(idx, 1);
    if (list.length) mine.history[id] = list;
    else delete mine.history[id];
    scheduleSave();
  }
  function lastVisit(id) {
    const h = getHistory(id);
    return h.length ? visitDate(h[h.length - 1]) : null;
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
  // ---- following ----
  function getFollowing() { return following.slice(); }
  function isFollowing(targetUid) { return following.includes(targetUid); }
  async function follow(targetUid) {
    if (!cloud || !targetUid || targetUid === uid) return;
    const token = await getToken();
    await DB.followUser(uid, targetUid, token);
    if (!following.includes(targetUid)) following.push(targetUid);
    await reloadGroup();
    if (onChange) onChange();
  }
  async function unfollow(targetUid) {
    if (!cloud || !targetUid) return;
    const token = await getToken();
    await DB.unfollowUser(uid, targetUid, token);
    following = following.filter((u) => u !== targetUid);
    await reloadGroup();
    if (onChange) onChange();
  }

  // SEC-001: may I see this user's content? True for myself or anyone in my full
  // visible set (allUsers already respects the audience rules) — not just the
  // active group view, so a group filter doesn't wrongly hide visible friends.
  function canSeeUser(targetUid) {
    if (!cloud || !targetUid) return false;
    if (targetUid === uid) return true;
    return following.includes(targetUid);
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
    nomeMudou,
    setUser,
    setPhotoURL,
    isOnboarded,
    markOnboarded,
    getHomeTown,
    setHomeTown,
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
    visitDate,
    visitWith,
    addVisit,
    removeVisit,
    lastVisit,
    others,
    everyone,
    visitedBy,
    priorityBy,
    ratingsFor,
    avgRating,
    getGroups,
    getActiveGroupId,
    activeGroup,
    setActiveGroup,
    createGroup,
    joinGroup,
    getTasteProfile,
    setTasteProfile,
    getTasteNote,
    setTasteNote,
    getTasteGenDay,
    markTasteGen,
    getSharing,
    setSharing,
    leaveGroup,
    canSeeUser,
    getFollowing,
    isFollowing,
    follow,
    unfollow
  };
})();
