// Main app: data loading, sidebar list, filters, search, visited tracking,
// "surprise me", trip planner, the rich restaurant detail drawer, and (when
// signed in) per-person priority/ratings/notes/history, the group view and
// shared comments.

// Two independent axes. CUISINE is what people crave ("apetece-me japonês") and
// drives the pin colour; STYLE is the format/occasion and can stack.
const CUISINES = {
  portuguesa:    { label: "Portuguesa",   varName: "--c-portuguesa",    hex: "#b06a36" },
  mariscos:      { label: "Mariscos",     varName: "--c-mariscos",      hex: "#3f7d8c" },
  churrasco:     { label: "Churrasco",    varName: "--c-churrasco",     hex: "#a33f2c" },
  italiana:      { label: "Italiana",     varName: "--c-italiana",      hex: "#5d7b4a" },
  japonesa:      { label: "Japonesa",     varName: "--c-japonesa",      hex: "#8c4a6b" },
  asiatica:      { label: "Asiática",     varName: "--c-asiatica",      hex: "#c07a1f" },
  indiana:       { label: "Indiana",      varName: "--c-indiana",       hex: "#9c5518" },
  americana:     { label: "Americana",    varName: "--c-americana",     hex: "#6b5642" },
  mexicana:      { label: "Mexicana",     varName: "--c-mexicana",      hex: "#c14b34" },
  mediterranica: { label: "Mediterrânica",varName: "--c-mediterranica", hex: "#4e8b6b" },
  vegetariana:   { label: "Vegetariana",  varName: "--c-vegetariana",   hex: "#6b8f3a" },
  doces:         { label: "Doces",        varName: "--c-doces",         hex: "#c25b86" },
  cafe:          { label: "Café & Brunch",varName: "--c-cafe",          hex: "#8a6f4e" }
};
const STYLES = {
  tasca: { label: "Tasca" },
  petiscos: { label: "Petiscos" },
  "fine-dining": { label: "Fine dining" },
  casual: { label: "Casual" },
  takeaway: { label: "Take-away" }
};
// Old single-field values map onto the new axes (kept for docs written before the
// split, and for clients still running the previous build).
const LEGACY_CATEGORY = {
  tradicional: { cuisine: "portuguesa", styles: ["tasca"] },
  petiscos: { cuisine: "portuguesa", styles: ["petiscos"] },
  pastelaria: { cuisine: "doces", styles: [] },
  "fine-dining": { cuisine: "portuguesa", styles: ["fine-dining"] }
};
// A restaurant always answers both axes, whatever shape its document is in.
function cuisineOf(r) {
  if (r && r.cuisine && CUISINES[r.cuisine]) return r.cuisine;
  const legacy = r && LEGACY_CATEGORY[r.category];
  return legacy ? legacy.cuisine : "portuguesa";
}
function stylesOf(r) {
  if (r && Array.isArray(r.styles) && r.styles.length) return r.styles.filter((k) => STYLES[k]);
  const legacy = r && LEGACY_CATEGORY[r.category];
  return legacy ? legacy.styles : [];
}
// Legacy field kept in sync so an older client still shows something sane.
function legacyCategoryFor(cuisine, styles) {
  const st = styles || [];
  if (cuisine === "doces" || cuisine === "cafe") return "pastelaria";
  if (st.includes("fine-dining")) return "fine-dining";
  if (st.includes("petiscos")) return "petiscos";
  return "tradicional";
}

const App = (() => {
  const state = { restaurants: [], currentDetail: null, currentScreen: "mapa", mapMode: "mapa", diarioView: "restaurantes", criticasSort: "recent", amigosTab: "atividade", amigosFilter: "all" };

  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
  function icon(name, cls) {
    return `<svg class="icon${cls ? " " + cls : ""}"><use href="#i-${name}"/></svg>`;
  }
  // O token da sessão, para as escritas que as regras passaram a exigir com
  // conta (overrides). Nunca atira: sem sessão devolve null e a regra recusa
  // do lado de lá, que é o comportamento certo — a interface já não mostra
  // estes botões a quem não entrou.
  async function tokenSessao() {
    try { return window.FirebaseAuth ? await window.FirebaseAuth.getToken() : null; }
    catch (e) { return null; }
  }
  function catFor(r) {
    return CUISINES[cuisineOf(r)] || { label: "Outros", varName: "--text-muted", hex: "#888" };
  }
  function styleLabels(r) {
    return stylesOf(r).map((k) => (STYLES[k] || {}).label).filter(Boolean);
  }
  function hasGooglePhone(r) {
    const cached = Storage.getCachedPlace(r.id);
    return !!(cached && cached.phone);
  }
  function showsCommunityBadge(r) {
    return r.source === "community" && !r.verified && !hasGooglePhone(r);
  }
  function dot(cat) {
    return `<span class="dot" style="background:var(${cat.varName})"></span>`;
  }
  function googleMapsUrl(r) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.mapsQuery)}`;
  }
  function directionsUrl(r) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(r.mapsQuery)}`;
  }
  // Small round avatar: photo when available, else a coloured initial.
  function avatar(name, photoURL, cls) {
    const c = "avatar" + (cls ? " " + cls : "");
    if (photoURL) return `<img class="${c}" src="${esc(photoURL)}" alt="" loading="lazy">`;
    return `<span class="${c}">${esc((name || "?").trim().charAt(0).toUpperCase())}</span>`;
  }
  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
  }
  // Today as YYYY-MM-DD in LOCAL time (toISOString would roll over near midnight).
  function todayLocalISODate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  // A date-only input becomes an ISO stamp at LOCAL NOON, so the day can't drift
  // across timezones when it's read back.
  function isoFromDateInput(value) {
    if (!value) return new Date().toISOString();
    const [y, m, d] = value.split("-").map(Number);
    if (!y || !m || !d) return new Date().toISOString();
    return new Date(y, m - 1, d, 12, 0, 0).toISOString();
  }

  // Date + time of day (for the friends activity feed).
  function fmtDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const date = d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
    const time = d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", hour12: false });
    return `${date}, ${time}`;
  }

  // Suggest one of our categories from Google place types + price level.
  // Returns null when there isn't enough signal to suggest anything.
  // Google's types are coarse, so this is only a first guess — the AI `categorize`
  // action refines it, and the person can always correct both axes by hand.
  function suggestAxes(types, priceLevelNum) {
    const t = types || [];
    const has = (x) => t.includes(x);
    const styles = [];
    let cuisine = null;
    if (has("bakery")) cuisine = "doces";
    else if (has("cafe") && !has("restaurant")) cuisine = "cafe";
    if (has("meal_takeaway") || has("meal_delivery")) styles.push("takeaway");
    if (has("bar")) styles.push("petiscos");
    if (typeof priceLevelNum === "number" && priceLevelNum >= 4) styles.push("fine-dining");
    if (!cuisine && (has("restaurant") || has("food"))) cuisine = "portuguesa";
    if (!cuisine && !styles.length) return null;
    return { cuisine: cuisine || "portuguesa", styles };
  }
  function suggestCategory(types, priceLevelNum) {
    const axes = suggestAxes(types, priceLevelNum);
    return axes ? legacyCategoryFor(axes.cuisine, axes.styles) : null;
  }

  // ---------- Filters ----------
  function buildStyleFilters() {
    const wrap = document.getElementById("style-filters");
    if (!wrap) return;
    wrap.innerHTML = "";
    Object.entries(STYLES).forEach(([key, st]) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.style = key;
      chip.setAttribute("aria-pressed", "false"); // styles narrow down; off by default
      chip.textContent = st.label;
      chip.addEventListener("click", () => {
        chip.setAttribute("aria-pressed", chip.getAttribute("aria-pressed") === "true" ? "false" : "true");
        render();
      });
      wrap.appendChild(chip);
    });
  }
  function selectedStyles() {
    return [...document.querySelectorAll('#style-filters .chip[aria-pressed="true"]')].map((c) => c.dataset.style);
  }
  // Treze cozinhas de uma vez enchem o sheet antes de se chegar ao resto. Seis
  // à vista, as outras atrás de um chip tracejado — que desaparece assim que
  // alguma das escondidas estiver escolhida, para nunca haver filtro invisível.
  const CUISINES_VISIBLE = 6;
  function buildCategoryFilters() {
    const wrap = document.getElementById("category-filters");
    wrap.innerHTML = "";
    const keys = Object.keys(CUISINES);
    keys.forEach((key, i) => {
      const cat = CUISINES[key];
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.type = "button";
      chip.dataset.category = key;
      chip.setAttribute("aria-pressed", "false");
      if (i >= CUISINES_VISIBLE) chip.classList.add("chip-overflow");
      chip.innerHTML = `${dot(cat)} ${cat.label}`;
      chip.addEventListener("click", () => {
        chip.setAttribute("aria-pressed", chip.getAttribute("aria-pressed") === "true" ? "false" : "true");
        render();
      });
      wrap.appendChild(chip);
    });
    const hidden = keys.length - CUISINES_VISIBLE;
    if (hidden > 0) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "chip chip-more";
      more.textContent = `+ ${hidden} cozinhas`;
      more.addEventListener("click", () => {
        wrap.classList.add("show-all");
        more.remove();
      });
      wrap.appendChild(more);
    }
  }

  function buildRegionFilters() {
    const wrap = document.getElementById("region-filters");
    const existing = new Set([...wrap.querySelectorAll("[data-region]")].map((c) => c.dataset.region));
    [...new Set(state.restaurants.map((r) => r.region))].sort().forEach((region) => {
      if (existing.has(region)) return;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.region = region;
      chip.setAttribute("aria-pressed", "false");
      chip.textContent = region;
      chip.addEventListener("click", () => {
        chip.setAttribute("aria-pressed", chip.getAttribute("aria-pressed") === "true" ? "false" : "true");
        render();
      });
      wrap.appendChild(chip);
    });
  }

  function selectedCategories() {
    return [...document.querySelectorAll('#category-filters .chip[aria-pressed="true"]')].map((c) => c.dataset.category);
  }
  function selectedRegions() {
    return [...document.querySelectorAll('#region-filters .chip[aria-pressed="true"]')].map((c) => c.dataset.region);
  }
  function selectedPrices() {
    return [...document.querySelectorAll("#price-filters input:checked")].map((i) => parseInt(i.dataset.price, 10));
  }

  function getFiltered() {
    const cats = selectedCategories();
    const styles = selectedStyles();
    const regions = selectedRegions();
    const prices = selectedPrices();
    const q = document.getElementById("search-input").value.trim().toLowerCase();
    const hideVisited = document.getElementById("hide-visited-checkbox").checked;
    const onlyPriority = document.getElementById("only-priority-checkbox").checked;
    return state.restaurants.filter((r) => {
      if (cats.length && !cats.includes(cuisineOf(r))) return false;
      if (styles.length) {
        const rs = stylesOf(r);
        if (!styles.every((k) => rs.includes(k))) return false; // all chosen styles must hold
      }
      if (onlyPriority && !UserData.isPriority(r.id)) return false;
      if (regions.length && !regions.includes(r.region)) return false;
      // Price comes from Google (cached). Unknown price always passes; filter
      // only kicks in when not every bucket is selected.
      if (prices.length && prices.length < 4) {
        const cached = Storage.getCachedPlace(r.id);
        const lvl = cached && typeof cached.priceLevelNum === "number" ? cached.priceLevelNum : null;
        if (lvl !== null && !prices.includes(Math.max(1, Math.min(4, lvl)))) return false;
      }
      if (hideVisited && UserData.isVisited(r.id)) return false;
      if (q) {
        const hay = [r.name, r.town, r.notes, ...(r.tags || [])].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  // O mapa abre enquadrado nos sítios da pessoa, não num ponto fixo no
  // Alentejo. Uma vez por sessão — daí a bandeira.
  let enquadrouUmaVez = false;

  // ---------- Filtros em sheet (Fase 3) ----------
  // Quantos filtros estão a estreitar a lista. Vazio = sem filtro, para todos
  // os eixos — é o que permite arrancar com tudo desligado.
  function activeFilterCount() {
    const prices = selectedPrices();
    return selectedCategories().length
      + selectedStyles().length
      + selectedRegions().length
      + (prices.length && prices.length < 4 ? 1 : 0)
      + (document.getElementById("hide-visited-checkbox").checked ? 1 : 0)
      + (document.getElementById("only-priority-checkbox").checked ? 1 : 0);
  }
  function paintFilterCount(shown) {
    const badge = document.getElementById("filters-count");
    const n = activeFilterCount();
    if (badge) {
      badge.textContent = String(n);
      badge.classList.toggle("hidden", n === 0);
    }
    const cta = document.getElementById("filters-apply");
    if (cta) {
      cta.textContent = shown === 1 ? "Ver 1 restaurante" : `Ver ${shown} restaurantes`;
    }
  }
  function openFilters() {
    const el = document.getElementById("filters-sheet");
    if (!el) return;
    el.classList.remove("hidden");
    el.setAttribute("aria-hidden", "false");
    document.getElementById("filters-btn").setAttribute("aria-expanded", "true");
    render();
  }
  function closeFilters() {
    const el = document.getElementById("filters-sheet");
    if (!el) return;
    el.classList.add("hidden");
    el.setAttribute("aria-hidden", "true");
    document.getElementById("filters-btn").setAttribute("aria-expanded", "false");
  }
  function clearFilters() {
    document.querySelectorAll('#category-filters .chip, #style-filters .chip, #region-filters .chip')
      .forEach((c) => c.setAttribute("aria-pressed", "false"));
    document.querySelectorAll('#price-filters input[type="checkbox"]').forEach((i) => { i.checked = false; });
    document.getElementById("hide-visited-checkbox").checked = false;
    document.getElementById("only-priority-checkbox").checked = false;
    render();
  }

  // ---------- Render ----------
  function render() {
    const list = getFiltered();
    renderList(list);
    MapModule.renderMarkers(list, onPinSelect);
    if (!enquadrouUmaVez && list.length && MapModule.isAvailable()) {
      enquadrouUmaVez = MapModule.fitToMarkers(list);
    }
    document.getElementById("list-count").textContent =
      `${list.length} restaurante${list.length === 1 ? "" : "s"}`;
    paintFilterCount(list.length);
  }

  function renderList(restaurants) {
    const container = document.getElementById("restaurant-list");
    container.innerHTML = "";
    if (!restaurants.length) {
      // Sem resultados não é erro — mas nunca pode ser um beco. Diz o que está
      // a estreitar a lista (filtros, pesquisa, ou ambos) e dá sempre saída.
      const n = activeFilterCount();
      const q = document.getElementById("search-input").value.trim();
      const partes = [];
      if (n) partes.push(`${n} filtro${n === 1 ? "" : "s"} ativo${n === 1 ? "" : "s"}`);
      if (q) partes.push(`a pesquisa "${q}"`);
      const acoes = [];
      if (q) acoes.push({ label: "Limpar pesquisa", action: "limpar-pesquisa" });
      if (n) acoes.push({ label: "Limpar filtros", action: "limpar-filtros", kind: q ? "ghost" : "primary" });
      container.innerHTML = stateHtml({
        title: q && !n ? "Nada com essa pesquisa" : "Nada com estes filtros",
        text: partes.length ? `A estreitar por ${partes.join(" e ")}.` : "",
        actions: acoes
      });
      return;
    }
    const grouped = {};
    restaurants.forEach((r) => (grouped[r.region] = grouped[r.region] || []).push(r));
    Object.keys(grouped).sort().forEach((region) => {
      const h = document.createElement("div");
      h.className = "region-heading";
      h.textContent = `${region} · ${grouped[region].length}`;
      container.appendChild(h);
      grouped[region].forEach((r) => container.appendChild(buildCard(r)));
    });
  }

  // Drop a real photo into a `.ph` placeholder — only once it actually loads, so
  // a broken URL never shows a broken-image icon. Google photo URLs from the
  // Places SDK are cached for a week but can EXPIRE, so on error we refetch fresh
  // (bypassing the cache) once and retry; otherwise we keep the clean placeholder.
  function setThumbPhoto(phEl, url, r) {
    if (!phEl || !url) return;
    const img = new Image();
    img.alt = "";
    img.decoding = "async";
    img.style.cssText = "width:100%;height:100%;object-fit:cover";
    img.onload = () => {
      phEl.removeAttribute("data-label");
      phEl.style.background = "none";
      phEl.innerHTML = "";
      phEl.appendChild(img);
    };
    img.onerror = () => {
      if (r && !phEl.dataset.photoRetried && PlacesModule.isAvailable()) {
        phEl.dataset.photoRetried = "1";
        PlacesModule.fetchDetails(r, { force: true }).then((data) => {
          const fresh = data && data.photos && data.photos[0];
          if (fresh && fresh !== url) setThumbPhoto(phEl, fresh, r);
        }).catch(() => {});
      }
      // else keep the clean .ph placeholder
    };
    img.src = url;
  }
  // Fill a `.ph` thumbnail: a community "cover" photo (override) wins; otherwise
  // fall back to the cached Google photo.
  function fillThumbPhoto(phEl, r) {
    if (!phEl) return;
    if (r && r.photoURL) { setThumbPhoto(phEl, r.photoURL, r); return; }
    if (!PlacesModule.isAvailable()) return;
    PlacesModule.fetchDetails(r).then((data) => {
      if (data && data.photos && data.photos[0]) setThumbPhoto(phEl, data.photos[0], r);
    }).catch(() => {});
  }

  // Self-healing pins: geocoding a place with the wrong country (or an ambiguous
  // town) can drop it far from reality. Once Google resolves the actual place we
  // compare its coordinates with ours and, when they disagree badly, fix the pin
  // for everyone. Small differences are ignored — a pin is not a doorstep.
  const PIN_FIX_KM = 3;
  function maybeFixPin(r, data) {
    if (!r || !data || typeof data.lat !== "number" || typeof data.lng !== "number") return;
    if (typeof r.lat === "number" && typeof r.lng === "number") {
      if (distKm({ lat: r.lat, lng: r.lng }, { lat: data.lat, lng: data.lng }) < PIN_FIX_KM) return;
    }
    r.lat = data.lat;
    r.lng = data.lng;
    if (DB.isAvailable()) tokenSessao().then((t) => DB.setGeoOverride(r.id, data.lat, data.lng, t)).catch(() => {});
    render(); // re-runs renderMarkers with the corrected coordinates
    if (state.currentDetail === r) MapModule.focusRestaurant(r);
  }

  // Apply a shared override to a restaurant. Cloud overrides are objects
  // ({category, photoURL}); the local-storage fallback is a bare category string.
  function applyOverride(r, ov) {
    if (!ov) return;
    if (typeof ov === "string") { r.category = ov; return; }
    if (ov.category) r.category = ov.category;
    if (ov.cuisine) r.cuisine = ov.cuisine;
    if (Array.isArray(ov.styles) && ov.styles.length) r.styles = ov.styles;
    if (ov.photoURL) r.photoURL = ov.photoURL;
    if (typeof ov.lat === "number" && typeof ov.lng === "number") { r.lat = ov.lat; r.lng = ov.lng; }
  }

  function buildCard(r) {
    const visited = UserData.isVisited(r.id);
    const cat = catFor(r);
    const card = document.createElement("div");
    card.className = "card rcard" + (visited ? " visited" : "");
    card.dataset.id = r.id;
    card.dataset.cat = cuisineOf(r);

    // group/personal badges
    const badges = [];
    if (showsCommunityBadge(r)) badges.push('<span class="badge community" data-community-badge>comunidade</span>');
    if (UserData.isPriority(r.id)) badges.push(`<span class="badge priority" title="Prioritário">${icon("flame")} Prioritário</span>`);
    if (UserData.isCloud()) {
      const n = UserData.visitedBy(r.id).length;
      if (n) badges.push(`<span class="badge visited-by" title="Visitado por ${n}">${icon("users")} ${n}</span>`);
    }

    card.innerHTML = `
      <div class="rcard-thumb"><div class="ph" data-label="foto · Google"></div></div>
      <button class="mark-visit${visited ? " on" : ""}" data-visit aria-label="Marcar como visitado" aria-pressed="${visited}">
        ${icon("check")}
      </button>
      <div class="rcard-body">
        <span class="rcard-cat" style="color:var(${cat.varName}-ink)">${esc(cat.label)}${
          styleLabels(r).length ? ` · ${esc(styleLabels(r).join(" · "))}` : ""}</span>
        <span class="rcard-name">${esc(r.name)}</span>
        <span class="rcard-loc">${icon("pin")} ${esc(r.town)} · ${esc(r.region)}</span>
        ${r.notes ? `<div class="rcard-notes">${esc(r.notes)}</div>` : ""}
        <div class="rcard-meta card-meta" data-meta><span class="sk-line" style="width:96px"></span></div>
        ${badges.length ? `<div class="rcard-badges">${badges.join(" ")}</div>` : ""}
      </div>`;

    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-visit]")) return;
      onSelect(r);
    });
    card.querySelector("[data-visit]").addEventListener("click", (e) => {
      e.stopPropagation();
      haptico("toque");
      setVisited(r.id, !UserData.isVisited(r.id));
    });
    const ph = card.querySelector(".rcard-thumb .ph");
    // The chosen cover wins on the list card too — and shows even when Google
    // can't resolve the place at all (e.g. a mangled mapsQuery).
    if (ph && r.photoURL) setThumbPhoto(ph, r.photoURL, r);
    if (PlacesModule.isAvailable()) {
      PlacesModule.enrichCard(r, card.querySelector("[data-meta]")).then((data) => {
        if (!data) return;
        if (data.phone) card.querySelector("[data-community-badge]")?.remove();
        if (ph && !r.photoURL && data.photos && data.photos[0]) setThumbPhoto(ph, data.photos[0], r);
      });
    }
    return card;
  }

  function highlightCard(id) {
    document.querySelectorAll(".card").forEach((c) => c.classList.toggle("highlighted", c.dataset.id === id));
    const c = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
    if (c) c.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------- Visited ----------
  // ---------- Haptics ----------
  // Só no nativo, e só em três sítios: marcar visitado, registar visita e
  // confirmar convite. Nunca em navegação — mudar de separador não é um
  // acontecimento, e vibrar a cada toque deixa de querer dizer nada.
  //
  // Em PWA degrada para silêncio: não há plugin, e não se inventa um
  // substituto com `navigator.vibrate`, que no telemóvel dá um zumbido
  // grosseiro nada parecido com o toque do iOS.
  function haptico(tipo) {
    const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if (!H) return;
    try {
      if (tipo === "sucesso") H.notification({ type: "SUCCESS" });
      // "erro" caía no impacto leve, que é o mesmo de um toque qualquer. O iOS
      // tem um padrão próprio para falha e é o que a pessoa reconhece sem olhar.
      else if (tipo === "erro") H.notification({ type: "ERROR" });
      else H.impact({ style: "LIGHT" });
    } catch (e) { /* um toque que não se sente não é motivo para nada falhar */ }
  }

  function setVisited(id, visited) {
    UserData.setVisited(id, visited);
    const r = state.restaurants.find((x) => x.id === id);
    if (document.getElementById("hide-visited-checkbox").checked) { render(); return; }
    // Keep the wishlist badge — the pin encodes both marks now.
    if (r) MapModule.setMarkerState(id, cuisineOf(r), { visited, priority: UserData.isPriority(id) });
    const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
    if (card) {
      card.classList.toggle("visited", visited);
      const btn = card.querySelector("[data-visit]");
      btn.classList.toggle("on", visited);
      btn.setAttribute("aria-pressed", String(visited));
    }
    const detailBtn = document.querySelector(`#detail-body [data-visit-toggle="${CSS.escape(id)}"]`);
    if (detailBtn) syncDetailVisitBtn(detailBtn, visited);
  }

  // ---------- Select + detail drawer ----------
  function onSelect(r) {
    // Remember the overview before the first focus, so closing returns to it.
    if (!state.currentDetail) MapModule.saveCamera();
    MapModule.focusRestaurant(r);
    MapModule.highlightMarker(r.id);
    highlightCard(r.id);
    openDetail(r);
  }

  // Tocar num pin mostra primeiro um cartão ancorado em baixo, não a ficha
  // inteira: no mapa quer-se saber o que é aquilo antes de decidir abrir.
  function onPinSelect(r) {
    MapModule.highlightMarker(r.id);
    showMapPeek(r);
  }

  function hideMapPeek() {
    const el = document.getElementById("map-peek");
    if (!el) return;
    el.classList.add("hidden");
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = "";
  }

  function showMapPeek(r) {
    const el = document.getElementById("map-peek");
    if (!el) return;
    const cat = CUISINES[cuisineOf(r)] || { label: "" };
    el.innerHTML = `
      <div class="peek-thumb"><div class="ph" data-label="foto"></div></div>
      <div class="peek-body">
        <span class="rcard-cat" style="color:var(--c-${esc(cuisineOf(r))}-ink)">${esc(cat.label)}</span>
        <span class="peek-name">${esc(r.name)}</span>
        <span class="peek-meta">${esc([r.town, r.region].filter(Boolean).join(", "))}</span>
      </div>
      <button type="button" class="btn btn-primary peek-open">Abrir</button>
      <button type="button" class="icon-btn peek-close" aria-label="Fechar">${icon("x")}</button>`;
    el.classList.remove("hidden");
    el.setAttribute("aria-hidden", "false");
    const ph = el.querySelector(".ph");
    if (ph && r.photoURL) setThumbPhoto(ph, r.photoURL, r);
    else if (ph) fillThumbPhoto(ph, r);
    el.querySelector(".peek-open").addEventListener("click", () => { hideMapPeek(); onSelect(r); });
    el.querySelector(".peek-close").addEventListener("click", hideMapPeek);
  }

  function syncDetailVisitBtn(btn, visited) {
    btn.classList.toggle("btn-primary", visited);
    btn.classList.toggle("btn-ghost", !visited);
    btn.innerHTML = visited
      ? `${icon("check-circle")} Visitado`
      : `${icon("check")} Marcar como visitado`;
  }

  function syncPriorityChip(btn, on) {
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.title = on ? "Prioritário" : "Marcar prioritário";
    btn.innerHTML = `${icon("flame")} ${on ? "Prioritário" : "Prioridade"}`;
  }

  function openDetail(r) {
    state.currentDetail = r;
    const cat = catFor(r);
    const visited = UserData.isVisited(r.id);
    const panel = document.getElementById("detail-panel");
    const hero = document.getElementById("detail-hero");
    const body = document.getElementById("detail-body");

    hero.innerHTML = `<svg class="icon placeholder-icon" style="color:var(${cat.varName})"><use href="#i-utensils"/></svg>`;
    if (r.photoURL) setHeroPhoto(r, r.photoURL); // the chosen cover, before Google answers
    const heroCoverBtn = document.getElementById("hero-cover-btn");
    if (heroCoverBtn) heroCoverBtn.classList.toggle("hidden", !(UserData.isCloud() && DB.isAvailable()));
    body.innerHTML = `
      <div class="detail-head">
        <h2>${esc(r.name)}</h2>
        <div class="detail-sub">
          <span class="cat-chip" style="color:var(${cat.varName}-ink)">${dot(cat)} ${cat.label}</span>
          <span>· ${esc(r.town)}, ${esc(r.region)}</span>
        </div>
        ${r.addedByName ? `<div class="added-by">${icon("sparkles")} Sugerido por <strong>${esc(r.addedByName)}</strong></div>` : ""}
      </div>
      <div class="detail-stats" data-stats>
        <div class="stat"><span class="label">Avaliação</span><span class="value"><span class="skeleton sk-line" style="width:60px"></span></span></div>
      </div>
      ${r.notes ? `<div class="detail-note">${icon("sparkles")} <strong>Especialidade:</strong> ${esc(r.notes)}</div>` : ""}
      <div class="detail-actions" data-actions>
        <a class="btn btn-ghost" href="${directionsUrl(r)}" target="_blank" rel="noopener">${icon("navigation")} Direções</a>
        <a class="btn btn-ghost" href="${googleMapsUrl(r)}" target="_blank" rel="noopener">${icon("external")} Google</a>
        <button class="btn btn-ghost btn-block" data-share>${icon("share")} Partilhar</button>
        <div class="visit-row">
          <button class="btn" data-visit-toggle="${esc(r.id)}"></button>
          <button class="btn chip-toggle" data-priority-chip hidden></button>
        </div>
        <button class="btn btn-primary btn-block" data-open-visit-sheet>${icon("star")} Registar visita</button>
      </div>
      <div class="detail-tabs" role="tablist">
        <button class="detail-tab active" data-tab="sitio" role="tab" aria-selected="true">O sítio</button>
        <button class="detail-tab" data-tab="experiencia" role="tab" aria-selected="false">A minha experiência</button>
      </div>
      <div class="detail-panes">
        <div class="detail-pane" data-pane="sitio" role="tabpanel">
          <div data-gallery></div>
          <div data-hours></div>
          <div data-reviews></div>
          <div class="amigos" data-amigos></div>
          <div class="photos" data-friends-photos></div>
          <div class="comments" data-comments></div>
          <div class="cat-edit">
            <span class="detail-section-title">Cozinha${DB.isAvailable() ? "" : " (só neste navegador)"}</span>
            <div class="chip-row" data-cat-edit></div>
            <div class="cat-suggest" data-cat-suggest hidden></div>
            <span class="detail-section-title">Estilo</span>
            <div class="chip-row" data-style-edit></div>
          </div>
          ${canDeleteRestaurant(r) ? `<button class="btn btn-ghost btn-block btn-danger" data-delete-restaurant>${icon("x")} Remover restaurante</button>` : ""}
        </div>
        <div class="detail-pane" data-pane="experiencia" role="tabpanel" hidden>
          <div class="my-marks" data-my-marks></div>
          <div class="my-marks-tail" data-my-marks-tail></div>
          <div class="photos" data-my-photos></div>
        </div>
      </div>`;

    body.querySelectorAll(".detail-tab").forEach((tab) => {
      tab.addEventListener("click", () => switchTab(body, tab.dataset.tab));
    });

    const openVisit = body.querySelector("[data-open-visit-sheet]");
    if (openVisit) openVisit.addEventListener("click", () => openVisitSheet(r));

    const visitBtn = body.querySelector("[data-visit-toggle]");
    syncDetailVisitBtn(visitBtn, visited);
    visitBtn.addEventListener("click", () => {
      const now = !UserData.isVisited(r.id);
      setVisited(r.id, now);
      syncDetailVisitBtn(visitBtn, now);
      renderMyMarks(r);
      renderAmigos(r);
    });

    // Priority is now a chip next to the visit toggle (only when signed in).
    const priBtn = body.querySelector("[data-priority-chip]");
    if (UserData.isCloud()) {
      priBtn.hidden = false;
      syncPriorityChip(priBtn, UserData.isPriority(r.id));
      priBtn.addEventListener("click", () => {
        const now = !UserData.isPriority(r.id);
        UserData.setPriority(r.id, now);
        syncPriorityChip(priBtn, now);
        render(); // refresh the "Prioritário" badge on the cards
      });
    }

    body.querySelector("[data-share]").addEventListener("click", () => shareRestaurant(r));

    const delBtn = body.querySelector("[data-delete-restaurant]");
    if (delBtn) delBtn.addEventListener("click", () => removeRestaurant(r));

    const catEdit = body.querySelector("[data-cat-edit]");
    const styleEdit = body.querySelector("[data-style-edit]");
    if (styleEdit) {
      styleEdit.innerHTML = "";
      Object.entries(STYLES).forEach(([key, st]) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.dataset.styleKey = key;
        chip.textContent = st.label;
        chip.setAttribute("aria-pressed", String(stylesOf(r).includes(key)));
        chip.addEventListener("click", () => {
          const on = chip.getAttribute("aria-pressed") !== "true";
          chip.setAttribute("aria-pressed", String(on));
          const next = new Set(stylesOf(r));
          if (on) next.add(key); else next.delete(key);
          setStyles(r, [...next]);
        });
        styleEdit.appendChild(chip);
      });
    }
    Object.entries(CUISINES).forEach(([key, c]) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.cat = key;
      chip.setAttribute("aria-pressed", String(key === cuisineOf(r)));
      chip.innerHTML = `${dot(c)} ${c.label}`;
      chip.addEventListener("click", () => changeCategory(r, key));
      catEdit.appendChild(chip);
    });

    renderMyMarks(r);
    renderAmigos(r);
    renderPhotos(r);
    renderComments(r);

    panel.setAttribute("aria-hidden", "false");
    fillDetailFromPlaces(r);
  }

  // Re-render the open drawer (e.g. after sign-in changes what's available).
  function refreshOpenDetail() {
    const r = state.currentDetail;
    const panel = document.getElementById("detail-panel");
    if (r && panel.getAttribute("aria-hidden") === "false") openDetail(r);
  }

  // Toggle which detail tab/pane is visible.
  function switchTab(body, name) {
    body.querySelectorAll(".detail-tab").forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
    });
    body.querySelectorAll(".detail-pane").forEach((p) => {
      p.hidden = p.dataset.pane !== name;
    });
  }

  // ---------- Personal marks (priority / rating / note / visit history) ----------
  // "Fui com": pick friends who came along. Only people already on the app, since
  // each of them has to confirm before the visit lands in their own logbook.
  // Turn companion uids into names ("Leonor e Miguel"), skipping anyone we can't see.
  function companionNames(uids) {
    if (!uids || !uids.length) return "";
    const byUid = new Map(UserData.everyone().map((g) => [g.uid, g.displayName || "Amigo"]));
    const names = uids.map((u) => byUid.get(u)).filter(Boolean);
    if (!names.length) return "";
    if (names.length === 1) return names[0];
    return names.slice(0, -1).join(", ") + " e " + names[names.length - 1];
  }
  function visitListHtml(r) {
    const hist = UserData.getHistory(r.id).slice().reverse();
    if (!hist.length) return `<span class="muted history-summary">Sem visitas registadas</span>`;
    return hist
      .map((entry) => {
        const iso = UserData.visitDate(entry);
        const who = companionNames(UserData.visitWith(entry));
        return `<div class="visit-entry"><span>${icon("check-circle")} ${fmtDate(iso)}` +
          `${who ? `<span class="visit-with">com ${esc(who)}</span>` : ""}</span>` +
          `<button type="button" class="icon-btn visit-del" data-del-visit="${esc(iso)}" aria-label="Remover visita">${icon("x")}</button></div>`;
      })
      .join("");
  }

  // ---------- Estados: vazio, sem resultados, erro (Fase 4) ----------
  // Um só componente. Eram nove chamadas a quatro classes diferentes, todas
  // texto cinzento centrado sem ação nenhuma — um beco sem saída em cada ecrã.
  // A regra do handoff: forma, título, uma frase, UMA SAÍDA.
  //
  //   art     "livros" | "pessoas" | nada
  //   actions [{ label, action, kind }]  — action é o nome de um data-state-action
  // Sem ilustração, de propósito.
  //
  // Havia três blocos cinzentos por cima de cada estado vazio — placeholders que
  // nunca chegaram a ser desenho nenhum. Num ecrã que já está vazio, o que eles
  // faziam era ocupar o espaço onde devia estar a frase que explica o que fazer
  // a seguir, e empurrar o botão para baixo. O `art` sai da assinatura: quem o
  // passar deixa de ter efeito, em vez de ficar a pensar que passou.
  function stateHtml({ title, text, actions, tone }) {
    return `<div class="state${tone ? " state-" + tone : ""}">
      <h3 class="state-title">${esc(title)}</h3>
      ${text ? `<p class="state-text">${esc(text)}</p>` : ""}
      ${(actions || []).length ? `<div class="state-actions">${actions.map((a) => `
        <button type="button" class="btn ${a.kind === "ghost" ? "btn-ghost" : "btn-primary"}"
                data-state-action="${esc(a.action)}">${esc(a.label)}</button>`).join("")}</div>` : ""}
    </div>`;
  }

  // Um erro em três níveis. Em linha é para o que falhou em pequeno e continua
  // a haver conteúdo à volta; de secção é para quando não veio nada.
  function errorHtml(message, action) {
    return `<div class="state-inline">
      ${icon("info")}
      <span class="state-inline-text">${esc(message)}</span>
      ${action ? `<button type="button" class="linklike" data-state-action="${esc(action)}">Repetir</button>` : ""}
    </div>`;
  }

  // As saídas dos estados vazios são poucas e conhecidas — resolvem-se aqui em
  // vez de cada chamador ter de ligar os seus próprios eventos.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-state-action]");
    if (!btn) return;
    const act = btn.dataset.stateAction;
    if (act === "mapa") showScreen("mapa");
    else if (act === "amigos") showScreen("amigos");
    else if (act === "seguir") openPeopleModal();
    else if (act === "limpar-filtros") { clearFilters(); closeFilters(); }
    else if (act === "limpar-pesquisa") {
      const box = document.getElementById("search-input");
      box.value = "";
      render();
      box.focus();
    }
    else if (act === "filtros") openFilters();
  });

  // ---------- Sheet de registar visita (Fase 4) ----------
  // O fluxo central da app. Estava dentro do separador "As minhas experiências",
  // partido em dois blocos separados por uma grelha de fotos; passa a ter porta
  // própria na ficha e cinco passos seguidos. As fotos saem do fluxo de
  // propósito: registar é rápido, fotografar é depois.
  const visitDraft = { id: null, stars: 0, dishes: [], note: "", date: "", withUids: [] };

  function openVisitSheet(r) {
    if (!UserData.isCloud()) { showSigninModal(); return; }
    const sheet = document.getElementById("visit-sheet");
    if (!sheet) return;
    const cur = UserData.getRating(r.id) || { stars: 0, note: "", dishes: [] };
    visitDraft.id = r.id;
    visitDraft.stars = cur.stars || 0;
    visitDraft.dishes = (cur.dishes || []).slice();
    visitDraft.note = cur.note || "";
    visitDraft.date = todayLocalISODate();
    visitDraft.withUids = [];

    const cuisine = CUISINES[cuisineOf(r)];
    sheet.querySelector("[data-visit-cuisine]").textContent = cuisine ? cuisine.label : "";
    sheet.querySelector("[data-visit-name]").textContent = r.name;
    sheet.querySelector("[data-visit-thumb]").innerHTML =
      r.photoURL ? `<img src="${esc(r.photoURL)}" alt="" />` : `<div class="ph" data-label="foto"></div>`;

    sheet.classList.remove("hidden");
    sheet.setAttribute("aria-hidden", "false");
    paintVisitSheet(r);
    wireKeyboardLift(sheet);
  }

  function closeVisitSheet() {
    const sheet = document.getElementById("visit-sheet");
    if (!sheet) return;
    sheet.classList.add("hidden");
    sheet.setAttribute("aria-hidden", "true");
    sheet.style.removeProperty("--kb");
  }

  // Com contentInset "never", o teclado tapa o rodapé. O visualViewport dá a
  // altura real visível e funciona igual na PWA e no nativo — sem plugin.
  //
  // O que isto compensa, medido no simulador: sem o plugin de teclado a
  // WKWebView **não é redimensionada** quando o teclado abre. O WebKit arrasta a
  // *visual viewport* para cima para desocultar o cursor — e tudo o que é
  // `position: fixed` sobe com ela. Foi assim que o modal de adicionar apareceu
  // com o título debaixo da Dynamic Island: não foi mau layout, foi a página
  // inteira a ser empurrada por baixo do cromo do sistema.
  //
  // Estava ligado a um sítio só, o sheet de registar visita. Passa a estar em
  // todos os que ganham foco ao abrir.
  function wireKeyboardLift(sheet) {
    if (!window.visualViewport || sheet.dataset.kbWired) return;
    sheet.dataset.kbWired = "1";
    const sync = () => {
      const gap = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
      sheet.style.setProperty("--kb", gap + "px");
    };
    window.visualViewport.addEventListener("resize", sync);
    window.visualViewport.addEventListener("scroll", sync);
  }

  // Ligar a compensação de teclado a todos os overlays que abrem com um campo
  // focado. Chamado uma vez no arranque; o `dataset.kbWired` impede duplicados.
  //
  // O `--kb` é lido pelo CSS do `.modal-card` e do `.sheet-card`: com o teclado
  // aberto, o cartão encolhe a altura máxima em vez de ficar metade escondido.
  function ligarTecladoNosOverlays() {
    ["add-restaurant-modal", "ai-modal", "group-modal", "signin-modal", "map-search"]
      .forEach((id) => {
        const el = document.getElementById(id);
        if (el) wireKeyboardLift(el);
      });
    const entrada = document.getElementById("entrada");
    if (entrada) wireKeyboardLift(entrada);
  }

  function paintVisitSheet(r) {
    const sheet = document.getElementById("visit-sheet");
    const body = sheet.querySelector("[data-visit-body]");
    const friends = UserData.isCloud() ? UserData.others() : [];
    const step = (n, label, inner, extra) => `
      <section class="visit-step">
        <span class="visit-step-label"><span class="visit-step-n">${n}</span>${label}</span>
        ${inner}
        ${extra || ""}
      </section>`;

    body.innerHTML = [
      step(1, "A tua nota", `
        <div class="visit-stars" data-visit-stars>
          ${[1, 2, 3, 4, 5].map((n) => `
            <button type="button" class="visit-star${n <= visitDraft.stars ? " on" : ""}" data-star="${n}"
                    aria-label="${n} estrela${n === 1 ? "" : "s"}">${icon("star")}</button>`).join("")}
        </div>`,
        // A explicação vive JUNTO do passo que a origina, não por baixo do botão.
        `<p class="visit-hint${visitDraft.stars ? " hidden" : ""}" data-visit-gate>Só a nota é obrigatória.</p>`),

      step(2, "Pratos", `
        <div class="visit-dishes" data-visit-dishes></div>
        <input class="visit-dish-input hidden" data-visit-dish-input placeholder="Nome do prato" />`),

      step(3, "Nota pessoal", `
        <textarea class="visit-note" data-visit-note rows="3"
                  placeholder="O que queres lembrar da próxima vez?">${esc(visitDraft.note)}</textarea>
        ${AIModule.available() ? `<button type="button" class="linklike ai-draft" data-ai-draft>${icon("sparkles")} Ajudar a escrever</button>` : ""}`),

      step(4, "Quando", `
        <label class="visit-when-row">
          ${icon("clock")}
          <span class="visit-when-label" data-visit-when-label></span>
          <input type="date" class="visit-when-input" data-visit-date
                 value="${visitDraft.date}" max="${todayLocalISODate()}" />
          ${icon("chevron-right")}
        </label>`),

      friends.length ? step(5, "Com quem", `
        <div class="companion-chips" data-companions>
          ${friends.map((f) => `
            <button type="button" class="companion-chip" data-companion="${esc(f.uid)}" aria-pressed="false">
              ${avatar(f.displayName, f.photoURL, "avatar-xs")}<span>${esc(f.displayName || "Amigo")}</span>
            </button>`).join("")}
        </div>`,
        `<p class="visit-hint" data-companion-note></p>`) : ""
    ].join("");

    paintVisitDishes();
    paintVisitWhen();
    paintCompanionNote();

    body.querySelectorAll("[data-star]").forEach((b) => b.addEventListener("click", () => {
      const n = parseInt(b.dataset.star, 10);
      visitDraft.stars = visitDraft.stars === n ? 0 : n; // tocar na mesma estrela limpa
      body.querySelectorAll("[data-star]").forEach((x) =>
        x.classList.toggle("on", parseInt(x.dataset.star, 10) <= visitDraft.stars));
      body.querySelector("[data-visit-gate]").classList.toggle("hidden", !!visitDraft.stars);
      syncVisitCta();
    }));

    const noteEl = body.querySelector("[data-visit-note]");
    noteEl.addEventListener("input", () => { visitDraft.note = noteEl.value; });
    const draftBtn = body.querySelector("[data-ai-draft]");
    if (draftBtn) draftBtn.addEventListener("click", async () => {
      await runDraftReview(r, noteEl, draftBtn);
      visitDraft.note = noteEl.value;
    });

    const dateEl = body.querySelector("[data-visit-date]");
    dateEl.addEventListener("change", () => {
      visitDraft.date = isoFromDateInput(dateEl.value) || todayLocalISODate();
      paintVisitWhen();
    });

    body.querySelectorAll("[data-companion]").forEach((b) => b.addEventListener("click", () => {
      const on = b.getAttribute("aria-pressed") === "true";
      b.setAttribute("aria-pressed", String(!on));
      visitDraft.withUids = [...body.querySelectorAll('[data-companion][aria-pressed="true"]')]
        .map((x) => x.dataset.companion);
      paintCompanionNote();
    }));

    syncVisitCta();
  }

  function paintVisitWhen() {
    const el = document.querySelector("#visit-sheet [data-visit-when-label]");
    if (!el) return;
    el.textContent = visitDraft.date === todayLocalISODate() ? "Hoje" : fmtDate(visitDraft.date);
  }

  // Explica o modelo pelo nome de quem foi escolhido, não em abstrato.
  function paintCompanionNote() {
    const el = document.querySelector("#visit-sheet [data-companion-note]");
    if (!el) return;
    if (!visitDraft.withUids.length) { el.textContent = ""; return; }
    const names = companionNames(visitDraft.withUids);
    // companionNames devolve "" para quem não se consegue resolver; sem isto a
    // frase começava por um espaço e ficava sem sujeito.
    if (!names) {
      el.textContent = "Quem marcares recebe um pedido para confirmar — só depois entra no diário dele.";
      return;
    }
    const plural = visitDraft.withUids.length > 1;
    el.textContent = `${names} ${plural ? "recebem um pedido" : "recebe um pedido"} para confirmar — ` +
      `só depois entra no diário ${plural ? "deles" : "dele"}.`;
  }

  function paintVisitDishes() {
    const wrap = document.querySelector("#visit-sheet [data-visit-dishes]");
    const input = document.querySelector("#visit-sheet [data-visit-dish-input]");
    if (!wrap || !input) return;
    wrap.innerHTML = visitDraft.dishes.map((d, i) => `
      <span class="dish-chip removable"><span>${esc(d)}</span>
        <button type="button" class="dish-x" data-del-dish="${i}" aria-label="Remover">${icon("x")}</button>
      </span>`).join("") + `<button type="button" class="chip chip-more" data-add-dish>+ prato</button>`;

    wrap.querySelectorAll("[data-del-dish]").forEach((b) => b.addEventListener("click", () => {
      visitDraft.dishes.splice(parseInt(b.dataset.delDish, 10), 1);
      paintVisitDishes();
    }));
    wrap.querySelector("[data-add-dish]").addEventListener("click", () => {
      input.classList.remove("hidden");
      input.focus();
    });
    const commit = () => {
      const raw = input.value.replace(/,+$/, "").trim();
      input.value = "";
      input.classList.add("hidden");
      if (!raw) return;
      if (!visitDraft.dishes.some((d) => d.toLowerCase() === raw.toLowerCase())) visitDraft.dishes.push(raw);
      paintVisitDishes();
    };
    input.onkeydown = (e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); } };
    input.onblur = commit;
  }

  function syncVisitCta() {
    const cta = document.querySelector("#visit-sheet [data-visit-submit]");
    if (cta) cta.disabled = !visitDraft.stars;
  }

  function submitVisit() {
    const r = (state.restaurants || []).find((x) => x.id === visitDraft.id);
    if (!r || !visitDraft.stars) return;
    UserData.setRating(r.id, visitDraft.stars, visitDraft.note.trim(), visitDraft.dishes.slice());
    UserData.addVisit(r.id, visitDraft.date, visitDraft.withUids);
    setVisited(r.id, true);
    // Cada acompanhante recebe um convite; só ele pode escrever o próprio diário.
    if (visitDraft.withUids.length) sendVisitInvites(r, visitDraft.date, visitDraft.withUids);
    closeVisitSheet();
    renderMyMarks(r);
    renderAmigos(r);
    haptico("sucesso");
    showSuccess(r.name);
  }

  function renderMyMarks(r) {
    const el = document.querySelector("#detail-body [data-my-marks]");
    const tail = document.querySelector("#detail-body [data-my-marks-tail]");
    if (!el) return;

    if (!UserData.isCloud()) {
      if (DB.isAvailable()) {
        el.innerHTML =
          `<div class="signin-invite">${icon("log-in")} <span>Inicie sessão com a Google para registar a sua experiência.</span></div>`;
      } else {
        el.innerHTML = "";
      }
      if (tail) tail.innerHTML = "";
      return;
    }

    const rating = UserData.getRating(r.id) || { stars: 0, note: "", dishes: [] };

    // O formulário mudou-se para o sheet (openVisitSheet). Este separador passa
    // a mostrar o que ficou registado — e não um segundo sítio a escrever o
    // mesmo estado, que era como duas cópias divergiam.
    el.innerHTML = `
      <div class="my-summary">
        ${rating.stars
          ? `<div class="stars-display">${[1, 2, 3, 4, 5]
              .map((n) => `<svg class="icon${n <= rating.stars ? "" : " empty"}"><use href="#i-star"/></svg>`).join("")}</div>`
          : ""}
        ${rating.note ? `<p class="my-note">${esc(rating.note)}</p>` : ""}
        ${(rating.dishes || []).length
          ? `<div class="dish-chips">${rating.dishes.map((d) => `<span class="dish-chip">${esc(d)}</span>`).join("")}</div>`
          : ""}
        <button type="button" class="btn btn-primary btn-block" data-open-visit>
          ${icon("check-circle")} ${rating.stars ? "Registar outra visita" : "Registar visita"}
        </button>
      </div>`;

    if (tail) tail.innerHTML = `
      <div class="visit-history">
        <span class="detail-section-title">Visitas</span>
        <div class="visit-list" data-visit-list>${visitListHtml(r)}</div>
      </div>`;

    const openBtn = el.querySelector("[data-open-visit]");
    if (openBtn) openBtn.addEventListener("click", () => openVisitSheet(r));

    if (tail) tail.querySelectorAll("[data-del-visit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        UserData.removeVisit(r.id, btn.dataset.delVisit);
        renderMyMarks(r);
        renderAmigos(r);
      });
    });
  }

  // ---------- Group view ("Amigos") ----------
  function renderAmigos(r) {
    const el = document.querySelector("#detail-body [data-amigos]");
    if (!el) return;

    const title = `<div class="detail-section-title">${icon("users")} Amigos</div>`;

    if (!UserData.isCloud()) {
      el.innerHTML =
        title +
        `<div class="signin-invite">${icon("log-in")} <span>Inicie sessão com a Google para ver a atividade de amigos.</span></div>`;
      return;
    }

    const visitedBy = UserData.visitedBy(r.id);
    const priorityBy = UserData.priorityBy(r.id);
    const ratings = UserData.ratingsFor(r.id);
    const avg = UserData.avgRating(r.id);

    if (!visitedBy.length && !priorityBy.length && !ratings.length) {
      el.innerHTML = title + `<p class="muted">Ainda não há atividade de amigos por aqui.</p>`;
      return;
    }

    const blocks = [title];

    if (typeof avg === "number") {
      blocks.push(
        `<div class="amigos-avg">${icon("star")} <strong>${avg.toFixed(1)}</strong> <span class="muted">média do grupo (${ratings.filter((x) => x.stars > 0).length})</span></div>`
      );
    }
    if (visitedBy.length) {
      blocks.push(
        `<div class="amigos-row"><span class="amigos-label">Visitaram</span><span class="amigos-avatars">${visitedBy
          .map((g) => avatar(g.displayName, g.photoURL))
          .join("")}</span></div>`
      );
    }
    if (priorityBy.length) {
      blocks.push(
        `<div class="amigos-row"><span class="amigos-label">${icon("flame")} Querem ir</span><span class="amigos-avatars">${priorityBy
          .map((g) => avatar(g.displayName, g.photoURL))
          .join("")}</span></div>`
      );
    }
    // Aggregated list of dishes everyone has had here (deduped, case-insensitive).
    const dishMap = new Map();
    ratings.forEach((x) => (x.dishes || []).forEach((d) => {
      const k = String(d).trim().toLowerCase();
      if (k && !dishMap.has(k)) dishMap.set(k, String(d).trim());
    }));
    if (dishMap.size) {
      blocks.push(
        `<div class="amigos-dishes"><span class="amigos-label">${icon("utensils")} Pratos provados aqui</span>${dishChips([...dishMap.values()])}</div>`
      );
    }

    const withNotes = ratings.filter((x) => x.note || (x.dishes && x.dishes.length));
    if (withNotes.length) {
      blocks.push(
        `<div class="amigos-notes">${withNotes
          .map(
            (x) => `<div class="amigos-note">${avatar(x.name, x.photoURL)}<div><span class="who">${esc(x.name)}${
              x.stars ? ` · ${icon("star")} ${x.stars}` : ""
            }</span>${x.note ? `<p>${esc(x.note)}</p>` : ""}${dishChips(x.dishes)}</div></div>`
          )
          .join("")}</div>`
      );
    }
    el.innerHTML = blocks.join("");
  }

  // ---------- Shared comments ----------
  async function renderComments(r) {
    const el = document.querySelector("#detail-body [data-comments]");
    if (!el) return;
    if (!DB.isAvailable()) { el.innerHTML = ""; return; }

    const signedIn = UserData.isCloud();
    el.innerHTML = `
      <div class="detail-section-title">${icon("message")} Comentários</div>
      <div class="comments-list" data-comments-list>
        <div class="skeleton sk-line" style="width:50%"></div>
      </div>
      ${
        signedIn
          ? `<div class="comment-form">
               <textarea class="note-input" data-comment-text placeholder="Escreva um comentário…" rows="2"></textarea>
               <button class="btn btn-primary btn-sm" data-comment-send>Comentar</button>
             </div>`
          : DB.isAvailable()
          ? `<p class="hint">${icon("log-in")} Inicie sessão para comentar.</p>`
          : ""
      }`;

    const listEl = el.querySelector("[data-comments-list]");
    const todos = await DB.fetchComments(r.id);
    // guard against the user navigating to another restaurant meanwhile
    if (state.currentDetail !== r) return;
    // Quem está bloqueado desaparece daqui. Não se diz que foi escondido: quem
    // bloqueia quer deixar de ver a pessoa, não um aviso a lembrá-lo dela.
    const comments = todos.filter((c) => !UserData.isBlocked(c.uid));
    listEl.innerHTML = comments.length
      ? comments.map((c) => renderComment(c, r)).join("")
      : `<p class="muted">Ainda não há comentários.</p>`;
    ligarModeracao(listEl, r);

    if (signedIn) {
      const textEl = el.querySelector("[data-comment-text]");
      const sendBtn = el.querySelector("[data-comment-send]");
      const submit = async () => {
        const text = textEl.value.trim();
        if (!text) return;
        sendBtn.disabled = true;
        try {
          const me = UserData.me();
          const fb = window.FirebaseAuth;
          const token = fb ? await fb.getToken() : null;
          const saved = await DB.addComment(
            { restaurantId: r.id, uid: me.uid, author: me.displayName, photoURL: me.photoURL, text },
            token
          );
          if (listEl.querySelector(".muted")) listEl.innerHTML = "";
          listEl.insertAdjacentHTML("beforeend", renderComment(saved));
          textEl.value = "";
        } catch (e) {
          // surface a minimal error inline
          textEl.placeholder = "Não foi possível publicar. Tente novamente.";
        }
        sendBtn.disabled = false;
      };
      sendBtn.addEventListener("click", submit);
      // Enter publica; Shift+Enter insere uma nova linha.
      textEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          submit();
        }
      });
    }
  }

  function renderComment(c, r) {
    // O botão só aparece no que é dos outros: denunciar-se a si próprio não faz
    // sentido, e a diretriz 1.2 é sobre conteúdo alheio.
    const meu = UserData.isCloud() && c.uid && c.uid === UserData.me().uid;
    const acoes = !meu && UserData.isCloud()
      ? `<button type="button" class="icon-btn comment-flag" aria-label="Denunciar ou bloquear"
                 data-moderar="${esc(c.id || "")}" data-mod-uid="${esc(c.uid || "")}"
                 data-mod-quem="${esc(c.author || "")}">${icon("flag")}</button>`
      : "";
    return `<div class="comment">
      ${avatar(c.author, c.photoURL)}
      <div class="comment-body">
        <span class="comment-who">${meu || !c.uid
          ? `<span class="name">${esc(c.author)}</span>`
          : `<button type="button" class="name person-abrir" data-abrir-pessoa="${esc(c.uid)}" data-abrir-nome="${esc(c.author || "")}">${esc(c.author)}</button>`
        }<span class="when">${esc(fmtDate(c.createdAt))}</span></span>
        <p>${esc(c.text)}</p>
      </div>
      ${acoes}
    </div>`;
  }

  // ---------- O meu perfil público ----------
  //
  // Tudo aqui é escolhido, e nada é calculado. Podia-se derivar os "favoritos"
  // das avaliações de cinco estrelas e os "destaques" do perfil de gosto que a
  // IA gera — e seria pior: um perfil é o que uma pessoa quer dizer de si, não
  // o que os dados dizem por ela.
  let rascunhoPerfil = null;

  function abrirMeuPerfilPublico() {
    if (!UserData.isCloud()) { showSigninModal(); return; }
    const sheet = document.getElementById("meu-perfil-sheet");
    if (!sheet) return;
    rascunhoPerfil = UserData.getPerfilPublico();
    pintarMeuPerfil();
    sheet.classList.remove("hidden");
    sheet.setAttribute("aria-hidden", "false");
  }

  function fecharMeuPerfilPublico() {
    const sheet = document.getElementById("meu-perfil-sheet");
    if (!sheet) return;
    sheet.classList.add("hidden");
    sheet.setAttribute("aria-hidden", "true");
    rascunhoPerfil = null;
  }

  function pintarMeuPerfil() {
    const sheet = document.getElementById("meu-perfil-sheet");
    if (!sheet || !rascunhoPerfil) return;

    sheet.querySelectorAll("[data-vis]").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.vis === rascunhoPerfil.visibilidade)));

    const destaques = sheet.querySelector("[data-destaques]");
    destaques.innerHTML = rascunhoPerfil.destaques.length
      ? rascunhoPerfil.destaques.map((d, i) => `
          <button type="button" class="chip" data-destaque-tirar="${i}">
            ${esc(d)} ${icon("x")}
          </button>`).join("")
      : `<span class="muted">Ainda não escreveste nenhum.</span>`;

    // Os favoritos saem do que já está no diário: escolher de uma lista de
    // sítios onde nunca se foi não faz sentido nenhum.
    const visitados = state.restaurants.filter((r) => UserData.isVisited(r.id));
    const alvo = sheet.querySelector("[data-favoritos]");
    if (!visitados.length) {
      alvo.innerHTML = `<p class="muted">Regista uma visita primeiro — os favoritos saem do teu diário.</p>`;
    } else {
      alvo.innerHTML = visitados.slice(0, 40).map((r) => {
        const on = rascunhoPerfil.favoritos.includes(r.id);
        return `<button type="button" class="person-row" data-fav="${esc(r.id)}" aria-pressed="${on}">
          <span class="person-text">
            <span class="person-name">${esc(r.name)}</span>
            <span class="person-why">${esc([r.town, r.region].filter(Boolean).join(" · "))}</span>
          </span>
          ${on ? icon("check-circle") : icon("plus")}
        </button>`;
      }).join("");
    }
  }

  function ligarMeuPerfil() {
    const sheet = document.getElementById("meu-perfil-sheet");
    if (!sheet) return;
    sheet.querySelectorAll("[data-close-meu-perfil]").forEach((el) =>
      el.addEventListener("click", fecharMeuPerfilPublico));

    sheet.addEventListener("click", (e) => {
      if (!rascunhoPerfil) return;
      const vis = e.target.closest("[data-vis]");
      if (vis) { rascunhoPerfil.visibilidade = vis.dataset.vis; pintarMeuPerfil(); return; }

      const tirar = e.target.closest("[data-destaque-tirar]");
      if (tirar) {
        rascunhoPerfil.destaques.splice(Number(tirar.dataset.destaqueTirar), 1);
        pintarMeuPerfil();
        return;
      }
      const fav = e.target.closest("[data-fav]");
      if (fav) {
        const id = fav.dataset.fav;
        const i = rascunhoPerfil.favoritos.indexOf(id);
        if (i >= 0) rascunhoPerfil.favoritos.splice(i, 1);
        else if (rascunhoPerfil.favoritos.length < 6) rascunhoPerfil.favoritos.push(id);
        else { sheet.querySelector("[data-meu-perfil-estado]").textContent = "Seis é o máximo. Tira um primeiro."; return; }
        pintarMeuPerfil();
      }
    });

    const add = sheet.querySelector("[data-destaque-add]");
    const texto = sheet.querySelector("[data-destaque-texto]");
    const juntar = () => {
      if (!rascunhoPerfil) return;
      const v = (texto.value || "").trim();
      if (!v) return;
      if (rascunhoPerfil.destaques.length >= 5) {
        sheet.querySelector("[data-meu-perfil-estado]").textContent = "Cinco é o máximo.";
        return;
      }
      rascunhoPerfil.destaques.push(v);
      texto.value = "";
      pintarMeuPerfil();
    };
    if (add) add.addEventListener("click", juntar);
    if (texto) texto.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); juntar(); }
    });

    const guardar = sheet.querySelector("[data-meu-perfil-guardar]");
    if (guardar) guardar.addEventListener("click", async () => {
      if (!rascunhoPerfil) return;
      const estado = sheet.querySelector("[data-meu-perfil-estado]");
      guardar.disabled = true;
      estado.textContent = "A guardar…";
      try {
        await UserData.setPerfilPublico(rascunhoPerfil);
        estado.textContent = "Guardado.";
        haptico("sucesso");
        setTimeout(fecharMeuPerfilPublico, 700);
      } catch (e) {
        estado.textContent = "Não consegui guardar. Tenta outra vez.";
      }
      guardar.disabled = false;
    });
  }

  // ---------- O perfil de outra pessoa ----------
  //
  // Até aqui via-se o nome de alguém no feed e não havia para onde ir. Agora
  // toca-se e abre-se o que essa pessoa escolheu mostrar: os destaques que
  // escreveu sobre o gosto dela, e os sítios que escolheu como favoritos.
  //
  // Escolheu mesmo — nada disto é calculado a partir das avaliações. É a
  // diferença entre um perfil e um relatório.
  async function abrirPerfilDe(uid, nomeConhecido) {
    if (!uid || !UserData.isCloud()) return;
    const me = UserData.me();
    if (uid === me.uid) { navTo("perfil"); return; }

    const sheet = document.getElementById("pessoa-sheet");
    if (!sheet) return;
    const nomeEl = sheet.querySelector("#pessoa-nome");
    const subEl = sheet.querySelector("[data-pessoa-sub]");
    const avatarEl = sheet.querySelector("[data-pessoa-avatar]");
    const corpo = sheet.querySelector("[data-pessoa-conteudo]");

    nomeEl.textContent = nomeConhecido || "";
    subEl.textContent = "";
    subEl.hidden = true;
    avatarEl.innerHTML = avatar(nomeConhecido || "", "");
    corpo.innerHTML = `<div class="skeleton" style="height:64px"></div>`;
    sheet.classList.remove("hidden");
    sheet.setAttribute("aria-hidden", "false");

    let perfil = null, souSeguidor = false;
    try {
      const token = await window.FirebaseAuth.getToken();
      // As duas ao mesmo tempo: o perfil, e se estou na lista de quem a segue.
      // A segunda é o que decide a visibilidade "só quem me segue", e é uma
      // pergunta sobre a lista DELA — não dá para responder do que tenho cá.
      const [p, seguidores] = await Promise.all([
        DB.fetchProfile(uid, token),
        DB.fetchFollowers(uid, token)
      ]);
      perfil = p;
      souSeguidor = Array.isArray(seguidores) && seguidores.includes(me.uid);
    } catch (e) { /* trata-se em baixo */ }

    if (!perfil) {
      corpo.innerHTML = `<p class="muted">Não consegui abrir este perfil agora.</p>`;
      return;
    }

    nomeEl.textContent = perfil.displayName || nomeConhecido || "Sem nome";
    avatarEl.innerHTML = avatar(perfil.displayName || nomeConhecido || "", perfil.photoURL);

    const sigo = UserData.isFollowing(uid);
    const botaoSeguir = `<button type="button" class="btn ${sigo ? "btn-ghost" : "btn-primary"} btn-block"
      data-pessoa-seguir="${esc(uid)}">${sigo ? "A seguir" : "Seguir"}</button>`;

    if (!UserData.podeVerPerfil(perfil, souSeguidor)) {
      subEl.textContent = perfil.visibilidade === "ninguem"
        ? "Este perfil é privado."
        : "Só quem esta pessoa segue de volta vê os destaques.";
      subEl.hidden = false;
      corpo.innerHTML = botaoSeguir;
      ligarBotaoSeguir(sheet, perfil);
      return;
    }

    const listaDestaques = (perfil.destaques || []).filter(Boolean);
    const favoritos = (perfil.favoritos || [])
      .map((id) => restById(id))
      .filter(Boolean);

    corpo.innerHTML = `
      ${listaDestaques.length ? `
        <div class="pessoa-bloco">
          <span class="detail-section-title">O que gosta</span>
          <div class="chip-row">${listaDestaques.map((d) => `<span class="chip">${esc(d)}</span>`).join("")}</div>
        </div>` : ""}
      ${favoritos.length ? `
        <div class="pessoa-bloco">
          <span class="detail-section-title">Favoritos</span>
          ${favoritos.map((r) => `
            <button type="button" class="person-row" data-pessoa-rest="${esc(r.id)}">
              <span class="person-text">
                <span class="person-name">${esc(r.name)}</span>
                <span class="person-why">${esc([r.town, r.region].filter(Boolean).join(" · "))}</span>
              </span>
              ${icon("chevron-right")}
            </button>`).join("")}
        </div>` : ""}
      ${!listaDestaques.length && !favoritos.length
        ? `<p class="muted">Ainda não escolheu nada para mostrar.</p>` : ""}
      ${botaoSeguir}`;

    ligarBotaoSeguir(sheet, perfil);
    sheet.querySelectorAll("[data-pessoa-rest]").forEach((b) => b.addEventListener("click", () => {
      const r = restById(b.dataset.pessoaRest);
      fecharPerfilDe();
      if (r) onSelect(r);
    }));
  }

  function ligarBotaoSeguir(sheet, perfil) {
    const b = sheet.querySelector("[data-pessoa-seguir]");
    if (!b) return;
    b.addEventListener("click", async () => {
      b.disabled = true;
      const sigo = UserData.isFollowing(perfil.uid);
      try {
        if (sigo) await UserData.unfollow(perfil.uid);
        else await UserData.follow(perfil.uid);
        // Reabrir: seguir pode destrancar os destaques, e ficar com o botão
        // trocado e o conteúdo antigo seria mentira.
        abrirPerfilDe(perfil.uid, perfil.displayName);
      } catch (e) { b.disabled = false; }
    });
  }

  function fecharPerfilDe() {
    const sheet = document.getElementById("pessoa-sheet");
    if (!sheet) return;
    sheet.classList.add("hidden");
    sheet.setAttribute("aria-hidden", "true");
  }

  // ---------- Moderação: denunciar e bloquear (diretriz 1.2) ----------
  //
  // A App Store exige as duas coisas a qualquer app com conteúdo de
  // utilizadores, e testa-as à mão: abre conteúdo de outra pessoa e procura o
  // botão. Sem isto é rejeição por Guideline 1.2, e não vale argumentar que são
  // oito pessoas conhecidas — a app está numa loja aberta a toda a gente.
  //
  // São dois gestos diferentes de propósito:
  //   denunciar → é sobre ESTE conteúdo, e vai para quem trata disso;
  //   bloquear  → é sobre AQUELA pessoa, e é imediato e só meu.
  function ligarModeracao(host, r) {
    if (!host) return;
    host.querySelectorAll("[data-moderar]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      abrirModeracao({
        tipo: "comentario",
        alvoId: b.dataset.moderar,
        alvoUid: b.dataset.modUid,
        quem: b.dataset.modQuem || "esta pessoa",
        restaurantId: r ? r.id : ""
      });
    }));
  }

  // Um alvo de cada vez: a folha é uma só no markup, como as outras.
  let modAlvo = null;

  function abrirModeracao(alvo) {
    const sheet = document.getElementById("mod-sheet");
    if (!sheet || !UserData.isCloud()) return;
    modAlvo = alvo;
    const quem = alvo.quem || "esta pessoa";
    sheet.querySelector("#mod-title").textContent =
      alvo.tipo === "foto" ? "Esta fotografia" : "Este comentário";
    sheet.querySelector("[data-mod-de]").textContent = `De ${quem}.`;
    sheet.querySelector("[data-mod-bloquear-label]").textContent = `Bloquear ${quem}`;
    const status = sheet.querySelector("[data-mod-status]");
    if (status) status.textContent = "";
    // A lista de bloqueados usa a mesma folha e esconde estes dois. Repô-los
    // aqui é o que evita a folha aparecer vazia na vez seguinte.
    sheet.querySelector("[data-mod-denunciar]").hidden = false;
    sheet.querySelector("[data-mod-bloquear]").hidden = false;
    sheet.querySelector("[data-mod-dica]").hidden = false;
    sheet.classList.remove("hidden");
    sheet.setAttribute("aria-hidden", "false");
  }

  function fecharModeracao() {
    const sheet = document.getElementById("mod-sheet");
    if (!sheet) return;
    sheet.classList.add("hidden");
    sheet.setAttribute("aria-hidden", "true");
    modAlvo = null;
  }

  function bloquearDaModeracao() {
    if (!modAlvo || !modAlvo.alvoUid) return;
    const quem = modAlvo.quem || "esta pessoa";
    UserData.blockUser(modAlvo.alvoUid, quem);
    fecharModeracao();
    // Redesenhar já: quem bloqueia espera que a pessoa desapareça agora, não
    // no próximo arranque.
    if (state.currentDetail) {
      renderComments(state.currentDetail);
      renderPhotos(state.currentDetail);
    }
    render();
    haptico("sucesso");
    console.log("moderacao: bloqueado", quem);
  }

  async function denunciarDaModeracao() {
    if (!modAlvo) return;
    const sheet = document.getElementById("mod-sheet");
    const status = sheet && sheet.querySelector("[data-mod-status]");
    const alvo = modAlvo;
    if (status) status.textContent = "A enviar…";
    try {
      // `getToken`, e não `getIdToken`.
      //
      // Escrevi `getIdToken` e passei duas medições a culpar as regras do
      // Firestore: o `window.FirebaseAuth` exporta `getToken`, portanto a
      // chamada rebentava com um TypeError antes de haver pedido nenhum, e o
      // `catch` lá em baixo disfarçava-o de "não consegui enviar". Todo o resto
      // do ficheiro usa esta forma — foi só aqui que inventei outra.
      const fb = window.FirebaseAuth;
      const token = fb ? await fb.getToken() : null;
      await DB.addReport({
        tipo: alvo.tipo,
        alvoId: alvo.alvoId,
        alvoUid: alvo.alvoUid,
        restaurantId: alvo.restaurantId,
        denuncianteUid: UserData.me().uid
      }, token);
      if (status) status.textContent = "Denúncia recebida. Vamos analisar.";
      haptico("sucesso");
      setTimeout(fecharModeracao, 1400);
    } catch (e) {
      // A mensagem leva a causa. Um "tenta outra vez" sozinho manda a pessoa
      // repetir um gesto que vai falhar na mesma, e manda quem diagnostica
      // procurar no sítio errado — foi exatamente o que me aconteceu.
      const porque = (e && e.message) || "erro desconhecido";
      if (status) status.textContent = `Não consegui enviar — ${porque}`;
      console.error("moderacao: denuncia falhou", porque);
    }
  }

  // ---------- User-uploaded photos (Cloud Storage) ----------
  function slugifyId(text) {
    return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  async function renderPhotos(r) {
    const mineEl = document.querySelector("#detail-body [data-my-photos]");
    const friendsEl = document.querySelector("#detail-body [data-friends-photos]");
    if (!mineEl && !friendsEl) return;
    if (!DB.isAvailable()) {
      if (mineEl) mineEl.innerHTML = "";
      if (friendsEl) friendsEl.innerHTML = "";
      return;
    }

    const me = UserData.isCloud() ? UserData.me() : null;
    const canUpload = UserData.isCloud() && window.FirebaseStorage && window.FirebaseStorage.configured;

    if (mineEl) {
      mineEl.innerHTML = `
        <div class="photos-head">
          <span class="detail-section-title">${icon("camera")} As minhas fotos</span>
          ${canUpload ? `<button class="btn btn-ghost btn-sm" data-take-photo>${icon("camera")} Tirar foto</button>
            <button class="btn btn-ghost btn-sm" data-add-photo>Galeria</button>
            <input type="file" accept="image/*" capture="environment" data-photo-camera hidden />
            <input type="file" accept="image/*" data-photo-input hidden />` : ""}
        </div>
        <div class="photo-grid" data-my-grid><div class="skeleton" style="height:70px"></div></div>
        <p class="photo-status muted" data-photo-status></p>`;
    }
    if (friendsEl) {
      friendsEl.innerHTML = `
        <div class="photos-head"><span class="detail-section-title">${icon("camera")} Fotos de amigos</span></div>
        <div class="photo-grid" data-friends-grid><div class="skeleton" style="height:70px"></div></div>`;
    }

    const myGrid = mineEl ? mineEl.querySelector("[data-my-grid]") : null;
    const friendsGrid = friendsEl ? friendsEl.querySelector("[data-friends-grid]") : null;

    const photos = await DB.fetchPhotos(r.id);
    if (state.currentDetail !== r) return;
    const mine = me ? photos.filter((p) => p.uid === me.uid) : [];
    // SEC-001: only show photos from people I'm actually allowed to see.
    const others = me ? photos.filter((p) => p.uid !== me.uid && UserData.canSeeUser(p.uid)) : [];
    if (myGrid) paintPhotoGrid(myGrid, mine, me ? "Ainda não juntaste fotos." : "Inicie sessão para adicionar fotos.");
    if (friendsGrid) paintPhotoGrid(friendsGrid, others, "Ainda não há fotos de amigos.");

    if (canUpload && myGrid) {
      const galleryInput = mineEl.querySelector("[data-photo-input]");
      const cameraInput = mineEl.querySelector("[data-photo-camera]");
      const statusEl = mineEl.querySelector("[data-photo-status]");
      const handleFile = async (file) => {
        if (!file) return;
        if (!/^image\//.test(file.type)) { statusEl.textContent = "Isso não é uma imagem."; return; }
        if (file.size > 6 * 1024 * 1024) { statusEl.textContent = "Imagem demasiado grande (máx. 6 MB)."; return; }
        statusEl.textContent = "A enviar foto…";
        try {
          const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
          const path = `restaurants/${slugifyId(r.id)}/${me.uid}-${Date.now()}.${ext}`;
          const url = await window.FirebaseStorage.upload(path, file);
          const fb = window.FirebaseAuth;
          const token = fb ? await fb.getToken() : null;
          const saved = await DB.addPhoto({ restaurantId: r.id, uid: me.uid, author: me.displayName, url, path }, token);
          if (state.currentDetail !== r) return;
          const empty = myGrid.querySelector(".photo-empty");
          if (empty) myGrid.innerHTML = "";
          myGrid.insertAdjacentHTML("beforeend", photoTile(saved));
          statusEl.textContent = "Foto adicionada.";
        } catch (e) {
          statusEl.textContent = "A foto não subiu — tenta outra vez quando houver rede.";
        }
      };
      mineEl.querySelector("[data-add-photo]").addEventListener("click", () => galleryInput.click());
      mineEl.querySelector("[data-take-photo]").addEventListener("click", () => cameraInput.click());
      galleryInput.addEventListener("change", () => { const f = galleryInput.files && galleryInput.files[0]; galleryInput.value = ""; handleFile(f); });
      cameraInput.addEventListener("change", () => { const f = cameraInput.files && cameraInput.files[0]; cameraInput.value = ""; handleFile(f); });
    }
  }

  function paintPhotoGrid(grid, photos, emptyMsg) {
    if (!photos.length) {
      grid.innerHTML = `<p class="photo-empty">${esc(emptyMsg || "Ainda não há fotos.")}</p>`;
      return;
    }
    grid.innerHTML = photos.map(photoTile).join("");
  }

  function photoTile(p) {
    const source = p.source || "user";
    const badge = source === "google" ? "Google" : (p.author || "");
    return `<button type="button" class="photo-tile" data-photo-url="${esc(p.url)}" data-photo-source="${esc(source)}" data-photo-badge="${esc(badge)}" data-photo-uid="${esc(p.uid || "")}" title="${esc(p.author || "")}">
      <img src="${esc(p.url)}" alt="" loading="lazy" />
    </button>`;
  }

  function shareRestaurant(r) {
    const url = googleMapsUrl(r);
    const text = `${r.name} — ${r.town}, ${r.region}`;
    if (navigator.share) {
      navigator.share({ title: r.name, text, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(`${text}\n${url}`).catch(() => {});
    }
  }

  // ---------- Remove a restaurant the user added ----------
  function isLocalCustom(r) {
    return Storage.getCustomRestaurants().some((c) => c.id === r.id);
  }
  function canDeleteRestaurant(r) {
    if (isLocalCustom(r)) return true;
    return UserData.isCloud() && r.addedByUid && r.addedByUid === UserData.me().uid;
  }
  async function removeRestaurant(r) {
    if (!confirm(`Remover "${r.name}"? Esta ação não pode ser anulada.`)) return;
    try {
      if (isLocalCustom(r)) {
        Storage.removeCustomRestaurant(r.id);
      } else {
        const token = window.FirebaseAuth ? await window.FirebaseAuth.getToken() : null;
        await DB.deleteRestaurant(r.id, token);
      }
      state.restaurants = state.restaurants.filter((x) => x.id !== r.id);
      closeDetail();
      buildRegionFilters();
      render();
    } catch (e) {
      alert("Não foi possível remover. Tenta de novo.");
    }
  }

  // Change a restaurant's category and persist it — shared via Firebase when
  // configured, otherwise saved in this browser.
  function setStyles(r, styles) {
    r.styles = styles;
    r.category = legacyCategoryFor(cuisineOf(r), styles); // keep old clients sane
    if (DB.isAvailable()) tokenSessao().then((t) => DB.setAxesOverride(r.id, cuisineOf(r), styles, t)).catch(() => {});
    render();
    highlightCard(r.id);
  }
  function changeCategory(r, key) {
    if (cuisineOf(r) === key) return;
    r.cuisine = key;
    r.category = legacyCategoryFor(key, stylesOf(r));
    Storage.setOverride(r.id, r.category);
    if (DB.isAvailable()) tokenSessao().then((t) => DB.setAxesOverride(r.id, key, stylesOf(r), t)).catch(() => {});

    render();
    highlightCard(r.id);

    const cat = catFor(r);
    const body = document.getElementById("detail-body");
    const headChip = body.querySelector(".detail-sub .cat-chip");
    if (headChip) {
      headChip.style.color = `var(${cat.varName})`;
      headChip.innerHTML = `${dot(cat)} ${cat.label}`;
    }
    const ph = document.querySelector("#detail-hero .placeholder-icon");
    if (ph) ph.style.color = `var(${cat.varName})`;
    body.querySelectorAll("[data-cat-edit] .chip").forEach((c) =>
      c.setAttribute("aria-pressed", String(c.dataset.cat === key))
    );
  }

  async function fillDetailFromPlaces(r) {
    const body = document.getElementById("detail-body");
    const statsEl = body.querySelector("[data-stats]");
    const galleryEl = body.querySelector("[data-gallery]");
    const hoursEl = body.querySelector("[data-hours]");
    const reviewsEl = body.querySelector("[data-reviews]");

    if (!PlacesModule.isAvailable()) {
      statsEl.innerHTML = `<p class="hint">Avaliações, fotos e horários não estão disponíveis aqui.</p>`;
      return;
    }
    // skeletons
    statsEl.innerHTML = `<div class="stat"><span class="label">Avaliação</span><span class="value"><span class="skeleton sk-line" style="width:54px"></span></span></div>`;
    reviewsEl.innerHTML = `<div class="skeleton sk-line" style="width:40%"></div><div class="skeleton" style="height:54px;margin-top:8px"></div>`;

    const data = await PlacesModule.fetchDetails(r);
    if (state.currentDetail !== r) return;
    maybeFixPin(r, data);
    if (!data) {
      statsEl.innerHTML = `<p class="hint">Sem dados do Google para este sítio ainda.</p>`;
      reviewsEl.innerHTML = "";
      return;
    }

    // hero photo — the chosen cover wins over Google's first photo
    const heroUrl = r.photoURL || (data.photos && data.photos[0]);
    if (heroUrl) setHeroPhoto(r, heroUrl);

    // Call / Website CTAs (number + site come from Google)
    const actions = body.querySelector("[data-actions]");
    if (actions && data.phone && !actions.querySelector("[data-call]")) {
      const tel = document.createElement("a");
      tel.className = "btn btn-primary btn-block";
      tel.dataset.call = "1";
      tel.href = "tel:" + String(data.phone).replace(/\s+/g, "");
      tel.innerHTML = `${icon("phone")} Ligar · ${esc(data.phone)}`;
      actions.prepend(tel);
    }
    if (actions && data.website && !actions.querySelector("[data-web]")) {
      const w = document.createElement("a");
      w.className = "btn btn-ghost btn-block";
      w.dataset.web = "1";
      w.href = data.website;
      w.target = "_blank";
      w.rel = "noopener";
      w.innerHTML = `${icon("globe")} Website`;
      actions.insertBefore(w, actions.querySelector("[data-share]"));
    }

    // cuisine suggestion from Google types/price
    const sug = suggestAxes(data.types, data.priceLevelNum);
    const sugEl = body.querySelector("[data-cat-suggest]");
    if (sugEl && sug && sug.cuisine !== cuisineOf(r) && CUISINES[sug.cuisine]) {
      sugEl.hidden = false;
      sugEl.innerHTML =
        `<span class="hint">Sugestão do Google: <strong>${esc(CUISINES[sug.cuisine].label)}</strong></span> ` +
        `<button type="button" class="linklike" data-apply-sug>Aplicar</button>`;
      sugEl.querySelector("[data-apply-sug]").addEventListener("click", () => {
        changeCategory(r, sug.cuisine);
        sugEl.hidden = true;
      });
    }

    // stats
    const stats = [];
    if (typeof data.rating === "number") {
      stats.push(`<div class="stat"><span class="label">Avaliação</span><span class="value">${icon("star")} ${data.rating.toFixed(1)} <span class="muted" style="font-weight:400">(${data.userRatingsTotal || 0})</span></span></div>`);
    }
    if (typeof data.openNow === "boolean") {
      stats.push(`<div class="stat"><span class="label">Agora</span><span class="value"><span class="open-now ${data.openNow ? "open" : "closed"}">${data.openNow ? "Aberto" : "Fechado"}</span></span></div>`);
    }
    if (data.priceLevel) stats.push(`<div class="stat"><span class="label">Preço</span><span class="value">${data.priceLevel}</span></div>`);
    if (data.phone) stats.push(`<div class="stat"><span class="label">Telefone</span><span class="value" style="font-weight:500">${esc(data.phone)}</span></div>`);
    statsEl.innerHTML = stats.join("") || `<p class="hint">Sem detalhes adicionais.</p>`;

    // gallery
    if (data.photos && data.photos.length > 1) {
      galleryEl.innerHTML =
        `<div class="detail-section-title" style="margin-bottom:8px">Fotos</div>` +
        `<div class="gallery">${data.photos.slice(1, 6).map((p) => `<img class="gallery-img" data-photo-source="google" data-photo-badge="Google" data-photo-url="${esc(p)}" src="${esc(p)}" alt="" loading="lazy">`).join("")}</div>`;
    }

    // hours
    if (data.weekdayText && data.weekdayText.length) {
      const todayIdx = (new Date().getDay() + 6) % 7; // Google weekday_text starts Monday
      hoursEl.innerHTML =
        `<div class="detail-section-title" style="margin-bottom:8px">${icon("clock")} Horário</div>` +
        `<div class="hours-list">${data.weekdayText
          .map((t, i) => `<span class="${i === todayIdx ? "today" : ""}">${esc(t)}</span>`)
          .join("")}</div>`;
    }

    // reviews
    if (data.reviews && data.reviews.length) {
      const canAi = AIModule.available() && UserData.isCloud() && data.reviews.some((rv) => rv.text);
      reviewsEl.innerHTML =
        `<div class="detail-section-title" style="margin-bottom:10px">Avaliações</div>` +
        (canAi ? `<button class="btn btn-ghost btn-sm ai-action" data-ai-summarize>${icon("sparkles")} Resumir avaliações</button>
          <div class="ai-reviews" data-ai-reviews></div>` : "") +
        `<div class="reviews">${data.reviews.map(renderReview).join("")}</div>` +
        `<p class="attribution">Avaliações via Google</p>`;
      if (canAi) {
        const sumBtn = reviewsEl.querySelector("[data-ai-summarize]");
        sumBtn.addEventListener("click", () => runSummarizeReviews(r, data.reviews, sumBtn));
      }
    } else {
      reviewsEl.innerHTML = "";
    }
  }

  function renderReview(rv) {
    const stars = [1, 2, 3, 4, 5]
      .map((n) => `<svg class="icon${n <= rv.rating ? "" : " empty"}"><use href="#i-star"/></svg>`)
      .join("");
    const av = rv.photo
      ? `<img class="review-avatar" src="${esc(rv.photo)}" alt="" loading="lazy">`
      : `<span class="review-avatar">${esc((rv.author || "?").charAt(0))}</span>`;
    return `<div class="review">
      <div class="review-head">
        ${av}
        <span class="review-who"><span class="name">${esc(rv.author)}</span><span class="when">${esc(rv.when)}</span></span>
        <span class="review-stars">${stars}</span>
      </div>
      ${rv.text ? `<p class="review-text">${esc(rv.text)}</p>` : ""}
    </div>`;
  }

  function closeDetail() {
    document.getElementById("detail-panel").setAttribute("aria-hidden", "true");
    state.currentDetail = null;
    MapModule.restoreCamera();
  }

  // ---------- Ecrã de entrada ----------
  //
  // Sem sessão não se vê nada. A casca continua a montar-se por baixo — o mapa
  // precisa de existir para o `initApp` correr — mas fica coberta.
  //
  // Dois modos no mesmo formulário, "entrar" e "criar", porque são dois campos
  // de diferença e dois ecrãs seriam duas vezes o mesmo. O nome só aparece a
  // criar: uma conta por email não traz nome nenhum do fornecedor, e sem ele a
  // pessoa apareceria como "Amigo" a toda a gente.
  let entradaModo = "entrar";

  function mostrarEntrada() {
    const el = document.getElementById("entrada");
    if (!el) return;
    el.hidden = false;
    document.body.classList.add("sem-sessao");
  }
  function esconderEntrada() {
    const el = document.getElementById("entrada");
    if (!el) return;
    el.hidden = true;
    document.body.classList.remove("sem-sessao");
    const estado = el.querySelector("[data-entrada-estado]");
    if (estado) estado.textContent = "";
    const palavra = document.getElementById("entrada-palavra");
    if (palavra) palavra.value = "";
  }

  function entradaEstado(texto, tom) {
    const el = document.querySelector("#entrada [data-entrada-estado]");
    if (!el) return;
    el.textContent = texto || "";
    el.classList.toggle("erro", tom === "erro");
  }

  function pintarModoEntrada() {
    const criar = entradaModo === "criar";
    const nome = document.querySelector("#entrada [data-entrada-nome]");
    const submit = document.getElementById("entrada-submit");
    const troca = document.querySelector("#entrada [data-entrada-modo]");
    const palavra = document.getElementById("entrada-palavra");
    if (nome) nome.hidden = !criar;
    if (submit) submit.textContent = criar ? "Criar conta" : "Entrar";
    if (troca) troca.textContent = criar ? "Já tenho conta" : "Criar conta";
    // O autocomplete tem de mudar com o modo, senão o gestor de palavras-passe
    // oferece a antiga quando se está a escolher uma nova.
    if (palavra) palavra.setAttribute("autocomplete", criar ? "new-password" : "current-password");
    entradaEstado("");
  }

  async function submeterEntrada(e) {
    if (e) e.preventDefault();
    const email = (document.getElementById("entrada-email").value || "").trim();
    const palavra = document.getElementById("entrada-palavra").value || "";
    const nome = (document.getElementById("entrada-nome").value || "").trim();
    const btn = document.getElementById("entrada-submit");
    if (!email || !palavra) { entradaEstado("Falta o email ou a palavra-passe.", "erro"); return; }

    btn.disabled = true;
    entradaEstado(entradaModo === "criar" ? "A criar…" : "A entrar…");
    try {
      if (entradaModo === "criar") await AuthModule.criarComEmail(email, palavra, nome);
      else await AuthModule.entrarComEmail(email, palavra);
      // Não se esconde nada aqui: quem esconde é o `onAuthChange`, quando o
      // Firebase confirmar. Esconder já daria um instante de app sem sessão.
    } catch (err) {
      entradaEstado(err.message, "erro");
      haptico("erro");
    }
    btn.disabled = false;
  }

  async function recuperarDaEntrada() {
    const email = (document.getElementById("entrada-email").value || "").trim();
    if (!email) { entradaEstado("Escreve o email primeiro e eu envio o link.", "erro"); return; }
    entradaEstado("A enviar…");
    try {
      await AuthModule.recuperarPalavra(email);
      // Não se diz se a conta existe: dizê-lo transforma este campo num
      // verificador de quem tem conta na app.
      entradaEstado("Se houver conta com esse email, o link vai a caminho.");
    } catch (err) {
      entradaEstado(err.message, "erro");
    }
  }

  function ligarEntrada() {
    const form = document.getElementById("entrada-form");
    if (!form) return;
    form.addEventListener("submit", submeterEntrada);
    const troca = document.querySelector("#entrada [data-entrada-modo]");
    if (troca) troca.addEventListener("click", () => {
      entradaModo = entradaModo === "criar" ? "entrar" : "criar";
      pintarModoEntrada();
    });
    const rec = document.querySelector("#entrada [data-entrada-recuperar]");
    if (rec) rec.addEventListener("click", recuperarDaEntrada);
    const apple = document.getElementById("entrada-apple");
    if (apple) apple.addEventListener("click", () => AuthModule.signInApple());
    const google = document.getElementById("entrada-google");
    if (google) google.addEventListener("click", () => AuthModule.signIn());
    pintarModoEntrada();
  }

  // ---------- Sign-in prompt modal (dismissible) ----------
  function showSigninModal() {
    const m = document.getElementById("signin-modal");
    if (m) m.classList.remove("hidden");
  }
  function hideSigninModal(remember) {
    const m = document.getElementById("signin-modal");
    if (m) m.classList.add("hidden");
    if (remember) {
      try { sessionStorage.setItem("rp.signinPrompt", "off"); } catch (e) {}
    }
  }
  // ---------- Guided tour (spotlight) ----------
  // Os passos só apontam a coisas que estão SEMPRE à vista — a barra de cima e a
  // barra de baixo. O tutorial abre-se a partir do Perfil e não sabe navegar,
  // portanto um passo que aponte à pesquisa ou aos filtros destacaria um
  // retângulo por trás do ecrã do Perfil: o elemento existe e tem medidas, mas
  // está tapado. O mecanismo não muda; muda o que ele aponta.
  //
  // Os dois passos antigos apontavam a `[data-tab-nav="memorias"]` e
  // `"criticas"` — separadores que deixaram de existir quando as Memórias e as
  // Críticas se fundiram no Diário. Não davam erro: o destaque desaparecia e o
  // balão centrava-se, e ninguém reparava que dois dos cinco passos falavam de
  // um sítio que não há.
  const TOUR_STEPS = [
    { title: "Bem-vindo ao Foodboxd",
      text: "Um mapa dos sítios que valem a pena e um diário do que comeste neles. São dois minutos a ver onde está cada coisa." },
    { target: '[data-tab-nav="mapa"]', title: "O mapa",
      text: "Todos os sítios, de Braga ao Algarve. Aqui trocas entre mapa e lista, filtras por cozinha, estilo, região e preço, ou procuras pelo nome de um prato." },
    { target: "#add-open-btn", title: "Acrescentar um sítio",
      text: "É por aqui, venhas do mapa ou da lista. Escreves o nome, e no fim dizes se é um sítio onde queres ir ou onde já foste." },
    { target: "#ai-suggest-btn", title: "Pergunta-me",
      text: "Descreve o que te apetece — «peixe fresco, barato, perto e tranquilo» — e eu sugiro, com o teu gosto e a tua lista à frente." },
    { target: '[data-tab-nav="diario"]', title: "O teu diário",
      text: "Onde foste, o que pediste e o que achaste. Enche-se sozinho à medida que registas visitas." },
    { target: '[data-tab-nav="amigos"]', title: "Os amigos",
      text: "A atividade de quem segues e os rankings. Começa vazio: enche quando seguires alguém." },
    { target: '[data-tab-nav="perfil"]', title: "A tua conta",
      text: "Quem vê a tua atividade, o teu perfil de gosto, e apagar a conta — que apaga mesmo tudo." }
  ];
  let tourIdx = 0;

  // Os passos que este arranque vai mostrar.
  //
  // Nem todos os alvos existem sempre: o "Pergunta-me" desaparece da barra
  // quando o backend de IA não responde. Mostrar um passo a explicar um botão
  // que não está lá é pior do que não o mostrar — a pessoa procura-o e não
  // encontra. Os passos sem alvo (o de boas-vindas) ficam sempre.
  let passosDoTour = TOUR_STEPS;
  function calcularPassos() {
    passosDoTour = TOUR_STEPS.filter((s) => {
      if (!s.target) return true;
      const el = document.querySelector(s.target);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  function paintTourSlide() {
    const step = passosDoTour[tourIdx];
    if (!step) return;
    document.getElementById("tour-title").textContent = step.title;
    document.getElementById("tour-text").textContent = step.text;
    document.getElementById("tour-dots").innerHTML = passosDoTour
      .map((_, i) => `<span class="tour-dot${i === tourIdx ? " on" : ""}"></span>`).join("");
    document.getElementById("tour-prev").style.visibility = tourIdx === 0 ? "hidden" : "visible";
    document.getElementById("tour-next").textContent = tourIdx === passosDoTour.length - 1 ? "Começar" : "Próximo";
    positionTour();
  }
  function positionTour() {
    const step = passosDoTour[tourIdx];
    if (!step) return;
    const hl = document.getElementById("tour-highlight");
    const dim = document.querySelector("#tour .tour-dim");
    const balloon = document.getElementById("tour-balloon");
    const target = step.target ? document.querySelector(step.target) : null;
    const rect = target ? target.getBoundingClientRect() : null;
    if (rect && rect.width && rect.height) {
      const pad = 6;
      hl.style.display = "block";
      hl.style.top = (rect.top - pad) + "px";
      hl.style.left = (rect.left - pad) + "px";
      hl.style.width = (rect.width + pad * 2) + "px";
      hl.style.height = (rect.height + pad * 2) + "px";
      dim.style.background = "transparent";
      balloon.classList.remove("tour-centered");
      const below = rect.top < window.innerHeight / 2;
      const bw = balloon.offsetWidth, bh = balloon.offsetHeight;
      let left = rect.left + rect.width / 2 - bw / 2;
      left = Math.max(12, Math.min(left, window.innerWidth - bw - 12));
      let top = below ? rect.bottom + pad + 12 : rect.top - pad - 12 - bh;
      top = Math.max(12, Math.min(top, window.innerHeight - bh - 12));
      balloon.style.top = top + "px";
      balloon.style.left = left + "px";
    } else {
      hl.style.display = "none";
      dim.style.background = "rgba(0,0,0,0.6)";
      balloon.classList.add("tour-centered");
      balloon.style.top = "";
      balloon.style.left = "";
    }
  }
  // Primeira utilização (js/onboarding.js). Centra o mapa na cidade escolhida e
  // repinta a lista, porque o passo 2 pode ter marcado sítios como visitados.
  function startOnboarding() {
    if (typeof Onboarding === "undefined") { UserData.markOnboarded(); return; }
    Onboarding.start({
      restaurants: state.restaurants || [],
      onTown: (t) => MapModule.panTo(t.lat, t.lng, 12),
      onDone: () => { render(); }
    });
  }

  function showTour() {
    const el = document.getElementById("tour");
    if (!el) return;
    tourIdx = 0;
    calcularPassos();
    el.classList.remove("hidden");
    el.setAttribute("aria-hidden", "false");
    paintTourSlide();
    window.addEventListener("resize", positionTour);
    window.addEventListener("orientationchange", positionTour);
  }
  function hideTour() {
    const el = document.getElementById("tour");
    if (el) { el.classList.add("hidden"); el.setAttribute("aria-hidden", "true"); }
    window.removeEventListener("resize", positionTour);
    window.removeEventListener("orientationchange", positionTour);
  }
  function tourOpen() {
    const el = document.getElementById("tour");
    return el && !el.classList.contains("hidden");
  }

  // ---------- Success modal (after registering an experience) ----------
  let successTimer = null;
  function showSuccess(name) {
    const m = document.getElementById("success-modal");
    if (!m) return;
    const txt = m.querySelector("[data-success-text]");
    if (txt) txt.textContent = `Refeição no ${name} registada e partilhada.`;
    m.classList.remove("hidden");
    clearTimeout(successTimer);
    successTimer = setTimeout(hideSuccess, 3000);
  }
  function hideSuccess() {
    const m = document.getElementById("success-modal");
    if (m) m.classList.add("hidden");
    clearTimeout(successTimer);
  }

  // ---------- Profile modal (edit avatar) ----------
  // A versão que está mesmo a servir, perguntada ao service worker — não uma
  // constante no código, que diria a versão do ficheiro e não a que está em uso.
  async function pintarVersao() {
    const el = document.querySelector("[data-perfil-versao]");
    if (!el) return;
    let v = "";
    try {
      const nomes = await caches.keys();
      v = (nomes.find((n) => n.startsWith("foodboxd-v")) || "").replace("foodboxd-", "");
    } catch (e) { v = ""; }
    el.textContent = v ? `Foodboxd ${v}` : "";
  }

  // ---------- Perfil (4.º separador) ----------
  // Estava atrás de um avatar na barra superior. Trouxe consigo a barra de
  // grupo e a definição de privacidade, que viviam à frente do feed de Amigos.
  // "Desde março de 2025" — vem do metadata da conta, não de nada que guardemos.
  // Sem data (sessão local, ou conta antiga sem metadata) a linha simplesmente
  // não aparece: mais vale calar do que inventar.
  function desdeQuando(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const mes = d.toLocaleDateString("pt-PT", { month: "long" });
    return `<p class="perfil-desde">Desde ${esc(mes)} de ${d.getFullYear()}</p>`;
  }

  function renderPerfil() {
    const el = document.getElementById("perfil-body");
    if (!el) return;
    if (!UserData.isCloud()) {
      el.innerHTML = signinInvite("Inicie sessão com a Google para ter perfil, diário e amigos.");
      return;
    }
    const me = UserData.me();
    const sitios = state.restaurants.filter((r) => UserData.isVisited(r.id)).length;
    const pratos = state.restaurants.reduce((n, r) => n + (((UserData.getRating(r.id) || {}).dishes || []).length), 0);
    const amigos = UserData.getFollowing().length;

    el.innerHTML = `
      <div class="perfil-head">
        ${me.photoURL
          ? `<img class="perfil-avatar" data-profile-img src="${esc(me.photoURL)}" alt="" />`
          : `<span class="perfil-avatar perfil-avatar-empty" data-profile-img>${esc((me.displayName || "?").trim().charAt(0).toUpperCase())}</span>`}
        <h3 class="perfil-name">${esc(me.displayName || "Sem nome")}</h3>
        ${desdeQuando(me.createdAt)}
        <label class="linklike perfil-photo-btn">
          Mudar foto
          <input type="file" accept="image/*" data-profile-input hidden />
        </label>
        <p class="photo-status" data-profile-status></p>
      </div>

      <div class="perfil-tiles">
        <div class="perfil-tile"><span class="perfil-tile-v">${sitios}</span><span class="perfil-tile-l">Restaurantes</span></div>
        <div class="perfil-tile"><span class="perfil-tile-v">${pratos}</span><span class="perfil-tile-l">Pratos</span></div>
        <div class="perfil-tile"><span class="perfil-tile-v">${amigos}</span><span class="perfil-tile-l">Amigos</span></div>
      </div>

      <div id="perfil-groupbar" class="groupbar"></div>

      <div class="perfil-settings">
        ${AIModule.available() ? `<button type="button" class="perfil-row" data-perfil="gosto">${icon("sparkles")}<span>O meu perfil de gosto</span>${icon("chevron-right")}</button>` : ""}
        <button type="button" class="perfil-row" data-perfil="pessoas">${icon("users")}<span>Descobrir pessoas</span>${icon("chevron-right")}</button>
        <button type="button" class="perfil-row" data-perfil="tutorial">${icon("info")}<span>Rever tutorial</span>${icon("chevron-right")}</button>
        <button type="button" class="perfil-row" data-perfil="publico">${icon("user")}<span>O meu perfil público</span>${icon("chevron-right")}</button>
        <button type="button" class="perfil-row" data-perfil="privacidade">${icon("info")}<span>Privacidade</span>${icon("chevron-right")}</button>
        ${UserData.getBlocked().length ? `<button type="button" class="perfil-row" data-perfil="bloqueados">${icon("flag")}<span>Pessoas bloqueadas (${UserData.getBlocked().length})</span>${icon("chevron-right")}</button>` : ""}
        <button type="button" class="perfil-row perfil-row-danger" data-perfil="sair">${icon("log-in")}<span>Terminar sessão</span></button>
        <button type="button" class="perfil-row perfil-row-danger" data-perfil="apagar">${icon("trash")}<span>Apagar conta</span></button>
      </div>
      <p class="perfil-versao" data-perfil-versao></p>`;

    pintarVersao();

    renderGroupBar();
    wireProfileUpload();
    el.querySelectorAll("[data-perfil]").forEach((b) => b.addEventListener("click", () => {
      const what = b.dataset.perfil;
      if (what === "apagar") abrirApagarConta();
      else if (what === "privacidade") abrirPrivacidade();
      else if (what === "publico") abrirMeuPerfilPublico();
      else if (what === "bloqueados") abrirBloqueados();
      else if (what === "gosto") showTasteProfile();
      else if (what === "pessoas") openPeopleModal();
      else if (what === "tutorial") showTour();
      else if (what === "sair") AuthModule.signOut();
    }));
  }

  // A política de privacidade abre-se FORA da app, e é de propósito.
  //
  // Na web um link normal chegava. No nativo não: a app corre numa WKWebView
  // sem barra de endereço nem botão de retroceder — abrir a página dentro dela
  // deixaria a pessoa numa página estática sem forma de voltar, e a única saída
  // seria matar a app. O `_blank` faz o Capacitor entregá-la ao browser do
  // sistema, que tem os dois.
  //
  // O endereço é absoluto pelo mesmo motivo do `CONFIG.API_BASE`: em
  // `capacitor://localhost` um caminho relativo resolve para o handler local de
  // ficheiros. Aqui até existiria (a página vai dentro do bundle), mas abria
  // dentro da webview — que é exatamente o que não se quer.
  function abrirPrivacidade() {
    window.open("https://foodboxd.pt/privacidade", "_blank", "noopener");
  }

  // A lista de bloqueados, e a única forma de desfazer um bloqueio.
  //
  // Existe porque um bloqueio sem volta é uma armadilha: a pessoa desaparece de
  // tudo e não há onde a ir buscar. Os nomes vêm do `profiles` e não do
  // `userData` — depois de bloquear deixa-se de seguir, portanto o `userData`
  // dessa pessoa já não é descarregado.
  function abrirBloqueados() {
    const pessoas = UserData.getBlocked();
    const sheet = document.getElementById("mod-sheet");
    if (!sheet || !pessoas.length) return;
    sheet.querySelector("#mod-title").textContent = "Pessoas bloqueadas";
    sheet.querySelector("[data-mod-de]").textContent = "Não veem que estão bloqueadas.";
    // Esta folha é a mesma da denúncia. Aqui as duas ações não fazem sentido, e
    // a dica também não — falava de bloquear a quem já bloqueou.
    sheet.querySelector("[data-mod-denunciar]").hidden = true;
    sheet.querySelector("[data-mod-bloquear]").hidden = true;
    sheet.querySelector("[data-mod-dica]").hidden = true;
    const status = sheet.querySelector("[data-mod-status]");

    // O nome vem do que se guardou ao bloquear. Uma conta bloqueada antes desta
    // mudança não tem nome guardado — nesse caso diz-se "Pessoa bloqueada", que
    // é honesto, em vez do identificador em bruto, que não diz nada a ninguém.
    status.innerHTML = pessoas.map((p) => `
      <span class="comment">
        ${avatar(p.nome || "Pessoa bloqueada", "")}
        <span class="comment-body"><span class="name">${esc(p.nome || "Pessoa bloqueada")}</span></span>
        <button type="button" class="btn btn-ghost btn-sm" data-desbloquear="${esc(p.uid)}">Desbloquear</button>
      </span>`).join("");
    status.querySelectorAll("[data-desbloquear]").forEach((b) => b.addEventListener("click", () => {
      UserData.unblockUser(b.dataset.desbloquear);
      fecharModeracao();
      render();
      renderPerfil();
    }));
    sheet.classList.remove("hidden");
    sheet.setAttribute("aria-hidden", "false");
  }

  function wireProfileUpload() {
    const input = document.querySelector("#perfil-body [data-profile-input]");
    const status = document.querySelector("#perfil-body [data-profile-status]");
    if (!input || input.dataset.wired) return;
    input.dataset.wired = "1";
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      input.value = "";
      if (!file) return;
      if (!UserData.isCloud() || !(window.FirebaseStorage && window.FirebaseStorage.configured)) {
        if (status) status.textContent = "Inicie sessão para mudar a foto.";
        return;
      }
      if (!/^image\//.test(file.type)) { if (status) status.textContent = "Isso não é uma imagem."; return; }
      if (file.size > 6 * 1024 * 1024) { if (status) status.textContent = "Imagem demasiado grande (máx. 6 MB)."; return; }
      if (status) status.textContent = "A enviar…";
      try {
        const me = UserData.me();
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `avatars/${me.uid}-${Date.now()}.${ext}`;
        const url = await window.FirebaseStorage.upload(path, file);
        UserData.setPhotoURL(url);
        const chipImg = document.getElementById("user-chip-img");
        if (chipImg) { chipImg.src = url; chipImg.classList.remove("hidden"); }
        const pm = document.querySelector("#perfil-body [data-profile-img]");
        if (pm && pm.tagName === "IMG") pm.src = url;
        refreshOpenDetail();
        refreshActiveDataScreen();
        if (status) status.textContent = "Foto atualizada.";
      } catch (e) {
        if (status) status.textContent = "A foto não subiu — tenta outra vez quando houver rede.";
      }
    });
  }

  // Arrastar um sheet para baixo fecha-o — o mesmo gesto que a ficha já tinha,
  // e o mecanismo universal de "voltar" que o handoff quer para o nativo, onde
  // não há swipe-from-edge dentro de um WebView.
  function wireSheetDrag(sheetId, onClose) {
    const sheet = document.getElementById(sheetId);
    if (!sheet || sheet.dataset.dragWired) return;
    sheet.dataset.dragWired = "1";
    const card = sheet.querySelector(".sheet-card");
    const handle = sheet.querySelector(".sheet-handle");
    if (!card || !handle) return;
    let y0 = 0, dy = 0, dragging = false;
    handle.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      dragging = true; y0 = e.touches[0].clientY; dy = 0;
      card.style.transition = "none";
    }, { passive: true });
    handle.addEventListener("touchmove", (e) => {
      if (!dragging) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      card.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      card.style.transition = "";
      card.style.transform = "";
      if (dy > 90) onClose();
    };
    handle.addEventListener("touchend", end);
    handle.addEventListener("touchcancel", end);
  }

  // ---------- Native-feel gestures ----------
  // Swipe the detail bottom sheet down to dismiss (mobile only).
  function wireDetailSwipe() {
    const card = document.querySelector("#detail-panel .detail-card");
    if (!card) return;
    let startY = 0, dy = 0, dragging = false, allow = false, startT = 0;
    card.addEventListener("touchstart", (e) => {
      if (!isMobile() || e.touches.length !== 1) { allow = false; return; }
      startY = e.touches[0].clientY;
      startT = Date.now();
      dy = 0; dragging = false;
      allow = card.scrollTop <= 0; // only when content is at the top
    }, { passive: true });
    card.addEventListener("touchmove", (e) => {
      if (!allow) return;
      const delta = e.touches[0].clientY - startY;

      // O limiar tem de ser nos DOIS sentidos.
      //
      // Antes só olhava para baixo: `if (delta > 0)`. Quem arrastasse para cima
      // para chegar aos comentários — com a descida mínima que um polegar faz ao
      // assentar antes do flick — engatava o fecho, e a ficha fechava-se a meio
      // de um gesto cujo sentido era o contrário. Reproduzido no simulador: 62pt
      // para baixo e 262pt para cima em 175ms fecha a ficha.
      //
      // Assim que o dedo mostra que vai para cima, o gesto passa a ser do
      // scroller e não volta a ser nosso neste toque. Tem de ser aqui e não no
      // fim: depois de um preventDefault() num touchmove, o WebKit já não inicia
      // o scroll para o resto da sequência — largar o gesto a meio não o devolve.
      if (!dragging && delta < -6) { allow = false; return; }

      if (delta > 0 && !dragging && delta > 6) { dragging = true; card.classList.add("dragging"); }
      if (dragging) {
        // `Math.max(0, delta)` a cada movimento, e não `dy = delta` só quando é
        // positivo. Congelado no último valor positivo, o `dy` ficava a dizer
        // "desceu 62px" enquanto o dedo já ia a subir — e era esse número
        // congelado que o `end()` julgava. É o que o wireSheetDrag já faz.
        dy = Math.max(0, delta);
        e.preventDefault();
        card.style.transform = `translateY(${dy}px)`;
      }
    }, { passive: false });
    const end = () => {
      if (!dragging) return;
      card.classList.remove("dragging");
      const fast = dy > 50 && Date.now() - startT < 250;
      if (dy > 120 || fast) {
        card.style.transform = "";
        closeDetail();
      } else {
        card.style.transform = "translateY(0)";
        setTimeout(() => { card.style.transform = ""; }, 250);
      }
      dragging = false; allow = false; dy = 0;
    };
    card.addEventListener("touchend", end);
    card.addEventListener("touchcancel", end);
  }

  // Pull-to-refresh on the data screens.
  function wirePullToRefresh() {
    document.querySelectorAll(".screen-data").forEach((sc) => {
      const ptr = document.createElement("div");
      ptr.className = "ptr";
      ptr.innerHTML = `<div class="ptr-spinner"></div>`;
      sc.insertBefore(ptr, sc.firstChild);
      let startY = 0, pulling = false, dist = 0, refreshing = false, engatado = false;
      sc.addEventListener("touchstart", (e) => {
        if (refreshing || e.touches.length !== 1) { pulling = false; return; }
        pulling = sc.scrollTop <= 0;
        engatado = false;
        if (pulling) { startY = e.touches[0].clientY; dist = 0; ptr.classList.remove("settle"); }
      }, { passive: true });
      sc.addEventListener("touchmove", (e) => {
        if (!pulling || refreshing) return;
        dist = e.touches[0].clientY - startY;

        // O mesmo desarme que o gesto da ficha tem, e pela mesma razão.
        //
        // O `pulling` era decidido no touchstart — dedo no topo — e nunca mais
        // reavaliado. Quem assentasse o dedo no topo, subisse a rolar a lista e
        // no mesmo toque voltasse a descer mais do que tinha subido, via o
        // `dist` voltar a ser positivo: o preventDefault matava o fling e, se
        // passasse dos 90, o `reloadData()` disparava sem ninguém ter puxado do
        // topo. Reproduzido no test:gesto antes de isto existir.
        if (!engatado && dist < -6) { pulling = false; return; }

        if (dist > 0) {
          if (dist > 12) { engatado = true; e.preventDefault(); }
          ptr.style.height = Math.min(dist * 0.5, 70) + "px";
        }
      }, { passive: false });
      const end = async () => {
        if (!pulling || refreshing) return;
        pulling = false;
        ptr.classList.add("settle");
        if (dist > 90) {
          refreshing = true;
          ptr.style.height = "44px";
          ptr.classList.add("spin");
          try { await reloadData(); } catch (e) {}
          ptr.classList.remove("spin");
          ptr.style.height = "0px";
          refreshing = false;
        } else {
          ptr.style.height = "0px";
        }
        dist = 0;
      };
      sc.addEventListener("touchend", end);
      sc.addEventListener("touchcancel", end);
    });
  }

  // iOS "Add to Home Screen" hint (Safari doesn't fire beforeinstallprompt).
  function maybeShowA2HS() {
    const el = document.getElementById("ios-a2hs");
    if (!el) return;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent || "");
    const standalone = window.navigator.standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;
    // Na app nativa o userAgent continua a dizer iPhone e a WKWebView não é
    // "display-mode: standalone" — sem esta guarda, a app instalada mandava
    // instalá-la outra vez pelo Safari.
    const nativo = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    let dismissed = false;
    try { dismissed = localStorage.getItem("foodboxd.a2hsDismissed") === "1"; } catch (e) {}
    if (isIOS && !standalone && !nativo && !dismissed) el.classList.remove("hidden");
  }
  function hideA2HS() {
    const el = document.getElementById("ios-a2hs");
    if (el) el.classList.add("hidden");
    try { localStorage.setItem("foodboxd.a2hsDismissed", "1"); } catch (e) {}
  }

  // ---------- Photo viewer (in-app lightbox: download / share) ----------
  let viewerUrl = "";
  // Quem publicou a foto que está aberta. Serve para o "Denunciar" do
  // visualizador saber sobre quem é — as fotos da Google não têm dono nosso, e
  // as minhas não se denunciam a si próprias.
  let viewerDono = { uid: "", quem: "" };
  function viewerOpen() {
    const m = document.getElementById("photo-viewer");
    return m && !m.classList.contains("hidden");
  }
  function openPhotoViewer(url, source, dono) {
    const m = document.getElementById("photo-viewer");
    if (!m || !url) return;
    viewerUrl = url;
    viewerDono = dono || { uid: "", quem: "" };
    const meuUid = UserData.isCloud() ? UserData.me().uid : "";
    const denBtn = m.querySelector("[data-viewer-denunciar]");
    // Só em fotos de outra pessoa, e só com sessão: a diretriz 1.2 é sobre
    // conteúdo alheio, e sem conta não há quem denuncie.
    if (denBtn) denBtn.hidden = !(meuUid && viewerDono.uid && viewerDono.uid !== meuUid);
    const img = m.querySelector("[data-viewer-img]");
    if (img) img.src = url;
    // "Foto do restaurante" only from a restaurant's gallery, signed in, and never
    // for Google photos — their URLs expire, which would silently break the cover.
    const coverBtn = m.querySelector("[data-viewer-cover]");
    if (coverBtn) coverBtn.classList.toggle("hidden",
      !(state.currentDetail && UserData.isCloud() && DB.isAvailable()) || source === "google");
    m.classList.remove("hidden");
  }
  // Swap the detail hero photo in only once it loads (broken/expired URLs keep
  // the category placeholder instead of a broken-image icon).
  function setHeroPhoto(r, url) {
    const hero = document.getElementById("detail-hero");
    if (!hero || !url) return;
    const img = new Image();
    img.alt = r.name;
    img.onload = () => { if (state.currentDetail === r) { hero.innerHTML = ""; hero.appendChild(img); } };
    img.src = url;
  }

  // The shared cover write, used by the photo viewer AND the cover chooser.
  // An empty url clears the override -> back to the Google photo.
  async function setRestaurantCoverUrl(r, url) {
    if (!r || !UserData.isCloud()) return false;
    await DB.setPhotoOverride(r.id, url || "", await tokenSessao());
    r.photoURL = url || "";
    if (url) setHeroPhoto(r, url);
    render();
    refreshOpenDetail();
    refreshActiveDataScreen();
    return true;
  }

  // Set the tapped community photo as this restaurant's cover (shared override).
  async function setRestaurantCover(url) {
    const r = state.currentDetail;
    if (!r || !url || !UserData.isCloud()) return;
    const btn = document.querySelector("[data-viewer-cover]");
    if (btn) { btn.disabled = true; btn.classList.add("busy"); }
    try {
      await setRestaurantCoverUrl(r, url);
      hidePhotoViewer();
    } catch (e) {
      if (btn) btn.textContent = "Não foi possível.";
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove("busy"); }
    }
  }

  // ---------- Map search: explore without committing ----------
  // Results are temporary pins + a preview sheet. Nothing is saved unless you tap
  // "Quero ir"/"Já fui"; closing the search wipes the pins.
  let mapSearchResults = [];
  function openMapSearch() {
    const box = document.getElementById("map-search");
    if (!box) return;
    box.classList.remove("hidden");
    const input = document.getElementById("map-search-input");
    if (input) input.focus();
  }
  function closeMapSearch() {
    const box = document.getElementById("map-search");
    if (box) box.classList.add("hidden");
    const res = document.getElementById("map-search-results");
    if (res) res.innerHTML = "";
    mapSearchResults = [];
    MapModule.clearSearchMarkers(); // nothing lingers on the map
  }
  async function runMapSearch() {
    const input = document.getElementById("map-search-input");
    const res = document.getElementById("map-search-results");
    if (!input || !res) return;
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    if (!PlacesModule.isAvailable()) {
      res.innerHTML = `<p class="muted ai-hint">O mapa do Google tem de estar ativo para procurar.</p>`;
      return;
    }
    res.innerHTML = `<div class="ai-loading"><span class="ai-spinner"></span> A procurar nesta área…</div>`;
    const vp = MapModule.getViewport();
    let places = [];
    try {
      places = await PlacesModule.textSearch(q, {
        location: vp ? { lat: vp.lat, lng: vp.lng } : null,
        radiusKm: vp ? vp.radiusKm : 10,
        limit: 12
      });
    } catch (e) { places = []; }
    // Mark the ones already on your list instead of hiding them — knowing it's
    // already yours is useful while exploring.
    const known = new Set(state.restaurants.map((r) => normName(r.name)));
    places.forEach((p) => { p.known = known.has(normName(p.name)); });
    mapSearchResults = places;
    if (!places.length) {
      res.innerHTML = `<p class="muted ai-hint">Nada encontrado nesta área. Arrasta o mapa ou tenta outro termo.</p>`;
      MapModule.clearSearchMarkers();
      return;
    }
    MapModule.setSearchMarkers(places, (p) => {
      const idx = mapSearchResults.indexOf(p);
      if (idx >= 0) toggleMapResultPreview(idx);
    });
    res.innerHTML = places.map((p, i) => mapResultHtml(p, i)).join("");
    res.querySelectorAll("[data-map-result]").forEach((el) =>
      el.addEventListener("click", () => toggleMapResultPreview(parseInt(el.dataset.mapResult, 10))));
  }
  function mapResultHtml(p, i) {
    const meta = [];
    if (p.rating) meta.push(`${icon("star")} ${p.rating.toFixed(1)} (${p.userRatingsTotal})`);
    if (p.priceLevel) meta.push(p.priceLevel);
    return `<div class="map-result" data-map-result-item="${i}">
      <button type="button" class="map-result-main" data-map-result="${i}">
        <span class="map-result-name">${esc(p.name)}${p.known ? ` <span class="badge">na tua lista</span>` : ""}</span>
        <span class="ai-discover-loc">${esc(townFromAddress(p.address))}</span>
        ${meta.length ? `<span class="ai-discover-meta">${meta.join(" · ")}</span>` : ""}
      </button>
      <div class="discover-preview" data-map-host="${i}" hidden></div>
    </div>`;
  }
  async function toggleMapResultPreview(i) {
    const res = document.getElementById("map-search-results");
    const host = res && res.querySelector(`[data-map-host="${i}"]`);
    const p = mapSearchResults[i];
    if (!host || !p) return;
    const wasOpen = !host.hidden;
    res.querySelectorAll(".discover-preview").forEach((h) => { h.hidden = true; });
    if (wasOpen) return;
    host.hidden = false;
    MapModule.panTo(p.lat, p.lng);
    host.innerHTML = `<div class="ai-loading"><span class="ai-spinner"></span> A espreitar…</div>`;
    let d = null;
    try { d = p.placeId ? await PlacesModule.detailsByPlaceId(p.placeId) : null; } catch (e) { d = null; }
    if (host.hidden) return;
    const bits = [];
    if (d && typeof d.rating === "number") bits.push(`${icon("star")} ${d.rating.toFixed(1)} (${d.userRatingsTotal || 0})`);
    if (d && d.priceLevel) bits.push(esc(d.priceLevel));
    if (d && typeof d.openNow === "boolean") bits.push(`<span class="open-now ${d.openNow ? "open" : "closed"}">${d.openNow ? "Aberto agora" : "Fechado agora"}</span>`);
    const todayIdx = (new Date().getDay() + 6) % 7;
    const today = d && d.weekdayText && d.weekdayText[todayIdx] ? d.weekdayText[todayIdx] : "";
    host.innerHTML = `
      ${d && d.photos && d.photos[0] ? `<div class="discover-photo"><div class="ph" data-label="foto"></div></div>` : ""}
      ${bits.length ? `<div class="ai-discover-meta">${bits.join(" · ")}</div>` : ""}
      ${d && d.address ? `<div class="discover-addr">${icon("pin")} ${esc(d.address)}</div>` : ""}
      ${today ? `<div class="discover-hours">${icon("clock")} ${esc(today)}</div>` : ""}
      <div class="discover-preview-actions">
        ${d && d.googleUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(d.googleUrl)}" target="_blank" rel="noopener">${icon("external")} Google</a>` : ""}
        ${p.known ? `<span class="muted ai-hint">Já está na tua lista.</span>` : `
          <button class="btn btn-ghost btn-sm" data-map-add-log="${i}">${icon("check-circle")} Já fui</button>
          <button class="btn btn-primary btn-sm" data-map-add-wish="${i}">${icon("flame")} Quero ir</button>`}
      </div>`;
    const ph = host.querySelector(".ph");
    if (ph && d && d.photos && d.photos[0]) setThumbPhoto(ph, d.photos[0]);
    const wish = host.querySelector("[data-map-add-wish]");
    if (wish) wish.addEventListener("click", () => addDiscoveredPlace(p, wish));
    const log = host.querySelector("[data-map-add-log]");
    // `visited: true` pela mesma razão do formulário: "Já fui" tem de marcar o
    // que diz. Sem isto ficavam duas convenções para a mesma escolha — a da
    // lupa a não marcar e a do formulário a marcar.
    if (log) log.addEventListener("click", () => addDiscoveredPlace(p, log, { tab: "experiencia", priority: false, visited: true }));
  }

  // ---------- Cover chooser (the "Mudar foto" button on the hero) ----------
  function hideCoverModal() { document.getElementById("cover-modal").classList.add("hidden"); }
  async function openCoverModal() {
    const r = state.currentDetail;
    if (!r || !UserData.isCloud()) { showSigninModal(); return; }
    const m = document.getElementById("cover-modal");
    const grid = m.querySelector("[data-cover-grid]");
    const status = m.querySelector("[data-cover-status]");
    const googleBtn = m.querySelector("[data-cover-google]");
    status.textContent = "";
    googleBtn.hidden = !r.photoURL; // only when a custom cover is set
    m.classList.remove("hidden");
    grid.innerHTML = `<div class="skeleton" style="height:70px;grid-column:1/-1"></div>`;
    let photos = [];
    try {
      const me = UserData.me();
      photos = (await DB.fetchPhotos(r.id)).filter((p) => p.uid === me.uid || UserData.canSeeUser(p.uid));
    } catch (e) { photos = []; }
    if (state.currentDetail !== r) return;
    grid.innerHTML = photos.length
      ? photos.map((p, i) => `<button type="button" class="cover-tile${p.url === r.photoURL ? " current" : ""}" data-cover-pick="${i}">
          <img src="${esc(p.url)}" alt="" loading="lazy" />${p.url === r.photoURL ? `<span class="cover-current">${icon("check")}</span>` : ""}
        </button>`).join("")
      : `<p class="cover-empty">Ainda não há fotos da comunidade — carrega uma tua.</p>`;
    grid.querySelectorAll("[data-cover-pick]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        status.textContent = "A definir…";
        try { await setRestaurantCoverUrl(r, photos[parseInt(btn.dataset.coverPick, 10)].url); hideCoverModal(); }
        catch (e) { status.textContent = "Não foi possível. Tenta de novo."; }
      }));
  }
  async function coverUpload(file) {
    const r = state.currentDetail;
    const m = document.getElementById("cover-modal");
    const status = m.querySelector("[data-cover-status]");
    if (!r || !file || !UserData.isCloud() || !(window.FirebaseStorage && window.FirebaseStorage.configured)) return;
    if (!/^image\//.test(file.type)) { status.textContent = "Isso não é uma imagem."; return; }
    if (file.size > 6 * 1024 * 1024) { status.textContent = "Imagem demasiado grande (máx. 6 MB)."; return; }
    status.textContent = "A enviar…";
    try {
      const me = UserData.me();
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `restaurants/${slugifyId(r.id)}/${me.uid}-${Date.now()}.${ext}`;
      const url = await window.FirebaseStorage.upload(path, file);
      const fb = window.FirebaseAuth;
      const token = fb ? await fb.getToken() : null;
      await DB.addPhoto({ restaurantId: r.id, uid: me.uid, author: me.displayName, url, path }, token); // into the gallery too
      await setRestaurantCoverUrl(r, url);
      hideCoverModal();
    } catch (e) {
      status.textContent = "A foto não subiu — tenta outra vez quando houver rede.";
    }
  }
  function hidePhotoViewer() {
    const m = document.getElementById("photo-viewer");
    if (!m) return;
    m.classList.add("hidden");
    const img = m.querySelector("[data-viewer-img]");
    if (img) img.src = "";
  }
  async function downloadPhoto(url) {
    if (!url) return;
    try {
      const res = await fetch(url, { mode: "cors" });
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "foodboxd-" + Date.now() + (/(png)/.test(blob.type) ? ".png" : ".jpg");
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) {
      window.open(url, "_blank", "noopener"); // fallback when the blob can't be fetched
    }
  }
  async function sharePhoto(url) {
    if (!url) return;
    try {
      if (navigator.canShare) {
        const res = await fetch(url, { mode: "cors" });
        const blob = await res.blob();
        const file = new File([blob], "foodboxd.jpg", { type: blob.type || "image/jpeg" });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
      }
      if (navigator.share) { await navigator.share({ url }); return; }
      await navigator.clipboard.writeText(url);
    } catch (e) { /* cancelled or unsupported */ }
  }

  // ---------- AI layer (Claude via the `ai` Cloud Function) ----------
  // Distance in km between two lat/lng points (haversine), for "perto de mim".
  function distKm(a, b) {
    const R = 6371, toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10;
  }

  function restById(id) {
    return state.restaurants.find((r) => r.id === id) || null;
  }

  // Compact catalog the model reasons over: only already-visible data + my marks.
  // O que o modelo recebe sobre cada sítio. Os teus vêm primeiro e marcados:
  // num catálogo de 49 onde avaliaste 7, o modelo não devia ter de procurar as
  // agulhas.
  function aiCatalog(near) {
    const NOTA_MAX = 240;
    const entradas = state.restaurants.map((r) => {
      const rt = UserData.getRating(r.id) || {};
      const hist = UserData.getHistory(r.id) || [];
      const e = { id: r.id, name: r.name, town: r.town, region: r.region, cuisine: cuisineOf(r), styles: stylesOf(r) };
      // Descrição curada do sítio — NÃO é opinião tua. O prompt di-lo ao modelo.
      if (r.notes) e.specialty = r.notes;
      if (UserData.isVisited(r.id)) e.visited = true;
      if (UserData.isPriority(r.id)) e.priority = true;
      if (rt.stars) e.myStars = rt.stars;
      if (rt.dishes && rt.dishes.length) e.myDishes = rt.dishes;
      // A nota pessoal é a coisa mais rica que se escreve na app, e até aqui
      // nunca saía dela: o modelo recebia estrelas e nomes de pratos, e nada
      // em texto teu.
      if (rt.note) e.myNote = String(rt.note).slice(0, NOTA_MAX);
      // Voltar a um sítio é o sinal mais forte de que se gosta, e era invisível.
      if (hist.length) {
        e.visits = hist.length;
        const ultima = UserData.visitDate(hist[hist.length - 1]);
        if (ultima) e.lastVisit = ultima;
      }
      const avg = UserData.avgRating(r.id);
      if (avg) e.groupAvg = Math.round(avg * 10) / 10;
      if (near && typeof r.lat === "number" && typeof r.lng === "number") {
        e.distKm = distKm(near, { lat: r.lat, lng: r.lng });
      }
      return e;
    });
    const meu = (e) => e.myStars || e.myNote || e.visited || e.visits;
    return entradas.filter(meu).concat(entradas.filter((e) => !meu(e)));
  }

  // O agregado do gosto. Três coisas mudaram face ao que existia:
  //   · usava r.category, o campo legado, que colapsa as 13 cozinhas em 2
  //     ("tradicional" e "pastelaria") — um japonês de 5 estrelas entrava como
  //     tradicional. Passa a usar cuisineOf();
  //   · somava as estrelas, o que fazia uma avaliação de 1 estrela AUMENTAR o
  //     peso da cozinha e confundia frequência com gosto. Passa a dar média e
  //     contagem em separado;
  //   · não havia sinal negativo nenhum. Passa a haver.
  function aiProfile() {
    const porCozinha = {};
    const pratos = new Map();
    let rated = 0, sum = 0;
    state.restaurants.forEach((r) => {
      const rt = UserData.getRating(r.id);
      if (!rt || !rt.stars) return;
      rated++; sum += rt.stars;
      const c = cuisineOf(r);
      const acc = (porCozinha[c] = porCozinha[c] || { total: 0, sitios: 0 });
      acc.total += rt.stars; acc.sitios++;
      if (rt.stars >= 4 && Array.isArray(rt.dishes)) {
        rt.dishes.forEach((d) => {
          const k = String(d).trim().toLowerCase();
          if (!k) return;
          const p = pratos.get(k) || { prato: String(d).trim(), vezes: 0, sitios: [], estrelas: 0 };
          p.vezes++; p.estrelas = Math.max(p.estrelas, rt.stars);
          if (p.sitios.length < 3) p.sitios.push(r.name);
          pratos.set(k, p);
        });
      }
    });

    const cozinhas = Object.entries(porCozinha)
      .map(([cozinha, a]) => ({ cozinha, media: Math.round((a.total / a.sitios) * 10) / 10, sitios: a.sitios }))
      .sort((a, b) => b.media - a.media || b.sitios - a.sitios);

    return {
      name: UserData.isCloud() ? (UserData.me().displayName || "") : "",
      visitedCount: state.restaurants.filter((r) => UserData.isVisited(r.id)).length,
      avgStars: rated ? Math.round((sum / rated) * 10) / 10 : null,
      ratedCount: rated,
      // média por cozinha e quantos sítios — gosto e frequência separados
      cuisines: cozinhas.filter((c) => c.media > 2),
      dislikedCuisines: cozinhas.filter((c) => c.media <= 2),
      likedDishes: [...pratos.values()].sort((a, b) => b.vezes - a.vezes || b.estrelas - a.estrelas).slice(0, 20),
      // O que a pessoa escreveu sobre si. Vai como dados, nunca como instrução —
      // a função embrulha-o num bloco delimitado antes de o dar ao modelo.
      ownWords: UserData.isCloud() ? (UserData.getTasteNote() || "") : ""
    };
  }

  // AI suggestion modal ------------------------------------------------------
  function openAi() { document.getElementById("ai-modal").classList.remove("hidden"); }
  function hideAi() { document.getElementById("ai-modal").classList.add("hidden"); }
  function aiOpen() { return !document.getElementById("ai-modal").classList.contains("hidden"); }
  function aiLoading(msg) {
    document.getElementById("ai-body").innerHTML =
      `<div class="ai-loading"><span class="ai-spinner"></span> ${esc(msg || "A pensar…")}</div>`;
  }
  function aiError(msg) {
    document.getElementById("ai-body").innerHTML =
      `<div class="ai-error">${icon("info")} ${esc(msg || "Não foi possível gerar agora.")}</div>`;
  }

  // ---------- Smart Suggestion (chatbot, caixa única) ----------
  function runSmartSuggest() {
    if (!UserData.isCloud()) { showSigninModal(); return; }
    if (!state.restaurants.length) return;
    openAi();
    renderAiComposer();
  }
  function renderAiComposer(prefill) {
    document.getElementById("ai-body").innerHTML = `
      <div class="ai-compose">
        <textarea class="note-input ai-ask" data-ai-ask rows="2" placeholder="O que te apetece? (ex.: peixe fresco, barato, perto e tranquilo)">${esc(prefill || "")}</textarea>
        <button class="btn btn-primary btn-block" data-ai-send>${icon("sparkles")} Pergunta-me</button>
        <p class="ai-hint muted">Uso o teu gosto, a tua lista e a tua localização.</p>
      </div>`;
    const ta = document.querySelector("#ai-body [data-ai-ask]");
    const send = document.querySelector("#ai-body [data-ai-send]");
    const go = () => submitSmartSuggest(ta ? ta.value.trim() : "");
    if (send) send.addEventListener("click", go);
    if (ta) { ta.focus(); ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } }); }
  }
  // How far "perto" may stretch. Kept modest so the model can't pass off a place
  // 100 km away as nearby — when nothing in the list qualifies it discovers new ones.
  const NEAR_MAX_KM = 25;

  // Onde estou — e porque é que na app nativa não é o `navigator`.
  //
  // Na web o `navigator.geolocation` é tudo o que há e não há mais nada a
  // dizer. Na app nativa há: a WKWebView trata a página como um site qualquer e
  // pede a **sua própria** permissão por cima da que o iOS já pediu. Apareciam
  // duas caixas seguidas, e a segunda dizia
  //
  //     "localhost" would like to use your current location.
  //
  // que não quer dizer nada a ninguém e parece avaria — e é dos detalhes que a
  // App Review comenta. O plugin resolve a localização do lado nativo e entrega
  // as coordenadas já feitas ao JS, por isso a webview nunca chega a pedir
  // nada: fica uma caixa só, com o texto do `ios-info.json`.
  //
  // O `navigator` continua a ser o caminho da web, e também é a rede de
  // segurança de um build nativo onde o plugin não esteja — melhor duas caixas
  // do que nenhuma localização.
  async function ondeEstou() {
    const opcoes = { timeout: 6000, maximumAge: 300000 };
    const G = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation;
    if (CONFIG.NATIVO && G) {
      try {
        const p = await G.getCurrentPosition(opcoes);
        return { lat: p.coords.latitude, lng: p.coords.longitude };
      } catch (e) {
        // Recusar a permissão é uma resposta, não uma avaria. O "Pergunta-me"
        // funciona à mesma sem localização — só não pode dizer "perto".
        return null;
      }
    }
    if (!navigator.geolocation) return null;
    return new Promise((res) => navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null), opcoes));
  }

  async function submitSmartSuggest(query) {
    aiLoading("A pensar na melhor escolha\u2026");
    const near = await ondeEstou();
    // Name the area we're in so discovery searches are anchored to the right place.
    let area = "";
    if (near && typeof Geocode !== "undefined" && Geocode.reverse) {
      try { const a = await Geocode.reverse(near.lat, near.lng); if (a && a.label) area = a.label; } catch (e) { /* optional */ }
    }
    if (!area) { const n = aiNear(); area = [n.town, n.region].filter(Boolean).join(", "); }
    try {
      const r = await AIModule.smartSuggest({
        query,
        catalog: aiCatalog(near),
        profile: aiProfile(),
        taste: UserData.getTasteProfile() || undefined,
        near: !!near,
        maxKm: NEAR_MAX_KM,
        area
      });
      if (!r) { aiError("N\u00e3o consegui agora."); return; }
      renderSmartResult(r, near, { query, area });
    } catch (e) { aiError(e.message); }
  }
  function renderSmartResult(r, near, ctx) {
    const pick = r.restaurantId && restById(r.restaurantId);
    const alts = (r.alternatives || [])
      .map((a) => ({ rest: restById(a.restaurantId), reason: a.reason }))
      .filter((a) => a.rest && (!pick || a.rest.id !== pick.id))
      .slice(0, 3);
    const f = r.filters || {};
    const hasFilters = (f.categories && f.categories.length) || (f.regions && f.regions.length) ||
      (f.price && f.price.length) || (typeof f.text === "string" && f.text);
    // Real distance, so "perto" is never a claim we can't back up.
    const distOf = (rest) => (near && typeof rest.lat === "number" && typeof rest.lng === "number")
      ? distKm(near, { lat: rest.lat, lng: rest.lng }) : null;
    const distLabel = (d) => (d == null ? "" : (d < 1 ? "a menos de 1 km" : `a ${Math.round(d)} km`));
    const pickDist = pick ? distOf(pick) : null;
    const pickHtml = pick ? `
      <div class="ai-pick" data-ai-open="${esc(pick.id)}">
        <span class="ai-pick-cat" style="background:var(${catFor(pick).varName})"></span>
        <div class="ai-pick-main">
          <div class="ai-pick-name">${esc(pick.name)}</div>
          <div class="ai-pick-loc">${esc(pick.town)} \u00b7 ${esc(pick.region)}${pickDist != null ? ` \u00b7 ${esc(distLabel(pickDist))}` : ""}</div>
          <div class="ai-pick-reason">${esc(r.reason || "")}</div>
        </div>
        ${icon("chevron-right")}
      </div>` : "";
    // Discovery is a first-class result: always offered, and it leads when the
    // list has nothing that genuinely fits (e.g. nothing actually nearby).
    let queries = Array.isArray(r.discoverQueries) ? r.discoverQueries.filter((q) => q && q.query) : [];
    if (!queries.length && ctx && (ctx.query || ctx.area)) {
      const q = [ctx.query, ctx.area].filter(Boolean).join(" ");
      queries = [{ label: "Sítios novos", query: q || "restaurantes" }];
    }
    document.getElementById("ai-body").innerHTML = `
      ${r.reply ? `<p class="ai-reply">${esc(r.reply)}</p>` : ""}
      ${queries.length ? `<div class="taste-discover" data-ai-discover></div>` : ""}
      ${pick ? `<div class="ai-alts-title">Da tua lista</div>` : ""}
      ${pickHtml}
      ${alts.length ? `<div class="ai-alts-title">Também podes gostar</div>
        <div class="ai-alts">${alts.map((a) => {
          const d = distOf(a.rest);
          return `<button class="ai-alt" data-ai-open="${esc(a.rest.id)}">
            <span class="ai-alt-name">${esc(a.rest.name)}${d != null ? ` <span class="ai-alt-dist">${esc(distLabel(d))}</span>` : ""}</span>
            <span class="ai-alt-reason">${esc(a.reason || "")}</span>
          </button>`;
        }).join("")}</div>` : ""}
      <div class="ai-actions-row">
        ${hasFilters ? `<button class="btn btn-ghost btn-sm" data-ai-filter>${icon("search")} Filtrar a lista</button>` : ""}
        <button class="btn btn-ghost btn-sm" data-ai-again>${icon("sparkles")} Nova pergunta</button>
      </div>`;
    document.querySelectorAll("#ai-body [data-ai-open]").forEach((el) =>
      el.addEventListener("click", () => { const rest = restById(el.dataset.aiOpen); if (rest) { hideAi(); onSelect(rest); } }));
    const fb = document.querySelector("#ai-body [data-ai-filter]");
    if (fb) fb.addEventListener("click", () => { applyNlFilters(r.filters); hideAi(); });
    const ag = document.querySelector("#ai-body [data-ai-again]");
    if (ag) ag.addEventListener("click", () => renderAiComposer());
    const disc = document.querySelector("#ai-body [data-ai-discover]");
    if (disc) renderDiscoveries(disc, queries, near, ctx);
  }

  // ---------- Taste profile ----------
  // The dominant town/region across my rated/visited places — the location
  // anchor the model uses to build competent Google Maps searches.
  function aiNear() {
    const townCount = {}, regionCount = {};
    state.restaurants.forEach((r) => {
      const rt = UserData.getRating(r.id);
      if ((rt && rt.stars) || UserData.isVisited(r.id)) {
        if (r.town) townCount[r.town] = (townCount[r.town] || 0) + 1;
        if (r.region) regionCount[r.region] = (regionCount[r.region] || 0) + 1;
      }
    });
    const top = (o) => Object.keys(o).sort((a, b) => o[b] - o[a])[0] || "";
    return { town: top(townCount), region: top(regionCount) };
  }

  async function runTasteProfile() {
    if (!UserData.isCloud()) { showSigninModal(); return; }
    openAi();
    aiLoading("A construir o teu perfil de gosto…");
    try {
      const p = await AIModule.tasteProfile({
        catalog: aiCatalog(),
        profile: aiProfile(),
        near: aiNear()
      });
      if (!p || !p.summary) { aiError("Ainda não há registos suficientes. Avalia alguns restaurantes primeiro."); return; }
      p.updatedAt = new Date().toISOString();
      UserData.setTasteProfile(p); // persists + feeds "Sugere-me"
      renderTaste(p);
    } catch (e) {
      aiError(e.message);
    }
  }

  function renderTaste(p) {
    const chips = (arr) => (arr || []).map((x) => `<span class="taste-chip">${esc(x)}</span>`).join("");
    // O material de que o perfil foi escrito, à vista: dá-lhe proveniência em
    // vez de parecer adivinhação.
    const mems = gatherMemories();
    const nCriticas = mems.filter((m) => m.stars || m.note).length;
    const nPratos = mems.reduce((n, m) => n + (m.dishes || []).length, 0);
    const nCozinhas = new Set(mems.map((m) => cuisineOf(m.r))).size;
    document.getElementById("ai-body").innerHTML = `
      <div class="taste">
        <p class="taste-summary">${esc(p.summary || "")}</p>
        <div class="taste-tiles">
          <div class="taste-tile"><span class="taste-tile-v">${nCriticas}</span><span class="taste-tile-l">Críticas</span></div>
          <div class="taste-tile"><span class="taste-tile-v">${nPratos}</span><span class="taste-tile-l">Pratos</span></div>
          <div class="taste-tile"><span class="taste-tile-v">${nCozinhas}</span><span class="taste-tile-l">Cozinhas</span></div>
        </div>
        ${p.cuisines && p.cuisines.length ? `<div class="taste-row"><span class="taste-label">Cozinhas</span><div class="taste-chips">${chips(p.cuisines)}</div></div>` : ""}
        ${p.dishes && p.dishes.length ? `<div class="taste-row"><span class="taste-label">Pratos</span><div class="taste-chips">${chips(p.dishes)}</div></div>` : ""}
        ${p.vibe ? `<div class="taste-row"><span class="taste-label">Ambiente</span><span class="taste-val">${esc(p.vibe)}</span></div>` : ""}
        ${p.price ? `<div class="taste-row"><span class="taste-label">Preço</span><span class="taste-val">${esc(p.price)}</span></div>` : ""}
        ${p.avoids ? `<div class="taste-row"><span class="taste-label">Não procuras</span><span class="taste-val">${esc(p.avoids)}</span></div>` : ""}

        <div class="taste-note-block">
          <span class="taste-label">O que eu não consigo adivinhar</span>
          <p class="taste-note-hint">Alergias, o que não comes, o que te faz gostar de um sítio. As avaliações dizem onde foste — isto diz o resto.</p>
          <textarea class="taste-note" data-taste-note rows="3" maxlength="600"
            placeholder="Não como picante. Prefiro peixe a carne. Detesto sítios barulhentos."></textarea>
          <p class="taste-note-status" data-taste-note-status aria-live="polite"></p>
        </div>

        ${(p.mapsQueries && p.mapsQueries.length) ? `<div class="taste-discover" data-taste-discover></div>` : ""}
        <button class="btn btn-primary btn-block taste-suggest" data-taste-suggest>${icon("sparkles")} Pede-me uma sugestão</button>
        <button class="linklike taste-update" data-taste-update>Atualizar perfil de gosto</button>
        <p class="taste-source">Escrito a partir das tuas ${nCriticas} crítica${nCriticas === 1 ? "" : "s"} e ${nPratos} prato${nPratos === 1 ? "" : "s"}.</p>
      </div>`;
    wireTasteNote();
    const sg = document.querySelector("#ai-body [data-taste-suggest]");
    if (sg) sg.addEventListener("click", () => { hideAi(); runSmartSuggest(); });
    const up = document.querySelector("#ai-body [data-taste-update]");
    if (up) up.addEventListener("click", runTasteProfile);
    const disc = document.querySelector("#ai-body [data-taste-discover]");
    if (disc && p.mapsQueries && p.mapsQueries.length) renderDiscoveries(disc, p.mapsQueries, null);
  }

  // O campo de texto livre. Guarda ao sair do campo, não a cada tecla: escrever
  // não é motivo para uma escrita na base de dados por letra.
  //
  // Quando o texto muda, apaga-se a marca do dia da última geração — assim o
  // perfil é reescrito na próxima oportunidade, em vez de a nota ficar guardada
  // a não fazer diferença nenhuma até ao dia seguinte.
  function wireTasteNote() {
    const ta = document.querySelector("#ai-body [data-taste-note]");
    const st = document.querySelector("#ai-body [data-taste-note-status]");
    if (!ta) return;
    ta.value = UserData.getTasteNote() || "";
    ta.addEventListener("change", () => {
      const mudou = UserData.setTasteNote(ta.value);
      if (!mudou) return;
      if (st) st.textContent = "Guardado. Entra no perfil quando o atualizares.";
    });
  }

  // ---------- Apagar conta (App Store 5.1.1v) ----------
  // Escrever "APAGAR" não é cerimónia: é a diferença entre um toque distraído
  // num botão vermelho e uma decisão. O botão só fica ativo com a palavra certa.
  function abrirApagarConta() {
    const sheet = document.getElementById("apagar-sheet");
    const input = document.getElementById("apagar-input");
    const botao = document.getElementById("apagar-confirmar");
    const status = document.querySelector("[data-apagar-status]");
    if (!sheet || !input || !botao) return;
    input.value = "";
    botao.disabled = true;
    if (status) status.textContent = "";
    sheet.classList.remove("hidden");
    sheet.setAttribute("aria-hidden", "false");
    input.addEventListener("input", () => {
      botao.disabled = input.value.trim().toUpperCase() !== "APAGAR";
    });
  }

  function fecharApagarConta() {
    const sheet = document.getElementById("apagar-sheet");
    if (!sheet) return;
    sheet.classList.add("hidden");
    sheet.setAttribute("aria-hidden", "true");
  }

  async function confirmarApagarConta() {
    const botao = document.getElementById("apagar-confirmar");
    const status = document.querySelector("[data-apagar-status]");
    if (!botao || botao.disabled) return;
    botao.disabled = true;
    if (status) status.textContent = "A apagar…";
    try {
      await AuthModule.deleteAccount();
      // A sessão já caiu do lado do servidor. Recarregar é a forma mais honesta
      // de não deixar em memória o estado de uma conta que já não existe.
      window.location.reload();
    } catch (e) {
      botao.disabled = false;
      if (status) status.textContent = e && e.message ? e.message : "Não foi possível apagar a conta agora.";
    }
  }

  // Open the saved taste profile (from the profile modal). Generates it if none.
  function showTasteProfile() {
    if (!UserData.isCloud()) { showSigninModal(); return; }
    const p = UserData.getTasteProfile();
    if (p && p.summary) { openAi(); renderTaste(p); }
    else runTasteProfile();
  }

  // Generate the taste profile silently, once per day, on first login — so it's
  // already there to power suggestions without the user asking.
  async function maybeAutoTasteProfile() {
    if (!UserData.isCloud() || !AIModule.available()) return;
    const today = new Date().toISOString().slice(0, 10);
    if (UserData.getTasteGenDay() === today) return;
    let n = 0;
    for (const r of state.restaurants) {
      const rt = UserData.getRating(r.id);
      if ((rt && (rt.stars || rt.note)) || UserData.isVisited(r.id)) n++;
      if (n >= 3) break;
    }
    if (n < 3) return; // not enough signal yet
    try {
      const p = await AIModule.tasteProfile({ catalog: aiCatalog(), profile: aiProfile(), near: aiNear() });
      if (p && p.summary) {
        p.updatedAt = new Date().toISOString();
        UserData.setTasteProfile(p);
        UserData.markTasteGen(today);
      }
    } catch (e) { /* silent — retry next session */ }
  }

  // Apply structured filters (from the chatbot) to the list UI.
  function applyNlFilters(f) {
    if (!f) return;
    if (Array.isArray(f.categories) && f.categories.length) {
      document.querySelectorAll("#category-filters .chip").forEach((c) =>
        c.setAttribute("aria-pressed", String(f.categories.includes(c.dataset.category)))
      );
    }
    if (Array.isArray(f.regions) && f.regions.length) {
      document.querySelectorAll("#region-filters .chip").forEach((c) =>
        c.setAttribute("aria-pressed", String(f.regions.includes(c.dataset.region)))
      );
    }
    if (Array.isArray(f.price) && f.price.length) {
      document.querySelectorAll("#price-filters input").forEach((i) =>
        (i.checked = f.price.includes(parseInt(i.dataset.price, 10)))
      );
    }
    if (typeof f.text === "string") document.getElementById("search-input").value = f.text;
    render();
  }

  // ---------- Discover NEW places from Google Maps (taste-driven) ----------
  // The AI proposes search queries (taste profile + "Pergunta-me"); we run them
  // through Google Places text search, drop anything already on the user's list,
  // and let them add the rest to their wishlist with one tap.
  function normName(s) {
    return String(s || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
  function slug(s) {
    return String(s || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }
  // Best-effort town from a Google formatted address ("Rua X, 1234-567 Évora, Portugal").
  function townFromAddress(addr) {
    const parts = String(addr || "").split(",").map((p) => p.trim())
      .filter((p) => p && !/portugal/i.test(p));
    if (!parts.length) return "";
    const last = parts[parts.length - 1].replace(/\d{4}-\d{3}/g, "").replace(/\d+/g, "").trim();
    return last || parts[parts.length - 1];
  }

  // Google formatted addresses end with the country ("…, Évora, Portugal").
  function countryFromAddress(addr) {
    const parts = String(addr || "").split(",").map((x) => x.trim()).filter(Boolean);
    const raw = parts.length ? parts[parts.length - 1] : "Portugal";
    return (typeof Geocode !== "undefined" && Geocode.canonicalCountry) ? Geocode.canonicalCountry(raw) : raw;
  }

  // Run the queries, dedupe against the catalog + each other. Resolves to [].
  async function placesDiscover(queries, near) {
    if (!Array.isArray(queries) || !queries.length) return [];
    if (typeof PlacesModule === "undefined" || !PlacesModule.isAvailable()) return [];
    const loc = near && typeof near.lat === "number" ? { lat: near.lat, lng: near.lng } : null;
    const lists = await Promise.all(
      queries.slice(0, 4).map((q) =>
        PlacesModule.textSearch(q.query, { location: loc, limit: 6 }).catch(() => []))
    );
    const known = new Set(state.restaurants.map((r) => normName(r.name)));
    const seen = new Set();
    const out = [];
    for (const list of lists) {
      for (const p of list) {
        const key = p.placeId || normName(p.name);
        if (seen.has(key)) continue;
        seen.add(key);
        if (known.has(normName(p.name))) continue; // already in the app
        if (loc && typeof p.lat === "number") p.distKm = distKm(loc, { lat: p.lat, lng: p.lng });
        out.push(p);
      }
    }
    // Distance is only a tie-breaker for display order — WHICH places make the
    // cut is the ranking model's call, so hand it the whole pool.
    if (loc) out.sort((a, b) => (a.distKm == null ? 1e9 : a.distKm) - (b.distKm == null ? 1e9 : b.distKm));
    return out.slice(0, 18);
  }

  function discoverCardHtml(p, i, reason) {
    const meta = [];
    if (p.rating) meta.push(`${icon("star")} ${p.rating.toFixed(1)} (${p.userRatingsTotal})`);
    if (p.priceLevel) meta.push(p.priceLevel);
    if (typeof p.distKm === "number") meta.push(p.distKm < 1 ? "&lt; 1 km" : `${Math.round(p.distKm)} km`);
    const loc = townFromAddress(p.address);
    return `<div class="ai-discover-item" data-discover-item="${i}">
      <div class="ai-discover-row">
        <button type="button" class="ai-discover-main" data-discover-preview="${i}">
          <div class="ai-discover-name">${esc(p.name)} ${icon("chevron-down")}</div>
          ${loc ? `<div class="ai-discover-loc">${esc(loc)}</div>` : ""}
          ${meta.length ? `<div class="ai-discover-meta">${meta.join(" · ")}</div>` : ""}
          ${reason ? `<div class="ai-discover-reason">${esc(reason)}</div>` : ""}
        </button>
        <button class="btn btn-ghost btn-sm ai-discover-add" data-discover-add="${i}">${icon("plus")} Adicionar</button>
      </div>
      <div class="discover-preview" data-discover-host="${i}" hidden></div>
    </div>`;
  }

  // Peek before you add: expand the card in place (the chat stays open) with the
  // place's photo, rating, hours and address from Google, via its placeId.
  async function toggleDiscoverPreview(root, items, i, btn) {
    const host = root.querySelector(`[data-discover-host="${i}"]`);
    const item = root.querySelector(`[data-discover-item="${i}"]`);
    if (!host || !item) return;
    const wasOpen = !host.hidden;
    // one open at a time
    root.querySelectorAll(".discover-preview").forEach((h) => { h.hidden = true; });
    root.querySelectorAll(".ai-discover-item.open").forEach((x) => x.classList.remove("open"));
    if (wasOpen) return;
    item.classList.add("open");
    host.hidden = false;
    host.innerHTML = `<div class="ai-loading"><span class="ai-spinner"></span> A espreitar\u2026</div>`;
    const p = items[i] && items[i].p;
    let d = null;
    try { d = p && p.placeId ? await PlacesModule.detailsByPlaceId(p.placeId) : null; } catch (e) { d = null; }
    if (host.hidden) return; // closed meanwhile
    const bits = [];
    if (d && typeof d.rating === "number") bits.push(`${icon("star")} ${d.rating.toFixed(1)} (${d.userRatingsTotal || 0})`);
    if (d && d.priceLevel) bits.push(esc(d.priceLevel));
    if (p && typeof p.distKm === "number") bits.push(p.distKm < 1 ? "&lt; 1 km" : `${Math.round(p.distKm)} km`);
    if (d && typeof d.openNow === "boolean") bits.push(`<span class="open-now ${d.openNow ? "open" : "closed"}">${d.openNow ? "Aberto agora" : "Fechado agora"}</span>`);
    const todayIdx = (new Date().getDay() + 6) % 7; // Google weekday_text starts Monday
    const today = d && d.weekdayText && d.weekdayText[todayIdx] ? d.weekdayText[todayIdx] : "";
    host.innerHTML = `
      ${d && d.photos && d.photos[0] ? `<div class="discover-photo"><div class="ph" data-label="foto"></div></div>` : ""}
      ${bits.length ? `<div class="ai-discover-meta">${bits.join(" · ")}</div>` : ""}
      ${d && d.address ? `<div class="discover-addr">${icon("pin")} ${esc(d.address)}</div>` : ""}
      ${today ? `<div class="discover-hours">${icon("clock")} ${esc(today)}</div>` : ""}
      ${!d ? `<p class="muted ai-hint">Sem mais detalhes do Google para este sítio.</p>` : ""}
      <div class="discover-preview-actions">
        ${d && d.googleUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(d.googleUrl)}" target="_blank" rel="noopener">${icon("external")} Ver no Google</a>` : ""}
        <button class="btn btn-primary btn-sm" data-preview-add="${i}">${icon("plus")} Adicionar à wishlist</button>
      </div>`;
    const ph = host.querySelector(".ph");
    if (ph && d && d.photos && d.photos[0]) setThumbPhoto(ph, d.photos[0]);
    const addBtn = host.querySelector("[data-preview-add]");
    if (addBtn) addBtn.addEventListener("click", () => addDiscoveredPlace(items[i].p, btn || addBtn));
  }

  async function renderDiscoveries(host, queries, near, ctx) {
    if (!host) return;
    const heading = `<div class="taste-label">${icon("sparkles")} Sítios novos para ti</div>`;
    if (typeof PlacesModule === "undefined" || !PlacesModule.isAvailable() || !Array.isArray(queries) || !queries.length) {
      host.innerHTML = ""; return;
    }
    host.innerHTML = `${heading}<div class="ai-loading"><span class="ai-spinner"></span> A procurar sítios novos\u2026</div>`;
    let places = [];
    try { places = await placesDiscover(queries, near); } catch (e) { places = []; }
    if (!places.length) {
      host.innerHTML = `${heading}<p class="muted ai-hint">Sem sítios novos para já — já tens os bons da zona na tua lista.</p>`;
      return;
    }

    // Second pass: the taste profile decides which of these real places are worth
    // it, and why. Without it these would be raw Google results, not a suggestion.
    let ranked = null;
    if (AIModule.available() && UserData.isCloud()) {
      host.innerHTML = `${heading}<div class="ai-loading"><span class="ai-spinner"></span> A cruzar com o teu gosto\u2026</div>`;
      try {
        ranked = await AIModule.rankDiscoveries({
          query: (ctx && ctx.query) || "",
          area: (ctx && ctx.area) || "",
          taste: UserData.getTasteProfile() || undefined,
          profile: aiProfile(),
          candidates: places.map((p, i) => ({
            i, name: p.name, town: townFromAddress(p.address),
            rating: p.rating, reviews: p.userRatingsTotal,
            price: p.priceLevel || undefined,
            distKm: typeof p.distKm === "number" ? Math.round(p.distKm * 10) / 10 : undefined,
            types: (p.types || []).slice(0, 4)
          }))
        });
      } catch (e) { ranked = null; }
    }

    let items;
    if (ranked && Array.isArray(ranked.picks) && ranked.picks.length) {
      items = ranked.picks
        .map((k) => ({ p: places[k.i], reason: k.reason }))
        .filter((x) => x.p);
    } else {
      items = places.map((p) => ({ p, reason: "" })); // fall back to the raw finds
    }
    if (!items.length) {
      host.innerHTML = `${heading}<p class="muted ai-hint">Nada de novo que encaixe mesmo no teu gosto por agora.</p>`;
      return;
    }
    const intro = ranked && ranked.intro ? `<p class="ai-hint discover-intro">${esc(ranked.intro)}</p>` : "";
    host.innerHTML = `${heading}${intro}<div class="ai-discover">${
      items.map((x, i) => discoverCardHtml(x.p, i, x.reason)).join("")}</div>`;
    host.querySelectorAll("[data-discover-add]").forEach((btn) =>
      btn.addEventListener("click", () => addDiscoveredPlace(items[parseInt(btn.dataset.discoverAdd, 10)].p, btn)));
    host.querySelectorAll("[data-discover-preview]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.discoverPreview, 10);
        const addBtn = host.querySelector(`[data-discover-add="${i}"]`);
        toggleDiscoverPreview(host, items, i, addBtn);
      }));
  }

  // Add a discovered Google place to the (shared) list as a wishlist entry.
  async function addDiscoveredPlace(p, btn, opts) {
    if (!p) return;
    if (!UserData.isCloud()) { showSigninModal(); return; }
    if (btn) { btn.disabled = true; btn.innerHTML = "A adicionar…"; }
    try {
      const town = townFromAddress(p.address);
      const country = countryFromAddress(p.address);
      const foreign = typeof Geocode !== "undefined" && Geocode.isPortugal ? !Geocode.isPortugal(country) : false;
      const region = (foreign ? country : (typeof Geocode !== "undefined" && Geocode.regionForTown(town))) || "Portugal";
      const category = suggestCategory(p.types, p.priceLevelNum) || "tradicional";
      const restaurant = {
        id: `${slug(p.name)}-${slug(town)}`.replace(/-$/, "") || slug(p.name),
        name: p.name,
        town: town || "",
        region,
        category,
        lat: p.lat,
        lng: p.lng,
        notes: "",
        tags: [category],
        country,
        mapsQuery: town ? `${p.name}, ${town}, ${country}` : `${p.name}, ${country}`,
        verified: true,
        addedByUid: UserData.me().uid,
        addedByName: UserData.me().displayName
      };
      let saved = restaurant;
      if (DB.isAvailable()) {
        const token = window.FirebaseAuth ? await window.FirebaseAuth.getToken() : null;
        saved = await DB.add(restaurant, token);
      } else {
        Storage.addCustomRestaurant(restaurant);
      }
      const o = opts || {};
      onRestaurantAdded(saved, {
        priority: o.priority !== false,
        silent: o.tab ? false : true,
        tab: o.tab,
        visited: o.visited === true
      });
      // Dizia "Na tua wishlist" nos dois caminhos, incluindo no "Já fui" —
      // errado desde antes desta mudança, e agora que os dois botões estão
      // lado a lado a mentira ficava à vista.
      if (btn) {
        btn.innerHTML = `${icon("check")} ${o.visited === true ? "No teu diário" : "Na tua lista"}`;
        btn.classList.add("added");
      }
    } catch (e) {
      if (btn) { btn.disabled = false; btn.innerHTML = `${icon("plus")} Adicionar`; }
    }
  }

  // Summarize the Google reviews already on screen for a restaurant.
  async function runSummarizeReviews(r, reviews, btn) {
    const box = document.querySelector("#detail-body [data-ai-reviews]");
    if (!box) return;
    if (btn) btn.disabled = true;
    box.innerHTML = `<div class="ai-loading"><span class="ai-spinner"></span> A resumir avaliações…</div>`;
    try {
      const s = await AIModule.summarizeReviews({
        name: r.name,
        reviews: reviews.slice(0, 8).map((rv) => ({ stars: rv.rating, text: rv.text })).filter((rv) => rv.text)
      });
      const list = (arr) => (arr || []).map((x) => `<li>${esc(x)}</li>`).join("");
      box.innerHTML = `
        <div class="ai-summary">
          <p class="ai-summary-text">${esc(s.summary || "")}</p>
          <div class="ai-pc">
            ${s.pros && s.pros.length ? `<div class="ai-pros"><span class="ai-pc-title">Prós</span><ul>${list(s.pros)}</ul></div>` : ""}
            ${s.cons && s.cons.length ? `<div class="ai-cons"><span class="ai-pc-title">Contras</span><ul>${list(s.cons)}</ul></div>` : ""}
          </div>
          ${s.orderTips && s.orderTips.length ? `<div class="ai-tips"><span class="ai-pc-title">${icon("sparkles")} O que pedir</span><ul>${list(s.orderTips)}</ul></div>` : ""}
          <p class="attribution">Resumo gerado por IA a partir das avaliações do Google</p>
        </div>`;
    } catch (e) {
      box.innerHTML = `<div class="ai-error">${icon("info")} ${esc(e.message)}</div>`;
      if (btn) btn.disabled = false;
    }
  }

  // Draft a personal review from my stars + dishes + a few notes.
  async function runDraftReview(r, noteEl, btn) {
    if (!noteEl) return;
    const rt = UserData.getRating(r.id) || {};
    if (btn) { btn.disabled = true; btn.classList.add("busy"); }
    try {
      const out = await AIModule.draftReview({
        name: r.name,
        stars: rt.stars || "",
        dishes: rt.dishes || [],
        bullets: noteEl.value.trim()
      });
      if (out && out.text) {
        noteEl.value = out.text;
        noteEl.dispatchEvent(new Event("input", { bubbles: true })); // trigger autosave
        noteEl.focus();
      }
    } catch (e) {
      noteEl.placeholder = e.message;
    }
    if (btn) { btn.disabled = false; btn.classList.remove("busy"); }
  }

  // ---------- Trip planner ----------
  function wirePlanner() {
    const radius = document.getElementById("planner-radius");
    radius.addEventListener("input", () => (document.getElementById("planner-radius-value").textContent = radius.value));

    document.getElementById("planner-find-btn").addEventListener("click", async () => {
      const from = document.getElementById("planner-from").value.trim();
      const to = document.getElementById("planner-to").value.trim();
      const status = document.getElementById("planner-status");
      const results = document.getElementById("planner-results");
      results.innerHTML = "";
      if (!from || !to) { status.textContent = "Escreve o ponto de partida e o destino."; return; }
      if (!PlannerModule.isAvailable()) { status.textContent = "O planeador não está disponível de momento."; return; }
      status.textContent = "A calcular rota…";
      try {
        const { stops } = await PlannerModule.findStops({ from, to, radiusKm: parseInt(radius.value, 10), restaurants: state.restaurants });
        if (!stops.length) { status.textContent = "Nenhum restaurante perto desta rota."; return; }
        status.textContent = `${stops.length} ${stops.length === 1 ? "opção" : "opções"} de percurso com paragem:`;
        async function selectStop(li, restaurant) {
          status.textContent = `A calcular percurso por ${restaurant.name}...`;
          results.querySelectorAll("li").forEach((item) => item.classList.toggle("selected", item === li));
          try {
            const summary = await PlannerModule.drawStopRoute(restaurant);
            const routeEl = li.querySelector("[data-route-summary]");
            if (routeEl) routeEl.textContent = [summary.distanceText, summary.durationText].filter(Boolean).join(" · ");
            MapModule.highlightMarker(restaurant.id);
            status.textContent = `Percurso por ${restaurant.name}.`;
          } catch (err) {
            status.textContent = err.message;
          }
        }
        stops.forEach(({ restaurant, distanceKm }, idx) => {
          const li = document.createElement("li");
          li.tabIndex = 0;
          li.dataset.id = restaurant.id;
          li.dataset.cat = restaurant.category;
          li.className = "stop";
          li.setAttribute("role", "button");
          li.innerHTML = `
            <div class="rcard-thumb" style="width:56px;height:56px"><div class="ph" data-label="foto"></div></div>
            <div class="stop-body">
              <span class="stop-num">PARAGEM ${idx + 1}</span>
              <span class="rcard-name" style="font-size:var(--fs-base)">${esc(restaurant.name)}</span>
              <span class="rcard-loc">${icon("pin")} ${esc(restaurant.town)} · ${distanceKm.toFixed(1)} km da rota</span>
              <span class="ai-note" data-ai-note hidden></span>
              <span class="route-summary" data-route-summary>Ver percurso com esta paragem</span>
            </div>`;
          li.addEventListener("click", () => selectStop(li, restaurant));
          li.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              selectStop(li, restaurant);
            }
          });
          fillThumbPhoto(li.querySelector(".ph"), restaurant);
          results.appendChild(li);
        });
        selectStop(results.querySelector("li"), stops[0].restaurant);
        annotateStops(stops);
        // Com a rota desenhada, o mapa é que interessa ver.
        if (state.mapMode === "lista") results.scrollIntoView({ behavior: "smooth", block: "nearest" });
        else setMapMode("mapa");
      } catch (err) { status.textContent = err.message; }
    });

    document.getElementById("planner-clear-btn").addEventListener("click", () => {
      PlannerModule.clear();
      document.getElementById("planner-status").textContent = "";
      document.getElementById("planner-results").innerHTML = "";
    });
  }

  // Enrich the planner stops with a short personalized note from the AI.
  async function annotateStops(stops) {
    if (!AIModule.available() || !UserData.isCloud()) return;
    try {
      const payload = stops.map(({ restaurant: r, distanceKm }) => {
        const rt = UserData.getRating(r.id) || {};
        return {
          id: r.id, name: r.name, town: r.town, region: r.region,
          cat: r.category, specialty: r.notes || "", distanceKm: Math.round(distanceKm * 10) / 10,
          myStars: rt.stars || 0
        };
      });
      const out = await AIModule.planner({ profile: aiProfile(), stops: payload });
      (out && out.ordered || []).forEach(({ id, note }) => {
        const span = document.querySelector(`#planner-results li[data-id="${CSS.escape(id)}"] [data-ai-note]`);
        if (span && note) { span.textContent = note; span.hidden = false; }
      });
    } catch (e) { /* notes are a bonus */ }
  }

  // ---------- App-level screens (bottom tab bar + global views) ----------
  const SCREENS = ["mapa", "diario", "amigos", "perfil"];
  // Hashes antigos ainda vivem em favoritos e no histórico da PWA instalada.
  // Sem esta tradução, quem tivesse a app aberta num deles era despejado para o
  // mapa ao recarregar.
  const SCREEN_ALIASES = { memorias: "diario", criticas: "diario" };

  function screenFromHash() {
    const h = (location.hash || "").replace("#", "");
    if (SCREEN_ALIASES[h]) return SCREEN_ALIASES[h];
    return SCREENS.includes(h) ? h : "mapa";
  }

  function showScreen(name) {
    if (!SCREENS.includes(name)) name = "mapa";
    state.currentScreen = name;
    document.querySelectorAll(".screen-data").forEach((s) => {
      s.hidden = s.dataset.screen !== name;
    });
    document.querySelectorAll("#tabbar .tab").forEach((t) => {
      const on = t.dataset.tabNav === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
    });
    if (name === "diario") renderDiario();
    else if (name === "amigos") renderAmigosScreen();
    else if (name === "perfil") renderPerfil();
  }

  // ---------- Groups (Amigos screen) ----------
  // The bar above the Amigos sub-tabs: pick the active group (or "Todos"),
  // create a new one, or join with a code. The social views (feed, leaderboard,
  // badges) are scoped to whatever is active here, via UserData's group filter.
  function renderGroupBar() {
    const el = document.getElementById("perfil-groupbar");
    if (!el) return;
    if (!UserData.isCloud()) { el.innerHTML = ""; return; }
    const groups = UserData.getGroups();
    const activeId = UserData.getActiveGroupId();
    const active = groups.find((g) => g.id === activeId) || null;
    const options = [`<option value=""${activeId ? "" : " selected"}>Todos (global)</option>`]
      .concat(groups.map((g) => `<option value="${esc(g.id)}"${g.id === activeId ? " selected" : ""}>${esc(g.name)}</option>`))
      .join("");
    const sharing = UserData.getSharing();
    el.innerHTML = `
      <div class="groupbar-row">
        <span class="groupbar-label">${icon("users")} Grupo</span>
        <select class="groupbar-select" data-group-select aria-label="Grupo ativo">${options}</select>
      </div>
      <div class="groupbar-actions">
        <button class="btn btn-ghost btn-sm" data-group-create>${icon("plus")} Criar grupo</button>
        <button class="btn btn-ghost btn-sm" data-group-join>Entrar com código</button>
      </div>
      ${active
        ? `<div class="groupbar-code">Convida amigos com o código <strong data-group-code>${esc(active.code)}</strong> <button class="linklike" data-copy-code>copiar</button> · <button class="linklike" data-leave-group="${esc(active.id)}">sair do grupo</button></div>`
        : `<div class="groupbar-hint muted">A ver toda a gente. Cria um grupo ou entra com um código para filtrares por amigos.</div>`}
      <div class="groupbar-share">
        <span class="groupbar-label">${icon("sliders")} Quem vê a minha atividade</span>
        <label class="switch-chip"><input type="checkbox" data-share-global ${sharing.global ? "checked" : ""}> <span>Toda a gente</span></label>
        ${!sharing.global ? `<div class="share-groups">${
          groups.length
            ? groups.map((g) => `<label class="switch-chip"><input type="checkbox" data-share-group="${esc(g.id)}" ${sharing.groupIds.includes(g.id) ? "checked" : ""}> <span>${esc(g.name)}</span></label>`).join("")
            : `<span class="muted">Sem grupos — a tua atividade fica privada.</span>`
        }</div>` : ""}
      </div>`;
    el.querySelector("[data-group-select]").addEventListener("change", (e) => UserData.setActiveGroup(e.target.value || null));
    el.querySelector("[data-group-create]").addEventListener("click", () => openGroupModal("create"));
    el.querySelector("[data-group-join]").addEventListener("click", () => openGroupModal("join"));
    const copy = el.querySelector("[data-copy-code]");
    if (copy && active) copy.addEventListener("click", () => {
      if (navigator.clipboard) navigator.clipboard.writeText(active.code).catch(() => {});
      copy.textContent = "copiado ✓";
    });
    const leave = el.querySelector("[data-leave-group]");
    if (leave) leave.addEventListener("click", () => {
      if (!confirm(`Sair de "${active.name}"? Deixas de ver a atividade do grupo.`)) return;
      UserData.leaveGroup(leave.dataset.leaveGroup).catch((e) => alert(e.message || "Não consegui sair."));
    });
    const globalToggle = el.querySelector("[data-share-global]");
    if (globalToggle) globalToggle.addEventListener("change", () => {
      if (globalToggle.checked) UserData.setSharing({ global: true });
      else UserData.setSharing({ global: false, groupIds: sharing.groupIds.length ? sharing.groupIds : groups.map((g) => g.id) });
    });
    el.querySelectorAll("[data-share-group]").forEach((cb) => cb.addEventListener("change", () => {
      const ids = [...el.querySelectorAll("[data-share-group]")].filter((x) => x.checked).map((x) => x.dataset.shareGroup);
      UserData.setSharing({ global: false, groupIds: ids });
    }));
  }

  let groupModalMode = "create";
  function openGroupModal(mode) {
    groupModalMode = mode;
    const title = document.querySelector("[data-group-title]");
    const intro = document.querySelector("[data-group-intro]");
    const input = document.getElementById("group-input");
    const confirm = document.querySelector("[data-group-confirm]");
    document.querySelector("[data-group-status]").textContent = "";
    if (mode === "create") {
      title.textContent = "Criar grupo";
      intro.textContent = "Dá-lhe um nome. Recebes um código para convidar amigos.";
      input.placeholder = "Nome do grupo (ex: Roadtrip Alentejo)";
      input.value = "";
      confirm.textContent = "Criar grupo";
    } else {
      title.textContent = "Entrar num grupo";
      intro.textContent = "Introduz o código que um amigo te deu.";
      input.placeholder = "Código (ex: ABC123)";
      input.value = "";
      confirm.textContent = "Entrar";
    }
    document.getElementById("group-modal").classList.remove("hidden");
    input.focus();
  }
  function hideGroupModal() { document.getElementById("group-modal").classList.add("hidden"); }
  function groupModalOpen() { return !document.getElementById("group-modal").classList.contains("hidden"); }

  async function confirmGroup() {
    const input = document.getElementById("group-input");
    const status = document.querySelector("[data-group-status]");
    const confirm = document.querySelector("[data-group-confirm]");
    const val = input.value.trim();
    if (!val) { status.textContent = "Preenche o campo."; return; }
    confirm.disabled = true;
    status.textContent = "A processar…";
    try {
      if (groupModalMode === "create") {
        const g = await UserData.createGroup(val);
        status.textContent = `Grupo criado. Código para convidar: ${g.code}`;
        setTimeout(hideGroupModal, 1400);
      } else {
        const g = await UserData.joinGroup(val);
        status.textContent = `Entraste em "${g.name}".`;
        setTimeout(hideGroupModal, 900);
      }
      renderAmigosScreen();
    } catch (e) {
      status.textContent = e.message || "Não foi possível concluir.";
    }
    confirm.disabled = false;
  }

  // Amigos screen: switch between the activity feed and the leaderboard subtab.
  function renderAmigosScreen() {
    // A barra de grupo mudou-se para o Perfil: era configuração permanente à
    // frente do conteúdo. O feed começa agora nos convites, que são acionáveis.
    document.querySelectorAll("#amigos-tabs .chip-tab").forEach((b) => {
      const on = b.dataset.atab === state.amigosTab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    const feed = document.getElementById("amigos-feed");
    const lb = document.getElementById("amigos-leaderboard");
    const filter = document.getElementById("amigos-filter");
    const invitesEl = document.getElementById("amigos-invites");
    const onLeaderboard = state.amigosTab === "leaderboard";
    if (feed) feed.hidden = onLeaderboard;
    if (lb) lb.hidden = !onLeaderboard;
    if (filter) filter.hidden = onLeaderboard; // filter only applies to the feed
    if (invitesEl) {
      if (onLeaderboard) invitesEl.hidden = true;
      else {
        renderInvites(invitesEl); // paint what we have, then refresh
        loadPendingInvites().then(() => {
          if (state.currentScreen === "amigos" && state.amigosTab !== "leaderboard") {
            renderInvites(document.getElementById("amigos-invites"));
          }
        });
      }
    }
    if (onLeaderboard) renderAmigosLeaderboard();
    else renderAmigosFeed();
  }

  // Críticas screen: switch between "my critiques" and the restaurant leaderboard.
  // Diário: três vistas do mesmo material. Memórias e Críticas liam ambas o
  // UserData.getRating — eram a mesma entidade em dois separadores.
  function renderDiario() {
    const view = state.diarioView;
    document.querySelectorAll("#diario-seg .chip-tab").forEach((b) => {
      const on = b.dataset.dview === view;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    const panes = { restaurantes: "memorias-list", criticas: "criticas-list", pratos: "pratos-list" };
    Object.entries(panes).forEach(([k, id]) => {
      const el = document.getElementById(id);
      if (el) el.hidden = k !== view;
    });
    const sort = document.getElementById("criticas-sort");
    if (sort) sort.hidden = view !== "criticas"; // ordenar só faz sentido nas críticas
    if (view === "restaurantes") renderMemorias();
    else if (view === "criticas") renderCriticas();
    else renderPratos();
  }

  function navTo(name) {
    if (location.hash !== "#" + name) location.hash = name;
    else showScreen(name);
  }
  function onHashChange() { showScreen(screenFromHash()); }
  // Re-render whichever data screen is currently open (e.g. after sign-in).
  function refreshActiveDataScreen() {
    if (state.currentScreen && state.currentScreen !== "mapa") showScreen(state.currentScreen);
  }

  function signinInvite(msg) {
    return `<div class="signin-invite">${icon("log-in")} <span>${esc(msg)}</span></div>`;
  }
  function starsDisplay(n) {
    return `<span class="stars-display">${[1, 2, 3, 4, 5]
      .map((i) => `<svg class="icon${i <= n ? "" : " empty"}"><use href="#i-star"/></svg>`)
      .join("")}</span>`;
  }
  // Read-only chips for a list of dishes.
  function dishChips(list) {
    const items = (list || []).map((d) => String(d).trim()).filter(Boolean);
    if (!items.length) return "";
    return `<div class="dish-chips">${items.map((d) => `<span class="dish-chip">${esc(d)}</span>`).join("")}</div>`;
  }
  // Open a restaurant's detail drawer focused on a specific tab.
  function openOnTab(r, tab) {
    onSelect(r);
    const body = document.getElementById("detail-body");
    if (body) switchTab(body, tab);
  }

  // ----- Memórias: every restaurant I rated / noted / visited (no network) -----
  function gatherMemories() {
    const out = [];
    for (const r of state.restaurants) {
      const rating = UserData.getRating(r.id);
      const hist = UserData.getHistory(r.id);
      const visited = UserData.isVisited(r.id);
      if (!rating && !hist.length && !visited) continue;
      const lastVisit = hist.length ? UserData.visitDate(hist[hist.length - 1]) : null;
      out.push({
        r,
        stars: rating ? rating.stars : 0,
        note: rating ? rating.note : "",
        dishes: (rating && rating.dishes) || [],
        lastVisit,
        visitCount: hist.length,
        updatedAt: (rating && rating.updatedAt) || lastVisit || ""
      });
    }
    return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  function fmtDateShort(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" }).replace(".", "");
  }
  function buildMemoryCard(m) {
    const cat = catFor(m.r);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "memory";
    card.dataset.cat = m.r.category;
    // A nota vive numa pílula sobre a foto; o corpo fica para nome e sítio, e
    // todos os cartões têm a mesma altura (grid-auto-rows).
    card.innerHTML = `
      <div class="memory-photo">
        <div class="ph" data-label="foto · Google"></div>
        ${m.stars ? `<span class="memory-score">${icon("star")}${m.stars}</span>` : ""}
      </div>
      <div class="memory-body">
        <span class="rcard-cat" style="color:var(${cat.varName}-ink)">${esc(cat.label)}</span>
        <span class="memory-name">${esc(m.r.name)}</span>
        <div class="memory-foot">
          <span class="rcard-loc">${esc(m.r.town)}</span>
          <span class="mono faint">${esc(fmtDateShort(m.lastVisit || m.updatedAt))}</span>
        </div>
      </div>`;
    card.addEventListener("click", () => openOnTab(m.r, "experiencia"));
    fillThumbPhoto(card.querySelector(".ph"), m.r);
    return card;
  }

  function renderMemorias() {
    const listEl = document.getElementById("memorias-list");
    const countEl = document.getElementById("diario-count");
    if (!listEl) return;
    if (!UserData.isCloud()) {
      listEl.innerHTML = signinInvite("Inicie sessão com a Google para guardar e rever as suas memórias.");
      if (countEl) countEl.textContent = "";
      return;
    }
    const mems = gatherMemories();
    if (countEl) {
      const criticas = mems.filter((m) => m.stars || m.note).length;
      const pratos = mems.reduce((n, m) => n + (m.dishes || []).length, 0);
      countEl.textContent = mems.length
        ? [`${mems.length} ${mems.length === 1 ? "restaurante" : "restaurantes"}`,
           `${criticas} ${criticas === 1 ? "crítica" : "críticas"}`,
           `${pratos} ${pratos === 1 ? "prato" : "pratos"}`].join(" · ")
        : "";
    }
    listEl.innerHTML = "";
    if (!mems.length) {
      listEl.innerHTML = stateHtml({
        title: "O teu diário começa na primeira refeição",
        text: "Regista onde já foste e o que comeste. Fica só para ti até decidires partilhar.",
        actions: [{ label: "Ver o mapa", action: "mapa" }]
      });
      return;
    }
    mems.forEach((m) => listEl.appendChild(buildMemoryCard(m)));
  }

  // ----- Diário · Pratos: o ativo mais invisível da app -----
  // Estão em rating.dishes desde sempre e nunca tiveram onde ser vistos.
  // Agrupados por cozinha, sem rede e sem estado novo.
  function renderPratos() {
    const el = document.getElementById("pratos-list");
    if (!el) return;
    if (!UserData.isCloud()) { el.innerHTML = signinInvite("Inicie sessão para ver os pratos que registou."); return; }

    const byCuisine = new Map();
    gatherMemories().forEach((m) => {
      (m.dishes || []).forEach((d) => {
        const key = cuisineOf(m.r);
        if (!byCuisine.has(key)) byCuisine.set(key, []);
        byCuisine.get(key).push({ dish: d, r: m.r, stars: m.stars });
      });
    });

    if (!byCuisine.size) {
      el.innerHTML = stateHtml({
        title: "Ainda não anotaste nenhum prato",
        text: "Ao registar uma visita podes dizer o que comeste — fica tudo aqui.",
        actions: [{ label: "Ver o mapa", action: "mapa" }]
      });
      return;
    }

    const groups = [...byCuisine.entries()].sort((a, b) => b[1].length - a[1].length);
    el.innerHTML = groups.map(([key, items]) => {
      const cat = CUISINES[key] || { label: key };
      return `<section class="dish-group">
        <h3 class="dish-group-title">${esc(cat.label)} <span class="dish-group-count">${items.length}</span></h3>
        ${items.map((it) => `
          <button type="button" class="dish-row" data-dish-rest="${esc(it.r.id)}">
            <span class="dish-row-name">${esc(it.dish)}</span>
            <span class="dish-row-rest">${esc(it.r.name)}</span>
            ${it.stars ? `<span class="dish-row-stars">${icon("star")}<span>${it.stars}</span></span>` : ""}
          </button>`).join("")}
      </section>`;
    }).join("");

    el.querySelectorAll("[data-dish-rest]").forEach((b) => b.addEventListener("click", () => {
      const r = state.restaurants.find((x) => x.id === b.dataset.dishRest);
      if (r) openOnTab(r, "experiencia");
    }));
  }

  // ----- Críticas: ratings (stars+note+dishes) + comments, mine or everyone's -----
  let criticasReqId = 0;
  function critiqueRow(it) {
    const r = it.r || state.restaurants.find((x) => x.id === it.restaurantId);
    const name = r ? r.name : "Restaurante";
    const when = it.when ? `<span class="critique-when muted">${esc(fmtDateTime(it.when))}</span>` : "";
    const head = `<div class="critique-head"><span class="critique-rest">${icon("pin")} ${esc(name)}</span>${when}</div>`;
    const author = it.who ? `<div class="critique-author">${avatar(it.who, it.photoURL, "avatar-xs")}<span class="critique-author-name">${esc(it.who)}</span></div>` : "";
    const tab = it.type === "comment" ? "sitio" : "experiencia";
    return `<div class="critique" data-crit-rest="${esc(it.restaurantId)}" data-crit-tab="${tab}">
      ${head}${author}
      ${it.stars ? `<div class="critique-stars">${starsDisplay(it.stars)}</div>` : ""}
      ${it.note ? `<p class="critique-note">${esc(it.note)}</p>` : ""}
      ${it.comment ? `<p class="critique-quote">“${esc(it.comment)}”</p>` : ""}
      ${dishChips(it.dishes)}
    </div>`;
  }
  // My own ratings (stars/note/dishes) as critiques — no network, from UserData.
  function gatherMyRatingCritiques() {
    if (!UserData.isCloud()) return [];
    const myUid = UserData.me().uid;
    const out = [];
    for (const r of state.restaurants) {
      const rt = UserData.getRating(r.id);
      if (rt && (rt.stars || rt.note || (rt.dishes && rt.dishes.length))) {
        out.push({ type: "rating", uid: myUid, r, restaurantId: r.id, when: rt.updatedAt || "", stars: rt.stars || 0, note: rt.note || "", dishes: rt.dishes || [] });
      }
    }
    return out;
  }
  function ratingItemsFrom(u, byId) {
    const out = [];
    Object.entries(u.ratings || {}).forEach(([id, rt]) => {
      if (!rt || (!rt.stars && !rt.note && !(rt.dishes && rt.dishes.length))) return;
      out.push({ type: "rating", uid: u.uid, r: byId.get(id), restaurantId: id, who: u.displayName || "Amigo", photoURL: u.photoURL || "", stars: rt.stars || 0, note: rt.note || "", dishes: rt.dishes || [], when: rt.updatedAt || "" });
    });
    return out;
  }
  // Everyone's ratings (friends + me), each tagged with its author.
  function gatherAllRatingCritiques() {
    const byId = new Map(state.restaurants.map((r) => [r.id, r]));
    let items = [];
    UserData.others().forEach((u) => { items = items.concat(ratingItemsFrom(u, byId)); });
    if (UserData.isCloud()) {
      const me = UserData.me();
      gatherMyRatingCritiques().forEach((it) => { it.who = me.displayName; it.photoURL = me.photoURL; items.push(it); });
    }
    return items;
  }
  function commentItem(c, withAuthor) {
    return { type: "comment", uid: c.uid || "", restaurantId: c.restaurantId, comment: c.text || "", when: c.createdAt || "", who: withAuthor ? (c.author || "Amigo") : "", photoURL: c.photoURL || "" };
  }
  // Merge a person's rating + comment for the same restaurant into one card.
  function mergeCritiques(items) {
    const map = new Map(); const order = [];
    for (const it of items) {
      const key = (it.uid || it.who || "me") + "|" + it.restaurantId;
      let m = map.get(key);
      if (!m) { map.set(key, Object.assign({}, it)); order.push(key); continue; }
      if (it.stars && !m.stars) m.stars = it.stars;
      if (it.dishes && it.dishes.length && !(m.dishes && m.dishes.length)) m.dishes = it.dishes;
      if (it.note && !m.note) m.note = it.note;
      if (it.comment && !m.comment) m.comment = it.comment;
      if (!m.who && it.who) { m.who = it.who; m.photoURL = it.photoURL; }
      if ((it.when || "") > (m.when || "")) m.when = it.when;
      if (it.type === "rating") m.type = "rating"; // open on the experiences tab
    }
    return order.map((k) => map.get(k));
  }
  function sortCritiques(arr) {
    if (state.criticasSort === "rating") {
      return arr.slice().sort((a, b) => (b.stars || 0) - (a.stars || 0) || (a.when < b.when ? 1 : -1));
    }
    return arr.slice().sort((a, b) => (a.when < b.when ? 1 : -1));
  }
  function wireCritiqueClicks(listEl) {
    listEl.querySelectorAll("[data-crit-rest]").forEach((el) => {
      el.addEventListener("click", () => {
        const r = state.restaurants.find((x) => x.id === el.dataset.critRest);
        if (r) openOnTab(r, el.dataset.critTab || "sitio");
      });
    });
  }
  function renderCriticas() {
    const listEl = document.getElementById("criticas-list");
    if (!listEl) return;
    const scope = "mine";
    const reqId = ++criticasReqId;
    if (!UserData.isCloud()) {
      listEl.innerHTML = signinInvite(scope === "mine" ? "Inicie sessão para ver as suas críticas." : "Inicie sessão para ver as críticas.");
      return;
    }
    const paint = (items, emptyMsg) => {
      const merged = sortCritiques(mergeCritiques(items));
      if (!merged.length) { listEl.innerHTML = stateHtml({ title: emptyMsg }); return; }
      listEl.innerHTML = merged.map(critiqueRow).join("");
      wireCritiqueClicks(listEl);
    };

    if (scope === "mine") {
      const ratings = gatherMyRatingCritiques();
      paint(ratings, "Ainda não avaliaste nenhum sítio. Dá a tua nota numa experiência.");
      if (DB.isAvailable()) {
        DB.fetchCommentsByUser(UserData.me().uid).then((comments) => {
          if (reqId !== criticasReqId) return;
          const cis = (comments || []).map((c) => commentItem(c, false));
          if (cis.length) paint(ratings.concat(cis), "");
        }).catch(() => {});
      }
      return;
    }

    // scope "all": everyone's ratings (with stars + author) + public comments
    const ratings = gatherAllRatingCritiques();
    paint(ratings, "Ainda não há críticas.");
    if (DB.isAvailable()) {
      DB.fetchRecentComments(100).then((comments) => {
        if (reqId !== criticasReqId) return;
        const cis = (comments || []).map((c) => commentItem(c, true));
        if (cis.length) paint(ratings.concat(cis), "Ainda não há críticas.");
      }).catch(() => {});
    }
  }

  // ----- People: find and follow (the feed is built from who you follow) -----
  function hidePeopleModal() {
    const el = document.getElementById("people-sheet");
    if (!el) return;
    el.classList.add("hidden");
    el.setAttribute("aria-hidden", "true");
  }
  async function openPeopleModal() {
    if (!UserData.isCloud()) { showSigninModal(); return; }
    const el = document.getElementById("people-sheet");
    el.classList.remove("hidden");
    el.setAttribute("aria-hidden", "false");
    const input = el.querySelector("[data-people-search]");
    renderPeople(input ? input.value : "");
  }

  // Porque é que esta pessoa aparece aqui. Seguir alguém sem saber porquê é o
  // que faz um feed morrer à segunda semana.
  function followReason(p) {
    const mine = new Set(UserData.getFollowing());
    const shared = (p.following || []).filter((u) => mine.has(u)).length;
    if (shared) return `${shared} amigo${shared === 1 ? "" : "s"} em comum`;
    if (p.town) return `Também anda por ${p.town}`;
    return "Sugerido para ti";
  }

  function personRow(p) {
    const on = UserData.isFollowing(p.uid);
    // O nome e o avatar abrem o perfil; o botão continua a seguir. São dois
    // alvos distintos dentro da mesma linha, e é por isso que o de abrir é um
    // <button> e não a linha inteira.
    return `<div class="person-row">
      <button type="button" class="person-abrir" data-abrir-pessoa="${esc(p.uid)}" data-abrir-nome="${esc(p.displayName || "")}">
        ${avatar(p.displayName, p.photoURL)}
      </button>
      <button type="button" class="person-text person-abrir" data-abrir-pessoa="${esc(p.uid)}" data-abrir-nome="${esc(p.displayName || "")}">
        <span class="person-name">${esc(p.displayName || "Sem nome")}</span>
        <span class="person-why">${esc(followReason(p))}</span>
      </button>
      <button type="button" class="chip" data-follow="${esc(p.uid)}" data-on="${on}" aria-pressed="${on}">
        ${on ? "A seguir" : "Seguir"}
      </button>
    </div>`;
  }

  async function renderPeople(term) {
    const list = document.getElementById("people-list");
    if (!list) return;
    list.innerHTML = `<div class="skeleton" style="height:64px"></div>`;
    const me = UserData.me();
    let people = [];
    try {
      const token = window.FirebaseAuth ? await window.FirebaseAuth.getToken() : null;
      people = (await DB.searchProfiles(term, token)).filter((p) => p.uid !== me.uid);
    } catch (e) { people = []; }
    if (!people.length) {
      list.innerHTML = stateHtml({
        title: term ? "Ninguém com esse nome" : "Ainda não há ninguém para seguir",
        text: term ? "" : "Convida quem quiseres — a app é mais interessante a dois."
      });
      return;
    }
    // Duas secções: quem ainda não segues, e quem já segues.
    const novos = people.filter((p) => !UserData.isFollowing(p.uid));
    const seguidos = people.filter((p) => UserData.isFollowing(p.uid));
    list.innerHTML =
      (novos.length ? `<h3 class="people-label">Talvez conheças</h3>${novos.map(personRow).join("")}` : "") +
      (seguidos.length ? `<h3 class="people-label">Já segues · ${seguidos.length}</h3>${seguidos.map(personRow).join("")}` : "");

    // Atualiza-se o botão no sítio. Repintar a lista fazia a linha saltar de
    // "Talvez conheças" para "Já segues" debaixo do dedo — o salto que vias.
    // A lista só se reorganiza da próxima vez que o sheet abrir.
    list.querySelectorAll("[data-follow]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const target = btn.dataset.follow;
        const era = btn.dataset.on === "true";
        btn.disabled = true;
        try {
          if (era) await UserData.unfollow(target);
          else await UserData.follow(target);
          btn.dataset.on = String(!era);
          btn.setAttribute("aria-pressed", String(!era));
          btn.textContent = !era ? "A seguir" : "Seguir";
          renderAmigosScreen();
        } catch (e) { /* mantém o estado anterior */ }
        btn.disabled = false;
      }));
  }

  // ----- Joint visits: invites out, invites in -----
  let pendingInvites = [];
  let inviteRefreshWired = false;

  async function sendVisitInvites(r, iso, toUids) {
    if (!DB.isAvailable() || !UserData.isCloud()) return;
    const me = UserData.me();
    const token = window.FirebaseAuth ? await window.FirebaseAuth.getToken() : null;
    await Promise.all(toUids.map((toUid) =>
      DB.createVisitInvite({
        fromUid: me.uid, fromName: me.displayName, fromPhoto: me.photoURL,
        toUid, restaurantId: r.id, restaurantName: r.name, date: iso
      }, token).catch(() => {})
    ));
  }

  async function loadPendingInvites() {
    if (!DB.isAvailable() || !UserData.isCloud()) { pendingInvites = []; return pendingInvites; }
    try {
      const token = window.FirebaseAuth ? await window.FirebaseAuth.getToken() : null;
      const all = await DB.fetchVisitInvites(UserData.me().uid, token);
      pendingInvites = all.filter((i) => i.status === "pending");
    } catch (e) { pendingInvites = []; }
    paintInviteBadge();
    return pendingInvites;
  }

  function inviteCardHtml(inv) {
    const r = state.restaurants.find((x) => x.id === inv.restaurantId);
    return `<div class="invite-card" data-invite="${esc(inv.id)}">
      <div class="invite-main">
        ${avatar(inv.fromName, inv.fromPhoto)}
        <div class="invite-text">
          <span class="invite-who"><b>${esc(inv.fromName)}</b> diz que foste com ele a <b>${esc(inv.restaurantName || (r && r.name) || "um sítio")}</b></span>
          <span class="feed-time">${esc(fmtDateTime(inv.date))}</span>
        </div>
      </div>
      <div class="invite-actions">
        <button class="btn btn-ghost btn-sm" data-invite-no="${esc(inv.id)}">Não fui</button>
        <button class="btn btn-primary btn-sm" data-invite-yes="${esc(inv.id)}">${icon("check")} Confirmar</button>
      </div>
    </div>`;
  }

  async function respondInvite(id, accept) {
    const inv = pendingInvites.find((i) => i.id === id);
    if (!inv) return;
    const token = window.FirebaseAuth ? await window.FirebaseAuth.getToken() : null;
    try {
      // Accepting writes the visit into MY doc — the sender never could.
      if (accept) {
        UserData.addVisit(inv.restaurantId, inv.date, [inv.fromUid]);
        setVisited(inv.restaurantId, true);
        haptico("sucesso");
      }
      await DB.respondVisitInvite(id, accept ? "accepted" : "declined", token);
      pendingInvites = pendingInvites.filter((i) => i.id !== id);
      paintInviteBadge();
      renderAmigosScreen();
      refreshOpenDetail();
    } catch (e) { /* leave it pending so it can be retried */ }
  }

  // Badge on the Amigos tab so pending shared visits are visible from anywhere.
  function paintInviteBadge() {
    const n = pendingInvites.length;
    const tab = document.querySelector('#tabbar [data-tab-nav="amigos"]');
    if (!tab) return;
    let b = tab.querySelector(".tab-badge");
    if (!n) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement("span");
      b.className = "tab-badge";
      tab.appendChild(b);
    }
    b.textContent = n > 9 ? "9+" : String(n);
    b.setAttribute("aria-label", `${n} por confirmar`);
  }

  function renderInvites(host) {
    if (!host) return;
    if (!pendingInvites.length) { host.innerHTML = ""; host.hidden = true; return; }
    host.hidden = false;
    host.innerHTML = `<div class="taste-label">${icon("users")} Idas para confirmar</div>` +
      pendingInvites.map(inviteCardHtml).join("");
    host.querySelectorAll("[data-invite-yes]").forEach((b) =>
      b.addEventListener("click", () => respondInvite(b.dataset.inviteYes, true)));
    host.querySelectorAll("[data-invite-no]").forEach((b) =>
      b.addEventListener("click", () => respondInvite(b.dataset.inviteNo, false)));
  }

  // ----- Amigos: activity feed across all restaurants (from group data) -----
  function buildFriendsFeed() {
    const items = [];
    const byId = new Map(state.restaurants.map((r) => [r.id, r]));
    UserData.others().forEach((g) => {
      Object.entries(g.ratings || {}).forEach(([id, rt]) => {
        const r = byId.get(id);
        if (!r || (!rt.stars && !rt.note)) return;
        items.push({ type: "rating", when: rt.updatedAt || "", g, r, stars: rt.stars || 0, note: rt.note || "" });
      });
      Object.entries(g.history || {}).forEach(([id, dates]) => {
        const r = byId.get(id);
        if (!r) return;
        (dates || []).forEach((d) => items.push({
          type: "visit", when: UserData.visitDate(d), g, r, with: UserData.visitWith(d)
        }));
      });
      (g.priority || []).forEach((id) => {
        const r = byId.get(id);
        if (!r) return;
        items.push({ type: "priority", when: (g.priorityAt && g.priorityAt[id]) || "", g, r });
      });
    });
    return items.sort((a, b) => (a.when < b.when ? 1 : -1));
  }

  // Group friends' recent photo uploads into feed items (one per friend +
  // restaurant + day), so the feed doesn't flood with one row per photo.
  function buildPhotoFeedItems(photos) {
    const me = UserData.me();
    const meUid = me ? me.uid : null;
    const memberByUid = new Map(UserData.others().map((g) => [g.uid, g]));
    const byId = new Map(state.restaurants.map((r) => [r.id, r]));
    const groups = new Map();
    photos.forEach((p) => {
      if (!p.uid || p.uid === meUid || !memberByUid.has(p.uid)) return;
      const r = byId.get(p.restaurantId);
      if (!r) return;
      const day = (p.createdAt || "").slice(0, 10);
      const key = `${p.uid}|${p.restaurantId}|${day}`;
      let grp = groups.get(key);
      if (!grp) {
        grp = { type: "upload", when: p.createdAt || "", g: memberByUid.get(p.uid), r, photos: [] };
        groups.set(key, grp);
      }
      grp.photos.push(p);
      if ((p.createdAt || "") > grp.when) grp.when = p.createdAt || "";
    });
    return [...groups.values()];
  }

  function feedRow(it) {
    const cat = catFor(it.r);
    const who = esc(it.g.displayName || "Amigo");
    let verb;
    if (it.type === "rating") verb = "avaliou";
    else if (it.type === "visit") {
      const who = companionNames(it.with);
      verb = who ? `visitou com ${who}` : "visitou";
    }
    else if (it.type === "upload") verb = it.photos.length > 1 ? `partilhou ${it.photos.length} fotos` : "partilhou uma foto";
    else verb = "quer ir a";
    const stars = it.type === "rating" && it.stars ? `<div class="feed-stars">${starsDisplay(it.stars)}</div>` : "";
    const note = it.type === "rating" && it.note ? `<p class="feed-note">“${esc(it.note)}”</p>` : "";
    const when = it.when ? esc(fmtDateTime(it.when)) : "";
    // Shared photos (distinct from the restaurant's own cover) — each opens the
    // viewer (preview + share + download) via the global [data-photo-url] handler.
    const photos = it.type === "upload" && it.photos && it.photos.length
      ? (() => {
          // A foto é o conteúdo: uma ocupa 4:5, duas ficam lado a lado, três ou
          // mais ficam 2fr/1fr com a terceira célula a contar as restantes.
          const ps = it.photos;
          const n = Math.min(ps.length, 3);
          const extra = ps.length - 3;
          return `<div class="feed-photos" data-n="${n}">${ps.slice(0, 3).map((p, i) =>
            `<button type="button" class="feed-photo" data-photo-url="${esc(p.url)}"
                     data-photo-uid="${esc(it.uid || (it.g && it.g.uid) || "")}"
                     data-photo-badge="${esc(it.who || (it.g && it.g.displayName) || "")}">
               <img src="${esc(p.url)}" alt="" loading="lazy">
               ${i === 2 && extra > 0 ? `<span class="feed-photo-more">+${extra}</span>` : ""}
             </button>`).join("")}</div>`;
        })()
      : "";
    return `<div class="feed-item">
      <div class="feed-top">
        <button type="button" class="person-abrir" data-abrir-pessoa="${esc(it.g.uid || "")}" data-abrir-nome="${esc(it.g.displayName || "")}">
          ${avatar(it.g.displayName, it.g.photoURL)}
        </button>
        <div class="feed-top-text">
          <span class="feed-who"><button type="button" class="person-abrir feed-who-nome" data-abrir-pessoa="${esc(it.g.uid || "")}" data-abrir-nome="${esc(it.g.displayName || "")}"><b>${who}</b></button> ${verb}</span>
          ${when ? `<span class="feed-time">${when}</span>` : ""}
        </div>
      </div>
      ${photos}
      <button type="button" class="feed-rest" data-feed-rest="${esc(it.r.id)}">
        <div class="rcard-thumb" style="width:48px;height:48px"><div class="ph" data-label="foto"></div></div>
        <div class="feed-rest-info">
          <span class="rcard-cat" style="color:var(${cat.varName}-ink)">${esc(cat.label)}</span>
          <span class="feed-rest-name">${esc(it.r.name)}</span>
          <span class="rcard-loc">${icon("pin")} ${esc(it.r.town)} · ${esc(it.r.region)}</span>
        </div>
        ${icon("chevron-right")}
      </button>
      ${stars}
      ${note}
    </div>`;
  }

  function paintFeed(el, feed) {
    if (!feed.length) {
      el.innerHTML = stateHtml({
        title: "Sozinho sabe pior",
        text: "Segue quem quiseres acompanhar e a atividade deles aparece aqui.",
        actions: [{ label: "Descobrir pessoas", action: "seguir" }]
      });
      return;
    }
    el.innerHTML = feed.map(feedRow).join("");
    el.querySelectorAll("[data-feed-rest]").forEach((b) => {
      const r = state.restaurants.find((x) => x.id === b.dataset.feedRest);
      b.addEventListener("click", () => { if (r) openOnTab(r, "sitio"); });
      const ph = b.querySelector(".ph"); // the restaurant's own cover, not the shared photo
      if (r && ph) fillThumbPhoto(ph, r);
    });
  }

  let amigosReqId = 0;
  async function renderAmigosFeed() {
    const el = document.getElementById("amigos-feed");
    if (!el) return;
    if (!UserData.isCloud()) {
      el.innerHTML = signinInvite("Inicie sessão com a Google para ver a atividade dos amigos.");
      return;
    }
    const reqId = ++amigosReqId;
    const ftr = (arr) => (state.amigosFilter === "all" ? arr : arr.filter((it) => it.type === state.amigosFilter));
    const base = buildFriendsFeed();
    // Paint group activity instantly, then fold in friends' photos.
    if (base.length) paintFeed(el, ftr(base));
    else if (DB.isAvailable()) el.innerHTML = `<div class="skeleton" style="height:64px"></div>`;
    else paintFeed(el, ftr(base));
    if (!DB.isAvailable()) return;
    let photoItems = [];
    try {
      photoItems = buildPhotoFeedItems(await DB.fetchRecentPhotos(60));
    } catch (e) { photoItems = []; }
    if (reqId !== amigosReqId) return;
    const merged = base.concat(photoItems).sort((a, b) => (a.when < b.when ? 1 : -1));
    paintFeed(el, ftr(merged));
  }

  // ----- Amigos leaderboard: rank everyone by number of visits (no network) -----
  function computeAmigosLeaderboard(period) {
    const ym = new Date().toISOString().slice(0, 7);
    const inPeriod = (iso) => period === "all" || (iso || "").slice(0, 7) === ym;
    return UserData.everyone()
      .map((g) => {
        // All-time: number of restaurants marked visited (covers the toggle,
        // not only dated history). Monthly: dated visits in the current month.
        let visits;
        if (period === "all") {
          visits = (g.visited || []).length;
        } else {
          visits = 0;
          Object.values(g.history || {}).forEach((dates) =>
            (dates || []).forEach((d) => { if (inPeriod(UserData.visitDate(d))) visits++; })
          );
        }
        let ratings = 0, starSum = 0;
        Object.values(g.ratings || {}).forEach((rt) => {
          if (!rt || !rt.stars) return;
          if (period === "all" || inPeriod(rt.updatedAt)) { ratings++; starSum += rt.stars; }
        });
        return { g, visits, ratings, avgStars: ratings ? starSum / ratings : 0 };
      })
      .sort((a, b) => b.visits - a.visits || b.ratings - a.ratings);
  }

  function lbRankLabel(rank) {
    return `<span class="lb-rank lb-rank-${rank <= 3 ? rank : "n"}">${rank}</span>`;
  }

  function lbAmigoRow(item, rank) {
    return `<div class="lb-row">
      ${lbRankLabel(rank)}
      ${avatar(item.g.displayName, item.g.photoURL)}
      <div class="lb-body">
        <span class="lb-name">${esc(item.g.displayName || "Amigo")}</span>
        <span class="lb-stats muted">${icon("star")} ${item.ratings}${item.avgStars ? ` (${item.avgStars.toFixed(1)})` : ""}</span>
      </div>
      <span class="lb-score"><strong>${item.visits}</strong> <span class="lb-unit">${item.visits === 1 ? "visita" : "visitas"}</span></span>
    </div>`;
  }

  let amigosLbPeriod = "all";
  function renderAmigosLeaderboard() {
    const el = document.getElementById("amigos-leaderboard");
    if (!el) return;
    if (!UserData.isCloud()) { el.innerHTML = signinInvite("Inicie sessão para ver o leaderboard."); return; }
    const rows = computeAmigosLeaderboard(amigosLbPeriod);
    const toggle = `<div class="seg lb-period">
      <button class="seg-btn${amigosLbPeriod === "all" ? " active" : ""}" data-period="all">Sempre</button>
      <button class="seg-btn${amigosLbPeriod === "month" ? " active" : ""}" data-period="month">Este mês</button>
    </div>`;
    el.innerHTML = toggle + (rows.some((r) => r.visits > 0 || r.ratings > 0)
      ? rows.map((r, i) => lbAmigoRow(r, i + 1)).join("")
      : stateHtml({ title: "Ainda não há atividade suficiente", text: "Volta cá quando houver mais visitas registadas." }));
    el.querySelectorAll(".lb-period .seg-btn").forEach((b) =>
      b.addEventListener("click", () => { amigosLbPeriod = b.dataset.period; renderAmigosLeaderboard(); })
    );
    renderRestaurantRanking(el);
  }

  // Ranking de restaurantes pela média do grupo. Vinha das Críticas, que agora
  // é a minha vista pessoal no Diário — aqui fica ao lado dos outros rankings.
  function renderRestaurantRanking(host) {
    const rows = computeCriticasLeaderboard();
    if (!rows.length) return;
    const wrap = document.createElement("div");
    wrap.className = "lb-section";
    wrap.innerHTML = `<span class="detail-section-title">Restaurantes mais bem avaliados</span>` +
      rows.map((r, i) => lbRestRow(r, i + 1)).join("");
    host.appendChild(wrap);
    wrap.querySelectorAll("[data-lb-rest]").forEach((b) =>
      b.addEventListener("click", () => {
        const r = state.restaurants.find((x) => x.id === b.dataset.lbRest);
        if (r) openOnTab(r, "sitio");
      })
    );
  }

  // ----- Críticas leaderboard: rank restaurants by the group's average stars -----
  function computeCriticasLeaderboard() {
    const out = [];
    for (const r of state.restaurants) {
      const rs = UserData.ratingsFor(r.id).filter((x) => x.stars > 0);
      if (!rs.length) continue;
      const avg = rs.reduce((s, x) => s + x.stars, 0) / rs.length;
      out.push({ r, avg, count: rs.length, raters: rs });
    }
    return out.sort((a, b) => b.avg - a.avg || b.count - a.count);
  }

  function lbRestRow(item, rank) {
    const avatars = item.raters.slice(0, 6).map((x) => avatar(x.name, x.photoURL)).join("");
    return `<button type="button" class="lb-row lb-rest" data-lb-rest="${esc(item.r.id)}">
      ${lbRankLabel(rank)}
      <div class="lb-body">
        <span class="lb-name">${esc(item.r.name)}</span>
        <span class="lb-stats muted">${esc(item.r.town)}, ${esc(item.r.region)}</span>
      </div>
      <span class="amigos-avatars">${avatars}</span>
      <span class="lb-score">${icon("star")} ${item.avg.toFixed(1)} <span class="muted">(${item.count})</span></span>
    </button>`;
  }

  // ---------- Wiring ----------
  // Mapa e Lista são dois modos da mesma coisa, não uma gaveta por cima da
  // outra: o filtro, a procura e a contagem valem para os dois.
  function setMapMode(mode) {
    state.mapMode = mode === "lista" ? "lista" : "mapa";
    if (state.mapMode === "lista") hideMapPeek();
    document.querySelectorAll("[data-map-mode]").forEach((b) => {
      const on = b.dataset.mapMode === state.mapMode;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    // Num ecrã grande os dois painéis cabem lado a lado e o segmentado está
    // escondido por CSS: esconder um deles seria esconder metade do ecrã.
    const estreito = isMobile();
    document.querySelectorAll("[data-mode-pane]").forEach((p) => {
      p.hidden = estreito && p.dataset.modePane !== state.mapMode;
    });
    // O mapa foi redimensionado enquanto estava escondido; sem isto fica cinzento.
    if ((!estreito || state.mapMode === "mapa") && MapModule.isAvailable()) {
      setTimeout(() => { const m = MapModule.getMap(); if (m) google.maps.event.trigger(m, "resize"); }, 50);
    }
  }
  function isMobile() {
    return window.matchMedia("(max-width: 860px)").matches;
  }

  function wireEvents() {
    document.getElementById("search-input").addEventListener("input", render);

    // AI: single "Pergunta-me" chatbot (header) — replaces the old "Sugere-me",
    // "Sugestão aleatória" and the ✨ search. Only when backend is reachable.
    const aiBtn = document.getElementById("ai-suggest-btn");
    if (aiBtn) {
      if (AIModule.available()) aiBtn.addEventListener("click", runSmartSuggest);
      else aiBtn.classList.add("hidden");
    }
    document.querySelectorAll("[data-close-ai]").forEach((el) => el.addEventListener("click", hideAi));

    // Moderação (diretriz 1.2). Ligada uma vez aqui, e não a cada render da
    // lista de comentários — a folha é uma só e os botões dela não mudam.
    document.querySelectorAll("[data-close-mod]").forEach((el) => el.addEventListener("click", fecharModeracao));
    document.querySelectorAll("[data-close-pessoa]").forEach((el) => el.addEventListener("click", fecharPerfilDe));

    // Delegado no documento, e não em cada lista: os nomes aparecem no feed, na
    // folha de pessoas, nos comentários e nos avatares de "visitado por", e
    // todos esses são repintados a cada render. Ligar em cada um era ligar
    // outra vez a cada repintura.
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-abrir-pessoa]");
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      abrirPerfilDe(b.dataset.abrirPessoa, b.dataset.abrirNome || "");
    });
    const modBloq = document.querySelector("[data-mod-bloquear]");
    if (modBloq) modBloq.addEventListener("click", bloquearDaModeracao);
    const modDen = document.querySelector("[data-mod-denunciar]");
    if (modDen) modDen.addEventListener("click", denunciarDaModeracao);

    // Groups: modal close / confirm (the create/join buttons are wired per-render
    // in renderGroupBar).
    document.querySelectorAll("[data-close-group]").forEach((el) => el.addEventListener("click", hideGroupModal));
    const groupConfirm = document.querySelector("[data-group-confirm]");
    if (groupConfirm) groupConfirm.addEventListener("click", confirmGroup);
    const groupInput = document.getElementById("group-input");
    if (groupInput) groupInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); confirmGroup(); }
    });

    document.getElementById("hide-visited-checkbox").addEventListener("change", render);
    document.getElementById("only-priority-checkbox").addEventListener("change", render);
    document.querySelectorAll("#price-filters input").forEach((el) => el.addEventListener("change", render));

    // Sheet de filtros
    const fBtn = document.getElementById("filters-btn");
    if (fBtn) fBtn.addEventListener("click", openFilters);
    const fApply = document.getElementById("filters-apply");
    if (fApply) fApply.addEventListener("click", closeFilters);
    const fClear = document.getElementById("filters-clear");
    if (fClear) fClear.addEventListener("click", clearFilters);
    document.querySelectorAll("[data-close-filters]").forEach((el) => el.addEventListener("click", closeFilters));
    document.querySelectorAll("[data-close-visit]").forEach((el) => el.addEventListener("click", closeVisitSheet));
    document.querySelectorAll("[data-close-apagar]").forEach((el) => el.addEventListener("click", fecharApagarConta));
    const apagarBtn = document.getElementById("apagar-confirmar");
    if (apagarBtn) apagarBtn.addEventListener("click", confirmarApagarConta);
    wireSheetDrag("filters-sheet", closeFilters);
    wireSheetDrag("visit-sheet", closeVisitSheet);
    wireSheetDrag("people-sheet", hidePeopleModal);
    const visitSubmit = document.querySelector("[data-visit-submit]");
    if (visitSubmit) visitSubmit.addEventListener("click", submitVisit);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!document.getElementById("filters-sheet").classList.contains("hidden")) closeFilters();
      if (!document.getElementById("visit-sheet").classList.contains("hidden")) closeVisitSheet();
      if (!document.getElementById("people-sheet").classList.contains("hidden")) hidePeopleModal();
      if (!document.getElementById("apagar-sheet").classList.contains("hidden")) fecharApagarConta();
    });
    document.querySelectorAll("[data-map-mode]").forEach((b) =>
      b.addEventListener("click", () => setMapMode(b.dataset.mapMode))
    );
    // Atravessar o limiar do desktop muda quantos painéis cabem: reaplicar o
    // modo repõe o `hidden` certo e avisa o mapa de que mudou de tamanho.
    window.matchMedia("(max-width: 860px)").addEventListener("change", () => setMapMode(state.mapMode));
    // O estado inicial vinha do HTML (mapa visível, lista com `hidden`), que
    // num ecrã grande deixava a segunda coluna por abrir. Aplicar o modo uma
    // vez no arranque põe os painéis de acordo com a largura desde o início.
    setMapMode(state.mapMode);
    const recenter = document.getElementById("map-recenter-btn");
    if (recenter) recenter.addEventListener("click", () => {
      hideMapPeek();
      if (!MapModule.fitToMarkers(getFiltered())) MapModule.resetView();
    });
    document.querySelectorAll("[data-close-detail]").forEach((el) => el.addEventListener("click", closeDetail));
    document.querySelectorAll("[data-close-signin]").forEach((el) =>
      el.addEventListener("click", () => hideSigninModal(true))
    );
    const signinModalBtn = document.getElementById("signin-modal-btn");
    if (signinModalBtn) signinModalBtn.addEventListener("click", () => { AuthModule.signIn(); hideSigninModal(false); });
    const signinAppleBtn = document.getElementById("signin-apple-btn");
    if (signinAppleBtn) signinAppleBtn.addEventListener("click", () => { AuthModule.signInApple(); hideSigninModal(false); });

    // Guided tour controls
    document.querySelectorAll("[data-tour-skip]").forEach((el) => el.addEventListener("click", hideTour));
    const tourNext = document.getElementById("tour-next");
    if (tourNext) tourNext.addEventListener("click", () => {
      if (tourIdx >= passosDoTour.length - 1) hideTour();
      else { tourIdx++; paintTourSlide(); }
    });
    const tourPrev = document.getElementById("tour-prev");
    if (tourPrev) tourPrev.addEventListener("click", () => { if (tourIdx > 0) { tourIdx--; paintTourSlide(); } });
    document.querySelectorAll("[data-close-success]").forEach((el) => el.addEventListener("click", hideSuccess));
    // O avatar da barra superior deixa de abrir um modal: navega para o separador.
    const chipImg = document.getElementById("user-chip-img");
    if (chipImg) chipImg.addEventListener("click", () => navTo("perfil"));

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (viewerOpen()) { hidePhotoViewer(); return; }
        if (groupModalOpen()) { hideGroupModal(); return; }
        if (aiOpen()) { hideAi(); return; }
        if (tourOpen()) { hideTour(); return; }
        const su = document.getElementById("success-modal");
        if (su && !su.classList.contains("hidden")) { hideSuccess(); return; }
        const sm = document.getElementById("signin-modal");
        if (sm && !sm.classList.contains("hidden")) { hideSigninModal(true); return; }
        closeDetail();
      }
    });
    document.querySelectorAll("#tabbar .tab").forEach((t) =>
      t.addEventListener("click", () => navTo(t.dataset.tabNav))
    );
    window.addEventListener("hashchange", onHashChange);
    document.querySelectorAll("#diario-seg .chip-tab").forEach((b) =>
      b.addEventListener("click", () => { state.diarioView = b.dataset.dview; renderDiario(); })
    );
    document.querySelectorAll("#criticas-sort .chip-sort").forEach((b) =>
      b.addEventListener("click", () => {
        state.criticasSort = b.dataset.csort;
        document.querySelectorAll("#criticas-sort .chip-sort").forEach((x) => {
          const on = x.dataset.csort === state.criticasSort;
          x.classList.toggle("active", on); x.setAttribute("aria-pressed", String(on));
        });
        renderCriticas();
      })
    );
    document.querySelectorAll("#amigos-tabs .chip-tab").forEach((b) =>
      b.addEventListener("click", () => { state.amigosTab = b.dataset.atab; renderAmigosScreen(); })
    );
    document.querySelectorAll("#amigos-filter .chip-sort").forEach((b) =>
      b.addEventListener("click", () => {
        state.amigosFilter = b.dataset.afilter;
        document.querySelectorAll("#amigos-filter .chip-sort").forEach((x) => {
          const on = x.dataset.afilter === state.amigosFilter;
          x.classList.toggle("active", on); x.setAttribute("aria-pressed", String(on));
        });
        renderAmigosFeed();
      })
    );
    document.querySelectorAll("[data-a2hs-close]").forEach((el) => el.addEventListener("click", hideA2HS));

    // Photo viewer: open on any [data-photo-url] tap; wire its actions.
    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-photo-url]");
      if (t) {
        e.preventDefault();
        openPhotoViewer(t.dataset.photoUrl, t.dataset.photoSource,
          { uid: t.dataset.photoUid || "", quem: t.dataset.photoBadge || t.title || "esta pessoa" });
      }
    });
    document.querySelectorAll("[data-close-viewer]").forEach((el) => el.addEventListener("click", hidePhotoViewer));
    const vDl = document.querySelector("[data-viewer-download]");
    const vSh = document.querySelector("[data-viewer-share]");
    if (vDl) vDl.addEventListener("click", () => downloadPhoto(viewerUrl));
    if (vSh) vSh.addEventListener("click", () => sharePhoto(viewerUrl));
    const vDen = document.querySelector("[data-viewer-denunciar]");
    if (vDen) vDen.addEventListener("click", () => {
      hidePhotoViewer();
      abrirModeracao({
        tipo: "foto",
        alvoId: viewerUrl,
        alvoUid: viewerDono.uid,
        quem: viewerDono.quem,
        restaurantId: state.currentDetail ? state.currentDetail.id : ""
      });
    });
    const vCover = document.querySelector("[data-viewer-cover]");
    if (vCover) vCover.addEventListener("click", () => setRestaurantCover(viewerUrl));
    document.querySelectorAll("[data-close-people]").forEach((el) => el.addEventListener("click", hidePeopleModal));
    const peopleSearch = document.querySelector("#people-sheet [data-people-search]");
    if (peopleSearch) {
      let t = null;
      peopleSearch.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => renderPeople(peopleSearch.value), 250);
      });
    }

    const mapSearchBtn = document.getElementById("map-search-btn");
    if (mapSearchBtn) mapSearchBtn.addEventListener("click", () => {
      const box = document.getElementById("map-search");
      if (box && !box.classList.contains("hidden")) closeMapSearch(); else openMapSearch();
    });
    const mapSearchClose = document.getElementById("map-search-close");
    if (mapSearchClose) mapSearchClose.addEventListener("click", closeMapSearch);
    const mapSearchGo = document.getElementById("map-search-go");
    if (mapSearchGo) mapSearchGo.addEventListener("click", runMapSearch);
    const mapSearchInput = document.getElementById("map-search-input");
    if (mapSearchInput) mapSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); runMapSearch(); }
    });

    const heroBtn = document.getElementById("hero-cover-btn");
    if (heroBtn) heroBtn.addEventListener("click", openCoverModal);
    document.querySelectorAll("[data-close-cover]").forEach((el) => el.addEventListener("click", hideCoverModal));
    const coverInput = document.querySelector("#cover-modal [data-cover-input]");
    if (coverInput) coverInput.addEventListener("change", () => {
      const f = coverInput.files && coverInput.files[0]; coverInput.value = "";
      coverUpload(f);
    });
    const coverGoogle = document.querySelector("#cover-modal [data-cover-google]");
    if (coverGoogle) coverGoogle.addEventListener("click", async () => {
      const r = state.currentDetail;
      if (!r) return;
      try { await setRestaurantCoverUrl(r, ""); hideCoverModal(); PlacesModule.fetchDetails(r).then((d) => { if (d && d.photos && d.photos[0]) setHeroPhoto(r, d.photos[0]); }); } catch (e) { /* keep modal open */ }
    });

    wireDetailSwipe();
    wirePullToRefresh();
    wirePlanner();
  }

  function mergeRestaurants(...lists) {
    const seen = new Map();
    for (const list of lists)
      for (const r of list) {
        const key = `${(r.name || "").toLowerCase().trim()}|${(r.town || "").toLowerCase().trim()}`;
        if (!seen.has(key)) seen.set(key, r);
      }
    return [...seen.values()];
  }

  function onRestaurantAdded(r, opts) {
    opts = opts || {};
    state.restaurants = mergeRestaurants(state.restaurants, [r]);
    buildRegionFilters();
    if (opts.priority) UserData.setPriority(r.id, true); // "quero ir"
    // "já fui" passa a marcar visitado. Antes só abria a ficha e deixava a
    // pessoa fazê-lo à mão — o botão dizia uma coisa e a app fazia outra, e o
    // sítio não aparecia no Diário até alguém reparar. A avaliação continua
    // opcional, como em todo o lado.
    if (opts.visited) UserData.setVisited(r.id, true);
    render();
    if (opts.silent) return; // added in the background (e.g. an AI discovery) — don't steal focus
    if (opts.tab) openOnTab(r, opts.tab); // experiência: abre para avaliar
    else onSelect(r);
  }

  // Show the custom (cloud) profile photo in the topbar chip — AuthModule only
  // knows the Google photo, so after our data loads we may have a better one.
  function syncAccountChip() {
    const chipImg = document.getElementById("user-chip-img");
    if (!chipImg || !UserData.isCloud()) return;
    const url = UserData.me().photoURL;
    if (url) { chipImg.src = url; chipImg.classList.remove("hidden"); }
  }

  // Called by AuthModule when the signed-in user changes.
  async function onAuthChange(user, getToken) {
    if (user) {
      esconderEntrada();
      hideSigninModal(true); // a sessão expirou e voltou: fecha o que estiver aberto
      await UserData.setUser(user, getToken); // async; UserData.onChange triggers re-render
      syncAccountChip();
      // Primeira utilização na PRIMEIRA sessão da conta. A marca vive no perfil
      // na nuvem, para não reaparecer noutro dispositivo nem no armazenamento
      // separado da PWA instalada. O tutorial guiado deixa de ser automático:
      // passa a ser opcional, pelo botão "Rever tutorial" do perfil.
      if (UserData.isCloud() && !UserData.isOnboarded()) {
        startOnboarding();
      }
      // First login of the day: build the taste profile in the background so it's
      // ready to power suggestions (once restaurants are loaded).
      setTimeout(maybeAutoTasteProfile, 2000);
      loadPendingInvites(); // badge shows up without opening Amigos
      if (!inviteRefreshWired) {
        inviteRefreshWired = true;
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible" && UserData.isCloud()) loadPendingInvites();
        });
      }
    } else {
      UserData.clearUser();
      mostrarEntrada();
    }
  }

  async function init(options) {
    MapModule.init(options);
    DB.init();
    Geocode.init();
    PlacesModule.init();
    PlannerModule.init();
    AddRestaurantModule.init();
    UserData.init({
      onChange: () => {
        render();
        refreshOpenDetail();
        refreshActiveDataScreen();
      }
    });
    // O ecrã de entrada liga-se ANTES de tudo o que espera pela rede, e antes
    // do AuthModule.
    //
    // Não é preferência de estilo: o `wireEvents()` lá em baixo só corre depois
    // de dois `await` sem try/catch (o `data/restaurants.json` e o
    // `DB.fetchAll`). Com o ecrã de entrada ligado lá, bastava a rede falhar
    // para a app abrir no ecrã de login com os botões todos mortos — e sem
    // saída nenhuma, porque não há mais nada visível. Um arranque sem rede tem
    // de deixar entrar; é precisamente aí que entrar é mais preciso.
    ligarEntrada();
    ligarMeuPerfil();

    // O botão "Entrar" da barra abre o ecrã com as duas opções em vez de ir
    // direto para a Google — ver a nota sobre a diretriz 4.8 em js/auth.js.
    AuthModule.init({ onUser: onAuthChange, onSignInRequest: showSigninModal });

    const curated = await (await fetch("data/restaurants.json")).json();
    state.curated = curated; // kept for pull-to-refresh rebuilds
    const community = await DB.fetchAll();
    state.restaurants = mergeRestaurants(curated, community, Storage.getCustomRestaurants());

    // Apply shared category edits (Firebase) or local ones as a fallback.
    const overrides = DB.isAvailable() ? await DB.fetchOverrides() : Storage.getOverrides();
    state.restaurants.forEach((r) => applyOverride(r, overrides[r.id]));

    buildCategoryFilters();
    // buildStyleFilters existia desde que o eixo de estilo foi criado, mas nunca
    // chegou a ser chamado: #style-filters estava sempre vazio e o segundo eixo
    // nunca foi filtrável. Com os filtros no sheet, a secção vazia via-se.
    buildStyleFilters();
    buildRegionFilters();
    wireEvents();
    ligarTecladoNosOverlays();
    render();
    showScreen(screenFromHash());
    maybeShowA2HS();
  }

  // Re-fetch community restaurants, overrides and friends' data (pull-to-refresh).
  async function reloadData() {
    const [community] = await Promise.all([
      DB.fetchAll().catch(() => []),
      UserData.isCloud() ? UserData.reloadGroup().catch(() => {}) : Promise.resolve()
    ]);
    state.restaurants = mergeRestaurants(state.curated || [], community, Storage.getCustomRestaurants());
    const overrides = DB.isAvailable() ? await DB.fetchOverrides().catch(() => ({})) : Storage.getOverrides();
    state.restaurants.forEach((r) => applyOverride(r, overrides[r.id]));
    buildRegionFilters();
    render();
    refreshActiveDataScreen();
  }

  return { init, onRestaurantAdded, onAuthChange };
})();
