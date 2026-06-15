// Main app: data loading, sidebar list, filters, search, visited tracking,
// "surprise me", trip planner, the rich restaurant detail drawer, and (when
// signed in) per-person priority/ratings/notes/history, the group view and
// shared comments.

const CATEGORIES = {
  tradicional: { label: "Tradicional", varName: "--c-tradicional", hex: "#b06a36" },
  petiscos: { label: "Petiscos", varName: "--c-petiscos", hex: "#c14b34" },
  pastelaria: { label: "Doces", varName: "--c-pastelaria", hex: "#c25b86" },
  "fine-dining": { label: "Fine Dining", varName: "--c-fine-dining", hex: "#5d7b4a" }
};

const App = (() => {
  const state = { restaurants: [], currentDetail: null, currentScreen: "mapa", criticasScope: "mine", amigosTab: "atividade", criticasTab: "minhas" };

  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
  function icon(name, cls) {
    return `<svg class="icon${cls ? " " + cls : ""}"><use href="#i-${name}"/></svg>`;
  }
  function catFor(r) {
    return CATEGORIES[r.category] || { label: r.category, varName: "--text-muted", hex: "#888" };
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

  // Suggest one of our categories from Google place types + price level.
  // Returns null when there isn't enough signal to suggest anything.
  function suggestCategory(types, priceLevelNum) {
    const t = types || [];
    const has = (x) => t.includes(x);
    if (has("bakery")) return "pastelaria";
    if (has("bar") || has("meal_takeaway") || has("meal_delivery")) return "petiscos";
    if (has("cafe") && !has("restaurant")) return "pastelaria";
    if (has("restaurant") || has("food")) {
      if (typeof priceLevelNum === "number" && priceLevelNum >= 4) return "fine-dining";
      return "tradicional";
    }
    return null;
  }

  // ---------- Filters ----------
  function buildCategoryFilters() {
    const wrap = document.getElementById("category-filters");
    wrap.innerHTML = "";
    Object.entries(CATEGORIES).forEach(([key, cat]) => {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.type = "button";
      chip.dataset.category = key;
      chip.setAttribute("aria-pressed", "true");
      chip.innerHTML = `${dot(cat)} ${cat.label}`;
      chip.addEventListener("click", () => {
        chip.setAttribute("aria-pressed", chip.getAttribute("aria-pressed") === "true" ? "false" : "true");
        render();
      });
      wrap.appendChild(chip);
    });
  }

  function buildRegionFilters() {
    const wrap = document.getElementById("region-filters");
    const existing = new Set([...wrap.querySelectorAll("input")].map((i) => i.dataset.region));
    [...new Set(state.restaurants.map((r) => r.region))].sort().forEach((region) => {
      if (existing.has(region)) return;
      const label = document.createElement("label");
      label.innerHTML = `<input type="checkbox" checked data-region="${esc(region)}"> ${esc(region)}`;
      label.querySelector("input").addEventListener("change", render);
      wrap.appendChild(label);
    });
  }

  function selectedCategories() {
    return [...document.querySelectorAll('#category-filters .chip[aria-pressed="true"]')].map((c) => c.dataset.category);
  }
  function selectedRegions() {
    return [...document.querySelectorAll("#region-filters input:checked")].map((i) => i.dataset.region);
  }
  function selectedPrices() {
    return [...document.querySelectorAll("#price-filters input:checked")].map((i) => parseInt(i.dataset.price, 10));
  }

  function getFiltered() {
    const cats = selectedCategories();
    const regions = selectedRegions();
    const prices = selectedPrices();
    const q = document.getElementById("search-input").value.trim().toLowerCase();
    const hideVisited = document.getElementById("hide-visited-checkbox").checked;
    const onlyPriority = document.getElementById("only-priority-checkbox").checked;
    return state.restaurants.filter((r) => {
      if (!cats.includes(r.category)) return false;
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

  // ---------- Render ----------
  function render() {
    const list = getFiltered();
    renderList(list);
    MapModule.renderMarkers(list, onSelect);
    updateProgress();
    document.getElementById("list-count").textContent =
      `${list.length} restaurante${list.length === 1 ? "" : "s"}`;
  }

  function renderList(restaurants) {
    const container = document.getElementById("restaurant-list");
    container.innerHTML = "";
    if (!restaurants.length) {
      container.innerHTML = `<p class="empty">Nenhum restaurante encontrado.<br>Ajuste ou limpe os filtros.</p>`;
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

  function buildCard(r) {
    const visited = UserData.isVisited(r.id);
    const cat = catFor(r);
    const card = document.createElement("div");
    card.className = "card" + (visited ? " visited" : "");
    card.dataset.id = r.id;

    // group/personal badges
    const badges = [];
    if (showsCommunityBadge(r)) badges.push('<span class="badge community" data-community-badge>comunidade</span>');
    if (UserData.isPriority(r.id)) badges.push(`<span class="badge priority" title="Prioritário">${icon("flame")} Prioritário</span>`);
    if (UserData.isCloud()) {
      const n = UserData.visitedBy(r.id).length;
      if (n) badges.push(`<span class="badge visited-by" title="Visitado por ${n}">${icon("users")} ${n}</span>`);
    }

    card.innerHTML = `
      <span class="card-accent" style="background:var(${cat.varName})"></span>
      <div class="card-main">
        <div class="card-title-row">
          <span class="card-title">${esc(r.name)}</span>
          ${badges.join(" ")}
        </div>
        <div class="card-town">${esc(r.town)} · ${esc(r.region)}</div>
        ${r.notes ? `<div class="card-notes">${esc(r.notes)}</div>` : ""}
        <div class="card-meta" data-meta></div>
      </div>
      <button class="card-visit${visited ? " on" : ""}" data-visit aria-label="Marcar como visitado" aria-pressed="${visited}">
        ${icon("check")}
      </button>`;

    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-visit]")) return;
      onSelect(r);
    });
    card.querySelector("[data-visit]").addEventListener("click", (e) => {
      e.stopPropagation();
      setVisited(r.id, !UserData.isVisited(r.id));
    });
    if (PlacesModule.isAvailable()) {
      PlacesModule.enrichCard(r, card.querySelector("[data-meta]")).then((data) => {
        if (data && data.phone) card.querySelector("[data-community-badge]")?.remove();
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
  function setVisited(id, visited) {
    UserData.setVisited(id, visited);
    const r = state.restaurants.find((x) => x.id === id);
    if (document.getElementById("hide-visited-checkbox").checked) { render(); return; }
    if (r) MapModule.setMarkerVisited(id, r.category, visited);
    const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
    if (card) {
      card.classList.toggle("visited", visited);
      const btn = card.querySelector("[data-visit]");
      btn.classList.toggle("on", visited);
      btn.setAttribute("aria-pressed", String(visited));
    }
    const detailBtn = document.querySelector(`#detail-body [data-visit-toggle="${CSS.escape(id)}"]`);
    if (detailBtn) syncDetailVisitBtn(detailBtn, visited);
    updateProgress();
  }

  function updateProgress() {
    const total = state.restaurants.length;
    const visited = state.restaurants.filter((r) => UserData.isVisited(r.id)).length;
    const pct = total ? Math.round((visited / total) * 100) : 0;
    const vc = document.getElementById("visited-counter");
    if (vc) vc.textContent = `${visited} / ${total}`;
    document.getElementById("progress-label").textContent = `${visited} de ${total} visitados`;
    document.getElementById("progress-fill").style.width = pct + "%";
  }

  // ---------- Surprise me ----------
  function pickRandom() {
    const pool = getFiltered().filter((r) => !UserData.isVisited(r.id));
    const choices = pool.length ? pool : getFiltered();
    if (!choices.length) return;
    onSelect(choices[Math.floor(Math.random() * choices.length)]);
  }

  // ---------- Select + detail drawer ----------
  function onSelect(r) {
    // Remember the overview before the first focus, so closing returns to it.
    if (!state.currentDetail) MapModule.saveCamera();
    MapModule.focusRestaurant(r);
    MapModule.highlightMarker(r.id);
    highlightCard(r.id);
    if (isMobile()) openSidebar(false);
    openDetail(r);
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
    body.innerHTML = `
      <div class="detail-head">
        <h2>${esc(r.name)}</h2>
        <div class="detail-sub">
          <span class="cat-chip" style="color:var(${cat.varName})">${dot(cat)} ${cat.label}</span>
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
      </div>
      <div class="detail-tabs" role="tablist">
        <button class="detail-tab active" data-tab="rest" role="tab" aria-selected="true">Restaurante</button>
        <button class="detail-tab" data-tab="mem" role="tab" aria-selected="false">As minhas experiências</button>
        <button class="detail-tab" data-tab="crit" role="tab" aria-selected="false">Críticas</button>
        <button class="detail-tab" data-tab="amigos" role="tab" aria-selected="false">Amigos</button>
      </div>
      <div class="detail-panes">
        <div class="detail-pane" data-pane="rest" role="tabpanel">
          <div data-gallery></div>
          <div data-hours></div>
          <div data-reviews></div>
          <div class="cat-edit">
            <span class="detail-section-title">Tipo de sítio${DB.isAvailable() ? "" : " (só neste navegador)"}</span>
            <div class="chip-row" data-cat-edit></div>
            <div class="cat-suggest" data-cat-suggest hidden></div>
          </div>
          ${canDeleteRestaurant(r) ? `<button class="btn btn-ghost btn-block btn-danger" data-delete-restaurant>${icon("x")} Remover restaurante</button>` : ""}
        </div>
        <div class="detail-pane" data-pane="mem" role="tabpanel" hidden>
          <div class="my-marks" data-my-marks></div>
          <div class="photos" data-my-photos></div>
          <div class="my-marks-tail" data-my-marks-tail></div>
        </div>
        <div class="detail-pane" data-pane="crit" role="tabpanel" hidden>
          <div class="comments" data-comments></div>
        </div>
        <div class="detail-pane" data-pane="amigos" role="tabpanel" hidden>
          <div class="amigos" data-amigos></div>
          <div class="photos" data-friends-photos></div>
        </div>
      </div>`;

    body.querySelectorAll(".detail-tab").forEach((tab) => {
      tab.addEventListener("click", () => switchTab(body, tab.dataset.tab));
    });

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
    Object.entries(CATEGORIES).forEach(([key, c]) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.cat = key;
      chip.setAttribute("aria-pressed", String(key === r.category));
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
  function visitListHtml(r) {
    const hist = UserData.getHistory(r.id).slice().reverse();
    if (!hist.length) return `<span class="muted history-summary">Sem visitas registadas</span>`;
    return hist
      .map(
        (iso) =>
          `<div class="visit-entry"><span>${icon("check-circle")} ${fmtDate(iso)}</span>` +
          `<button type="button" class="icon-btn visit-del" data-del-visit="${esc(iso)}" aria-label="Remover visita">${icon("x")}</button></div>`
      )
      .join("");
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
    const hasStars = rating.stars > 0;

    // Journey part 1: rating + dishes.
    el.innerHTML = `
      <div class="exp-step">
        <span class="rate-label">A minha nota</span>
        <div class="stars-input" data-stars>${[1, 2, 3, 4, 5]
          .map((n) => `<button type="button" class="star-btn${n <= rating.stars ? " on" : ""}" data-star="${n}" aria-label="${n} estrelas">${icon("star")}</button>`)
          .join("")}</div>
      </div>
      <div class="exp-step dish-edit">
        <span class="rate-label">Pratos que comi</span>
        <div class="dish-chips" data-dish-chips></div>
        <input class="note-input dish-input" data-dish-input placeholder="Adicionar prato + Enter…" />
      </div>`;

    // Journey part 3 (after photos): personal note + submit + history.
    if (tail) tail.innerHTML = `
      <div class="exp-step">
        <span class="rate-label">Nota pessoal</span>
        <textarea class="note-input" data-note placeholder="Nota pessoal (ex: pedir a sobremesa)…" rows="2">${esc(rating.note || "")}</textarea>
        ${AIModule.available() && UserData.isCloud()
          ? `<button type="button" class="linklike ai-draft" data-ai-draft>${icon("sparkles")} Ajudar a escrever</button>`
          : ""}
      </div>
      <div class="visit-history">
        <button class="btn btn-primary btn-block" data-add-visit${hasStars ? "" : " disabled"}>${icon("check-circle")} Marcar visita de hoje</button>
        ${hasStars ? "" : `<span class="muted exp-hint">Dá a tua nota para registar a experiência.</span>`}
        <div class="visit-list" data-visit-list>${visitListHtml(r)}</div>
      </div>`;

    el.querySelectorAll("[data-stars] .star-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        let stars = parseInt(btn.dataset.star, 10);
        const cur = UserData.getRating(r.id) || { stars: 0, note: "", dishes: [] };
        if (cur.stars === stars) stars = 0; // click same star again to clear
        const noteEl = tail && tail.querySelector("[data-note]");
        const note = noteEl ? noteEl.value.trim() : (cur.note || "");
        UserData.setRating(r.id, stars, note, cur.dishes || []);
        renderMyMarks(r);
        renderAmigos(r);
      });
    });

    if (tail) {
      let noteTimer = null;
      const noteEl = tail.querySelector("[data-note]");
      if (noteEl) noteEl.addEventListener("input", (e) => {
        clearTimeout(noteTimer);
        const val = e.target.value.trim();
        noteTimer = setTimeout(() => {
          const cur = UserData.getRating(r.id) || { stars: 0, note: "", dishes: [] };
          UserData.setRating(r.id, cur.stars, val, cur.dishes || []);
          renderAmigos(r);
        }, 600);
      });

      const draftBtn = tail.querySelector("[data-ai-draft]");
      if (draftBtn && noteEl) draftBtn.addEventListener("click", () => runDraftReview(r, noteEl, draftBtn));

      const submitBtn = tail.querySelector("[data-add-visit]");
      if (submitBtn) submitBtn.addEventListener("click", () => {
        if (!((UserData.getRating(r.id) || {}).stars)) return; // gated on a rating
        UserData.addVisit(r.id, new Date().toISOString());
        setVisited(r.id, true);
        renderMyMarks(r);
        renderAmigos(r);
        showSuccess(r.name);
      });

      tail.querySelectorAll("[data-del-visit]").forEach((btn) => {
        btn.addEventListener("click", () => {
          UserData.removeVisit(r.id, btn.dataset.delVisit);
          renderMyMarks(r);
          renderAmigos(r);
        });
      });
    }

    // Dishes consumed — add chip-by-chip (Enter or comma), each removable.
    const curDishes = () => ((UserData.getRating(r.id) || {}).dishes || []).slice();
    const saveDishes = (list) => {
      const rt = UserData.getRating(r.id) || { stars: 0, note: "" };
      UserData.setRating(r.id, rt.stars, rt.note, list);
    };
    const chipsWrap = el.querySelector("[data-dish-chips]");
    const dishInput = el.querySelector("[data-dish-input]");
    function paintDishChips() {
      const list = curDishes();
      chipsWrap.innerHTML = list
        .map((d, i) => `<span class="dish-chip removable"><span>${esc(d)}</span><button type="button" class="dish-x" data-del-dish="${i}" aria-label="Remover">${icon("x")}</button></span>`)
        .join("");
      chipsWrap.querySelectorAll("[data-del-dish]").forEach((b) => {
        b.addEventListener("click", () => {
          const list2 = curDishes();
          list2.splice(parseInt(b.dataset.delDish, 10), 1);
          saveDishes(list2);
          paintDishChips();
          renderAmigos(r);
        });
      });
    }
    function addDishFromInput() {
      const raw = dishInput.value.replace(/,+$/, "").trim();
      dishInput.value = "";
      if (!raw) return;
      const list = curDishes();
      if (!list.some((d) => d.toLowerCase() === raw.toLowerCase())) {
        list.push(raw);
        saveDishes(list);
        paintDishChips();
        renderAmigos(r);
      }
    }
    dishInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addDishFromInput(); }
    });
    dishInput.addEventListener("blur", addDishFromInput);
    paintDishChips();
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
    const comments = await DB.fetchComments(r.id);
    // guard against the user navigating to another restaurant meanwhile
    if (state.currentDetail !== r) return;
    listEl.innerHTML = comments.length
      ? comments.map(renderComment).join("")
      : `<p class="muted">Ainda não há comentários.</p>`;

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

  function renderComment(c) {
    return `<div class="comment">
      ${avatar(c.author, c.photoURL)}
      <div class="comment-body">
        <span class="comment-who"><span class="name">${esc(c.author)}</span><span class="when">${esc(fmtDate(c.createdAt))}</span></span>
        <p>${esc(c.text)}</p>
      </div>
    </div>`;
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
    const others = me ? photos.filter((p) => p.uid !== me.uid) : photos;
    if (myGrid) paintPhotoGrid(myGrid, mine, me ? "Ainda não adicionou fotos." : "Inicie sessão para adicionar fotos.");
    if (friendsGrid) paintPhotoGrid(friendsGrid, others, "Ainda não há fotos de amigos.");

    if (canUpload && myGrid) {
      const galleryInput = mineEl.querySelector("[data-photo-input]");
      const cameraInput = mineEl.querySelector("[data-photo-camera]");
      const statusEl = mineEl.querySelector("[data-photo-status]");
      const handleFile = async (file) => {
        if (!file) return;
        if (!/^image\//.test(file.type)) { statusEl.textContent = "Selecione uma imagem."; return; }
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
          statusEl.textContent = "Não foi possível enviar. As fotos já estão ativadas no Firebase?";
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
      grid.innerHTML = `<p class="photo-empty muted">${esc(emptyMsg || "Ainda não há fotos.")}</p>`;
      return;
    }
    grid.innerHTML = photos.map(photoTile).join("");
  }

  function photoTile(p) {
    return `<button type="button" class="photo-tile" data-photo-url="${esc(p.url)}" title="${esc(p.author || "")}">
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
  function changeCategory(r, key) {
    if (r.category === key) return;
    r.category = key;
    Storage.setOverride(r.id, key);
    if (DB.isAvailable()) DB.setOverride(r.id, key).catch(() => {});

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
      statsEl.innerHTML = `<p class="hint">Ative a Google Maps API para ver avaliações, fotos e horários.</p>`;
      return;
    }
    // skeletons
    statsEl.innerHTML = `<div class="stat"><span class="label">Avaliação</span><span class="value"><span class="skeleton sk-line" style="width:54px"></span></span></div>`;
    reviewsEl.innerHTML = `<div class="skeleton sk-line" style="width:40%"></div><div class="skeleton" style="height:54px;margin-top:8px"></div>`;

    const data = await PlacesModule.fetchDetails(r);
    if (state.currentDetail !== r) return;
    if (!data) {
      statsEl.innerHTML = `<p class="hint">Sem dados do Google para este sítio ainda.</p>`;
      reviewsEl.innerHTML = "";
      return;
    }

    // hero photo
    if (data.photos && data.photos[0]) {
      document.getElementById("detail-hero").innerHTML = `<img src="${esc(data.photos[0])}" alt="${esc(r.name)}" />`;
    }

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

    // category suggestion from Google types/price
    const sug = suggestCategory(data.types, data.priceLevelNum);
    const sugEl = body.querySelector("[data-cat-suggest]");
    if (sugEl && sug && sug !== r.category && CATEGORIES[sug]) {
      sugEl.hidden = false;
      sugEl.innerHTML =
        `<span class="hint">Sugestão do Google: <strong>${esc(CATEGORIES[sug].label)}</strong></span> ` +
        `<button type="button" class="linklike" data-apply-sug>Aplicar</button>`;
      sugEl.querySelector("[data-apply-sug]").addEventListener("click", () => {
        changeCategory(r, sug);
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
        `<div class="gallery">${data.photos.slice(1, 6).map((p) => `<img class="gallery-img" data-photo-url="${esc(p)}" src="${esc(p)}" alt="" loading="lazy">`).join("")}</div>`;
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
  function maybePromptSignin() {
    if (UserData.isCloud()) return;
    if (!(window.FirebaseAuth && window.FirebaseAuth.configured)) return;
    let dismissed = false;
    try { dismissed = sessionStorage.getItem("rp.signinPrompt") === "off"; } catch (e) {}
    if (dismissed) return;
    showSigninModal();
  }

  // ---------- Guided tour (spotlight) ----------
  const TOUR_STEPS = [
    { title: "Bem-vindo", text: "Esta é a sua app de restaurantes. No mapa explora sítios por todo o Portugal — toque num para ver os detalhes." },
    { target: '[data-tab-nav="memorias"]', title: "Memórias", text: "Aqui ficam os sítios que avaliou, anotou ou visitou — com as estrelas, notas e pratos que registou." },
    { target: '[data-tab-nav="criticas"]', title: "Críticas", text: "As suas críticas e o ranking de restaurantes por estrelas do grupo." },
    { target: '[data-tab-nav="amigos"]', title: "Amigos", text: "A atividade dos amigos e o leaderboard de quem mais explora." },
    { target: "#user-chip", title: "A sua conta", text: "Com sessão iniciada, tudo fica guardado e sincronizado. Pode rever esta visita no ícone das estrelas." }
  ];
  const TOUR_DONE_KEY = "portugalRestaurants.tourDone";
  let tourIdx = 0;
  function tourDone() { try { return localStorage.getItem(TOUR_DONE_KEY) === "1"; } catch (e) { return false; } }
  function markTourDone() { try { localStorage.setItem(TOUR_DONE_KEY, "1"); } catch (e) {} }

  function paintTourSlide() {
    const step = TOUR_STEPS[tourIdx];
    document.getElementById("tour-title").textContent = step.title;
    document.getElementById("tour-text").textContent = step.text;
    document.getElementById("tour-dots").innerHTML = TOUR_STEPS
      .map((_, i) => `<span class="tour-dot${i === tourIdx ? " on" : ""}"></span>`).join("");
    document.getElementById("tour-prev").style.visibility = tourIdx === 0 ? "hidden" : "visible";
    document.getElementById("tour-next").textContent = tourIdx === TOUR_STEPS.length - 1 ? "Começar" : "Próximo";
    positionTour();
  }
  function positionTour() {
    const step = TOUR_STEPS[tourIdx];
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
  function showTour() {
    const el = document.getElementById("tour");
    if (!el) return;
    tourIdx = 0;
    el.classList.remove("hidden");
    el.setAttribute("aria-hidden", "false");
    paintTourSlide();
    window.addEventListener("resize", positionTour);
    window.addEventListener("orientationchange", positionTour);
  }
  function hideTour() {
    const el = document.getElementById("tour");
    if (el) { el.classList.add("hidden"); el.setAttribute("aria-hidden", "true"); }
    markTourDone();
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
  function openProfileModal() {
    const m = document.getElementById("profile-modal");
    if (!m) return;
    const img = m.querySelector("[data-profile-img]");
    const me = UserData.isCloud() ? UserData.me() : null;
    if (img) img.src = (me && me.photoURL) || "";
    const status = m.querySelector("[data-profile-status]");
    if (status) status.textContent = "";
    m.classList.remove("hidden");
  }
  function hideProfileModal() {
    const m = document.getElementById("profile-modal");
    if (m) m.classList.add("hidden");
  }
  function wireProfileUpload() {
    const input = document.querySelector("#profile-modal [data-profile-input]");
    const status = document.querySelector("#profile-modal [data-profile-status]");
    if (!input) return;
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      input.value = "";
      if (!file) return;
      if (!UserData.isCloud() || !(window.FirebaseStorage && window.FirebaseStorage.configured)) {
        if (status) status.textContent = "Inicie sessão para mudar a foto.";
        return;
      }
      if (!/^image\//.test(file.type)) { if (status) status.textContent = "Selecione uma imagem."; return; }
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
        const pm = document.querySelector("#profile-modal [data-profile-img]");
        if (pm) pm.src = url;
        refreshOpenDetail();
        refreshActiveDataScreen();
        if (status) status.textContent = "Foto atualizada.";
      } catch (e) {
        if (status) status.textContent = "Não foi possível enviar. As fotos já estão ativadas no Firebase?";
      }
    });
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
      if (delta > 0) {
        if (!dragging && delta > 6) { dragging = true; card.classList.add("dragging"); }
        if (dragging) { dy = delta; e.preventDefault(); card.style.transform = `translateY(${dy}px)`; }
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
      let startY = 0, pulling = false, dist = 0, refreshing = false;
      sc.addEventListener("touchstart", (e) => {
        if (refreshing || e.touches.length !== 1) { pulling = false; return; }
        pulling = sc.scrollTop <= 0;
        if (pulling) { startY = e.touches[0].clientY; dist = 0; ptr.classList.remove("settle"); }
      }, { passive: true });
      sc.addEventListener("touchmove", (e) => {
        if (!pulling || refreshing) return;
        dist = e.touches[0].clientY - startY;
        if (dist > 0) {
          ptr.style.height = Math.min(dist * 0.5, 70) + "px";
          if (dist > 12) e.preventDefault();
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
    let dismissed = false;
    try { dismissed = localStorage.getItem("foodboxd.a2hsDismissed") === "1"; } catch (e) {}
    if (isIOS && !standalone && !dismissed) el.classList.remove("hidden");
  }
  function hideA2HS() {
    const el = document.getElementById("ios-a2hs");
    if (el) el.classList.add("hidden");
    try { localStorage.setItem("foodboxd.a2hsDismissed", "1"); } catch (e) {}
  }

  // ---------- Photo viewer (in-app lightbox: download / share) ----------
  let viewerUrl = "";
  function viewerOpen() {
    const m = document.getElementById("photo-viewer");
    return m && !m.classList.contains("hidden");
  }
  function openPhotoViewer(url) {
    const m = document.getElementById("photo-viewer");
    if (!m || !url) return;
    viewerUrl = url;
    const img = m.querySelector("[data-viewer-img]");
    if (img) img.src = url;
    m.classList.remove("hidden");
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
  function aiCatalog(near) {
    return state.restaurants.map((r) => {
      const rt = UserData.getRating(r.id) || {};
      const e = { id: r.id, name: r.name, town: r.town, region: r.region, cat: r.category };
      if (r.notes) e.specialty = r.notes;
      if (UserData.isVisited(r.id)) e.visited = true;
      if (UserData.isPriority(r.id)) e.priority = true;
      if (rt.stars) e.myStars = rt.stars;
      if (rt.dishes && rt.dishes.length) e.myDishes = rt.dishes;
      const avg = UserData.avgRating(r.id);
      if (avg) e.groupAvg = Math.round(avg * 10) / 10;
      if (near && typeof r.lat === "number" && typeof r.lng === "number") {
        e.distKm = distKm(near, { lat: r.lat, lng: r.lng });
      }
      return e;
    });
  }

  // A short taste profile aggregated from my ratings.
  function aiProfile() {
    const catWeights = {};
    const likedDishes = [];
    let rated = 0, sum = 0;
    state.restaurants.forEach((r) => {
      const rt = UserData.getRating(r.id);
      if (rt && rt.stars) {
        rated++; sum += rt.stars;
        catWeights[r.category] = (catWeights[r.category] || 0) + rt.stars;
        if (rt.stars >= 4 && Array.isArray(rt.dishes)) likedDishes.push(...rt.dishes);
      }
    });
    return {
      name: UserData.isCloud() ? (UserData.me().displayName || "") : "",
      visitedCount: state.restaurants.filter((r) => UserData.isVisited(r.id)).length,
      avgStars: rated ? Math.round((sum / rated) * 10) / 10 : null,
      catWeights,
      likedDishes: [...new Set(likedDishes)].slice(0, 20)
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

  async function runSuggest() {
    if (!UserData.isCloud()) { showSigninModal(); return; }
    if (!state.restaurants.length) return;
    openAi();
    aiLoading("A analisar os teus restaurantes…");
    let near = null;
    if (navigator.geolocation) {
      near = await new Promise((res) =>
        navigator.geolocation.getCurrentPosition(
          (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => res(null),
          { timeout: 6000, maximumAge: 300000 }
        )
      );
    }
    try {
      const r = await AIModule.recommend({
        catalog: aiCatalog(near),
        profile: aiProfile(),
        criteria: near ? { near: true } : {}
      });
      renderSuggest(r);
    } catch (e) {
      aiError(e.message);
    }
  }

  function renderSuggest(r) {
    const pick = r && restById(r.restaurantId);
    if (!pick) { aiError("A IA não devolveu uma sugestão válida."); return; }
    const alts = (r.alternatives || [])
      .map((a) => ({ rest: restById(a.restaurantId), reason: a.reason }))
      .filter((a) => a.rest && a.rest.id !== pick.id)
      .slice(0, 3);
    const cat = catFor(pick);
    document.getElementById("ai-body").innerHTML = `
      <div class="ai-pick" data-ai-open="${esc(pick.id)}">
        <span class="ai-pick-cat" style="background:var(${cat.varName})"></span>
        <div class="ai-pick-main">
          <div class="ai-pick-name">${esc(pick.name)}</div>
          <div class="ai-pick-loc">${esc(pick.town)} · ${esc(pick.region)}</div>
          <div class="ai-pick-reason">${esc(r.reason || "")}</div>
        </div>
        ${icon("chevron-right")}
      </div>
      ${alts.length ? `<div class="ai-alts-title">Também podes gostar</div>
      <div class="ai-alts">${alts.map((a) => `
        <button class="ai-alt" data-ai-open="${esc(a.rest.id)}">
          <span class="ai-alt-name">${esc(a.rest.name)}</span>
          <span class="ai-alt-reason">${esc(a.reason || "")}</span>
        </button>`).join("")}</div>` : ""}`;
    document.querySelectorAll("#ai-body [data-ai-open]").forEach((el) =>
      el.addEventListener("click", () => {
        const rest = restById(el.dataset.aiOpen);
        if (rest) { hideAi(); onSelect(rest); }
      })
    );
  }

  // Natural-language search: a query → structured filters applied to the UI.
  async function runNlSearch() {
    if (!AIModule.available() || !UserData.isCloud()) return;
    const input = document.getElementById("search-input");
    const query = input.value.trim();
    if (!query) return;
    const btn = document.getElementById("nl-search-btn");
    if (btn) btn.classList.add("busy");
    try {
      const regions = [...new Set(state.restaurants.map((r) => r.region))].sort();
      const f = await AIModule.nlSearch({ query, regions });
      applyNlFilters(f);
    } catch (e) {
      /* keep the literal search; NL is a bonus */
    }
    if (btn) btn.classList.remove("busy");
  }

  function applyNlFilters(f) {
    if (!f) return;
    if (Array.isArray(f.categories) && f.categories.length) {
      document.querySelectorAll("#category-filters .chip").forEach((c) =>
        c.setAttribute("aria-pressed", String(f.categories.includes(c.dataset.category)))
      );
    }
    if (Array.isArray(f.regions) && f.regions.length) {
      document.querySelectorAll("#region-filters input").forEach((i) =>
        (i.checked = f.regions.includes(i.dataset.region))
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
      if (!from || !to) { status.textContent = "Indique o ponto de partida e o destino."; return; }
      if (!PlannerModule.isAvailable()) { status.textContent = "O planeador precisa da Google Maps ativa."; return; }
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
        stops.forEach(({ restaurant, distanceKm }) => {
          const li = document.createElement("li");
          li.tabIndex = 0;
          li.dataset.id = restaurant.id;
          li.setAttribute("role", "button");
          li.innerHTML = `
            <strong>${esc(restaurant.name)}</strong> — ${esc(restaurant.town)}
            <br><span class="dist">${distanceKm.toFixed(1)} km da rota</span>
            <span class="ai-note" data-ai-note hidden></span>
            <span class="route-summary" data-route-summary>Ver percurso com esta paragem</span>`;
          li.addEventListener("click", () => selectStop(li, restaurant));
          li.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              selectStop(li, restaurant);
            }
          });
          results.appendChild(li);
        });
        selectStop(results.querySelector("li"), stops[0].restaurant);
        annotateStops(stops);
        // On mobile, close the sidebar so the drawn route is visible.
        if (isMobile()) openSidebar(false);
        else results.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
  const SCREENS = ["mapa", "memorias", "criticas", "amigos"];

  function screenFromHash() {
    const h = (location.hash || "").replace("#", "");
    return SCREENS.includes(h) ? h : "mapa";
  }

  function showScreen(name) {
    if (!SCREENS.includes(name)) name = "mapa";
    state.currentScreen = name;
    // The sidebar (list/filters) only belongs to the map; leaving it should
    // dismiss the open sidebar so it doesn't hang over the other screens.
    if (name !== "mapa") openSidebar(false);
    document.querySelectorAll(".screen-data").forEach((s) => {
      s.hidden = s.dataset.screen !== name;
    });
    document.querySelectorAll("#tabbar .tab").forEach((t) => {
      const on = t.dataset.tabNav === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
    });
    if (name === "memorias") renderMemorias();
    else if (name === "criticas") renderCriticasScreen();
    else if (name === "amigos") renderAmigosScreen();
  }

  // ---------- Groups (Amigos screen) ----------
  // The bar above the Amigos sub-tabs: pick the active group (or "Todos"),
  // create a new one, or join with a code. The social views (feed, leaderboard,
  // badges) are scoped to whatever is active here, via UserData's group filter.
  function renderGroupBar() {
    const el = document.getElementById("amigos-groupbar");
    if (!el) return;
    if (!UserData.isCloud()) { el.innerHTML = ""; return; }
    const groups = UserData.getGroups();
    const activeId = UserData.getActiveGroupId();
    const active = groups.find((g) => g.id === activeId) || null;
    const options = [`<option value=""${activeId ? "" : " selected"}>Todos (global)</option>`]
      .concat(groups.map((g) => `<option value="${esc(g.id)}"${g.id === activeId ? " selected" : ""}>${esc(g.name)}</option>`))
      .join("");
    el.innerHTML = `
      <div class="groupbar-row">
        <span class="groupbar-label">${icon("users")} Grupo</span>
        <select class="groupbar-select" data-group-select aria-label="Grupo ativo">${options}</select>
        <button class="btn btn-ghost btn-sm" data-group-create>${icon("plus")} Criar</button>
        <button class="btn btn-ghost btn-sm" data-group-join>Entrar</button>
      </div>
      ${active
        ? `<div class="groupbar-code">Convida amigos com o código <strong data-group-code>${esc(active.code)}</strong> <button class="linklike" data-copy-code>copiar</button></div>`
        : `<div class="groupbar-hint muted">A ver toda a gente. Cria um grupo ou entra com um código para filtrares por amigos.</div>`}`;
    el.querySelector("[data-group-select]").addEventListener("change", (e) => UserData.setActiveGroup(e.target.value || null));
    el.querySelector("[data-group-create]").addEventListener("click", () => openGroupModal("create"));
    el.querySelector("[data-group-join]").addEventListener("click", () => openGroupModal("join"));
    const copy = el.querySelector("[data-copy-code]");
    if (copy && active) copy.addEventListener("click", () => {
      if (navigator.clipboard) navigator.clipboard.writeText(active.code).catch(() => {});
      copy.textContent = "copiado ✓";
    });
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
    renderGroupBar();
    document.querySelectorAll("#amigos-tabs .seg-btn").forEach((b) => {
      const on = b.dataset.atab === state.amigosTab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    const feed = document.getElementById("amigos-feed");
    const lb = document.getElementById("amigos-leaderboard");
    const onLeaderboard = state.amigosTab === "leaderboard";
    if (feed) feed.hidden = onLeaderboard;
    if (lb) lb.hidden = !onLeaderboard;
    if (onLeaderboard) renderAmigosLeaderboard();
    else renderAmigosFeed();
  }

  // Críticas screen: switch between "my critiques" and the restaurant leaderboard.
  function renderCriticasScreen() {
    document.querySelectorAll("#criticas-tabs .seg-btn").forEach((b) => {
      const on = b.dataset.ctab === state.criticasTab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    const list = document.getElementById("criticas-list");
    const lb = document.getElementById("criticas-leaderboard");
    const scope = document.getElementById("criticas-scope");
    const onLeaderboard = state.criticasTab === "leaderboard";
    if (list) list.hidden = onLeaderboard;
    if (lb) lb.hidden = !onLeaderboard;
    if (scope) scope.hidden = onLeaderboard;
    if (onLeaderboard) renderCriticasLeaderboard();
    else renderCriticas();
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
      const lastVisit = hist.length ? hist[hist.length - 1] : null;
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

  function buildMemoryCard(m) {
    const cat = catFor(m.r);
    const meta = m.lastVisit
      ? `Última visita: ${fmtDate(m.lastVisit)}${m.visitCount > 1 ? ` · ${m.visitCount} visitas` : ""}`
      : "Sem visitas registadas";
    const card = document.createElement("button");
    card.type = "button";
    card.className = "memory-card";
    card.innerHTML = `
      <div class="memory-head">
        <span class="memory-name">${esc(m.r.name)}</span>
        ${m.stars ? starsDisplay(m.stars) : ""}
      </div>
      <span class="memory-loc">${dot(cat)} ${esc(m.r.town)}, ${esc(m.r.region)}</span>
      ${m.note ? `<p class="memory-note">${esc(m.note)}</p>` : ""}
      ${dishChips(m.dishes)}
      <span class="memory-meta muted">${icon("check-circle")} ${esc(meta)}</span>`;
    card.addEventListener("click", () => openOnTab(m.r, "mem"));
    return card;
  }

  function renderMemorias() {
    const listEl = document.getElementById("memorias-list");
    const countEl = document.getElementById("memorias-count");
    if (!listEl) return;
    if (!UserData.isCloud()) {
      listEl.innerHTML = signinInvite("Inicie sessão com a Google para guardar e rever as suas memórias.");
      if (countEl) countEl.textContent = "";
      return;
    }
    const mems = gatherMemories();
    if (countEl) countEl.textContent = mems.length ? `${mems.length} ${mems.length === 1 ? "sítio" : "sítios"}` : "";
    listEl.innerHTML = "";
    if (!mems.length) {
      listEl.innerHTML = `<p class="muted screen-empty">Ainda não tem memórias. Avalie ou marque uma visita num restaurante.</p>`;
      return;
    }
    mems.forEach((m) => listEl.appendChild(buildMemoryCard(m)));
  }

  // ----- Críticas: my comments (or all), across every restaurant -----
  let criticasReqId = 0;
  function critiqueRow(c) {
    const r = state.restaurants.find((x) => x.id === c.restaurantId);
    const name = r ? r.name : "Restaurante";
    return `<div class="critique" data-crit-rest="${esc(c.restaurantId)}">
      <div class="critique-rest">${icon("pin")} ${esc(name)}</div>
      ${renderComment(c)}
    </div>`;
  }
  function renderCriticas() {
    const listEl = document.getElementById("criticas-list");
    if (!listEl) return;
    document.querySelectorAll("#criticas-scope .seg-btn").forEach((b) => {
      const on = b.dataset.scope === state.criticasScope;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    if (!DB.isAvailable()) {
      listEl.innerHTML = `<p class="muted screen-empty">As críticas precisam da cloud configurada.</p>`;
      return;
    }
    if (state.criticasScope === "mine" && !UserData.isCloud()) {
      listEl.innerHTML = signinInvite("Inicie sessão para ver as suas críticas.");
      return;
    }
    const reqId = ++criticasReqId;
    listEl.innerHTML = `<div class="skeleton sk-line" style="width:55%"></div><div class="skeleton" style="height:54px;margin-top:8px"></div>`;
    const p = state.criticasScope === "mine"
      ? DB.fetchCommentsByUser(UserData.me().uid)
      : DB.fetchRecentComments(100);
    p.then((comments) => {
      if (reqId !== criticasReqId) return;
      if (!comments.length) {
        listEl.innerHTML = `<p class="muted screen-empty">${
          state.criticasScope === "mine" ? "Ainda não escreveu críticas." : "Ainda não há críticas."
        }</p>`;
        return;
      }
      listEl.innerHTML = comments.map(critiqueRow).join("");
      listEl.querySelectorAll("[data-crit-rest]").forEach((el) => {
        el.addEventListener("click", () => {
          const r = state.restaurants.find((x) => x.id === el.dataset.critRest);
          if (r) openOnTab(r, "crit");
        });
      });
    });
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
        (dates || []).forEach((d) => items.push({ type: "visit", when: d, g, r }));
      });
      (g.priority || []).forEach((id) => {
        const r = byId.get(id);
        if (!r) return;
        items.push({ type: "priority", when: "", g, r });
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
    const who = `<strong>${esc(it.g.displayName || "Amigo")}</strong>`;
    const rest = `<strong>${esc(it.r.name)}</strong>`;
    let line, ic;
    if (it.type === "rating") { ic = "star"; line = `${who} avaliou ${rest}${it.stars ? ` · ${it.stars}★` : ""}`; }
    else if (it.type === "visit") { ic = "check-circle"; line = `${who} visitou ${rest}`; }
    else if (it.type === "upload") { ic = "camera"; line = `${who} partilhou ${it.photos.length > 1 ? `${it.photos.length} fotos` : "uma foto"} em ${rest}`; }
    else { ic = "flame"; line = `${who} quer ir a ${rest}`; }
    const when = it.when ? `<span class="feed-when">${esc(fmtDate(it.when))}</span>` : "";
    const note = it.type === "rating" && it.note ? `<p class="feed-note">${esc(it.note)}</p>` : "";
    const photos = it.type === "upload"
      ? `<div class="feed-photos">${it.photos.slice(0, 4)
          .map((p) => `<img class="feed-photo" src="${esc(p.url)}" alt="" loading="lazy">`)
          .join("")}</div>`
      : "";
    return `<button type="button" class="feed-item${it.type === "upload" ? " feed-upload" : ""}" data-feed-rest="${esc(it.r.id)}">
      ${avatar(it.g.displayName, it.g.photoURL)}
      <div class="feed-body"><span class="feed-line">${icon(ic)} ${line}</span>${note}${when}${photos}</div>
    </button>`;
  }

  function paintFeed(el, feed) {
    if (!feed.length) {
      el.innerHTML = `<p class="muted screen-empty">Ainda não há atividade de amigos.</p>`;
      return;
    }
    el.innerHTML = feed.map(feedRow).join("");
    el.querySelectorAll("[data-feed-rest]").forEach((b) => {
      b.addEventListener("click", () => {
        const r = state.restaurants.find((x) => x.id === b.dataset.feedRest);
        if (r) openOnTab(r, "amigos");
      });
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
    const base = buildFriendsFeed();
    // Paint group activity instantly, then fold in friends' photos.
    if (base.length) paintFeed(el, base);
    else if (DB.isAvailable()) el.innerHTML = `<div class="skeleton" style="height:64px"></div>`;
    else paintFeed(el, base);
    if (!DB.isAvailable()) return;
    let photoItems = [];
    try {
      photoItems = buildPhotoFeedItems(await DB.fetchRecentPhotos(60));
    } catch (e) { photoItems = []; }
    if (reqId !== amigosReqId) return;
    const merged = base.concat(photoItems).sort((a, b) => (a.when < b.when ? 1 : -1));
    paintFeed(el, merged);
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
            (dates || []).forEach((d) => { if (inPeriod(d)) visits++; })
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
      : `<p class="muted screen-empty">Ainda não há atividade suficiente.</p>`);
    el.querySelectorAll(".lb-period .seg-btn").forEach((b) =>
      b.addEventListener("click", () => { amigosLbPeriod = b.dataset.period; renderAmigosLeaderboard(); })
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

  function renderCriticasLeaderboard() {
    const el = document.getElementById("criticas-leaderboard");
    if (!el) return;
    if (!UserData.isCloud()) { el.innerHTML = signinInvite("Inicie sessão para ver o ranking de restaurantes."); return; }
    const rows = computeCriticasLeaderboard();
    if (!rows.length) { el.innerHTML = `<p class="muted screen-empty">Ainda não há avaliações suficientes.</p>`; return; }
    el.innerHTML = rows.map((r, i) => lbRestRow(r, i + 1)).join("");
    el.querySelectorAll("[data-lb-rest]").forEach((b) =>
      b.addEventListener("click", () => {
        const r = state.restaurants.find((x) => x.id === b.dataset.lbRest);
        if (r) openOnTab(r, "crit");
      })
    );
  }

  // ---------- Wiring ----------
  function openSidebar(open) {
    const sb = document.getElementById("sidebar");
    sb.classList.toggle("open", open);
    const scrim = document.getElementById("sidebar-scrim");
    if (scrim) scrim.classList.toggle("show", open);
  }
  function isMobile() {
    return window.matchMedia("(max-width: 860px)").matches;
  }

  function wireEvents() {
    document.getElementById("search-input").addEventListener("input", render);

    // AI: "Sugere-me" (header) + natural-language search + modal close. The
    // controls only make sense when the backend is reachable and signed in.
    const aiBtn = document.getElementById("ai-suggest-btn");
    if (aiBtn) {
      if (AIModule.available()) aiBtn.addEventListener("click", runSuggest);
      else aiBtn.classList.add("hidden");
    }
    document.querySelectorAll("[data-close-ai]").forEach((el) => el.addEventListener("click", hideAi));

    // Groups: modal close / confirm (the create/join buttons are wired per-render
    // in renderGroupBar).
    document.querySelectorAll("[data-close-group]").forEach((el) => el.addEventListener("click", hideGroupModal));
    const groupConfirm = document.querySelector("[data-group-confirm]");
    if (groupConfirm) groupConfirm.addEventListener("click", confirmGroup);
    const groupInput = document.getElementById("group-input");
    if (groupInput) groupInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); confirmGroup(); }
    });
    const nlBtn = document.getElementById("nl-search-btn");
    if (nlBtn) {
      if (AIModule.available()) {
        nlBtn.classList.remove("hidden");
        nlBtn.addEventListener("click", runNlSearch);
        document.getElementById("search-input").addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); runNlSearch(); }
        });
      }
    }

    document.getElementById("hide-visited-checkbox").addEventListener("change", render);
    document.getElementById("only-priority-checkbox").addEventListener("change", render);
    document.querySelectorAll("#price-filters input").forEach((el) => el.addEventListener("change", render));
    document.getElementById("pick-random-btn").addEventListener("click", pickRandom);
    document.getElementById("sidebar-toggle").addEventListener("click", () =>
      openSidebar(!document.getElementById("sidebar").classList.contains("open"))
    );
    const scrim = document.getElementById("sidebar-scrim");
    if (scrim) scrim.addEventListener("click", () => openSidebar(false));
    const sbClose = document.getElementById("sidebar-close");
    if (sbClose) sbClose.addEventListener("click", () => openSidebar(false));
    document.querySelectorAll("[data-close-detail]").forEach((el) => el.addEventListener("click", closeDetail));
    document.querySelectorAll("[data-close-signin]").forEach((el) =>
      el.addEventListener("click", () => hideSigninModal(true))
    );
    const signinModalBtn = document.getElementById("signin-modal-btn");
    if (signinModalBtn) signinModalBtn.addEventListener("click", () => { AuthModule.signIn(); hideSigninModal(false); });

    // Guided tour controls
    document.querySelectorAll("[data-tour-skip]").forEach((el) => el.addEventListener("click", hideTour));
    const tourNext = document.getElementById("tour-next");
    if (tourNext) tourNext.addEventListener("click", () => {
      if (tourIdx >= TOUR_STEPS.length - 1) hideTour();
      else { tourIdx++; paintTourSlide(); }
    });
    const tourPrev = document.getElementById("tour-prev");
    if (tourPrev) tourPrev.addEventListener("click", () => { if (tourIdx > 0) { tourIdx--; paintTourSlide(); } });
    const tourReplay = document.getElementById("tour-replay-btn");
    if (tourReplay) tourReplay.addEventListener("click", () => { hideProfileModal(); showTour(); });

    // Success + profile modals
    document.querySelectorAll("[data-close-success]").forEach((el) => el.addEventListener("click", hideSuccess));
    document.querySelectorAll("[data-close-profile]").forEach((el) => el.addEventListener("click", hideProfileModal));
    const chipImg = document.getElementById("user-chip-img");
    if (chipImg) chipImg.addEventListener("click", openProfileModal);
    wireProfileUpload();

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (viewerOpen()) { hidePhotoViewer(); return; }
        if (groupModalOpen()) { hideGroupModal(); return; }
        if (aiOpen()) { hideAi(); return; }
        if (tourOpen()) { hideTour(); return; }
        const pm = document.getElementById("profile-modal");
        if (pm && !pm.classList.contains("hidden")) { hideProfileModal(); return; }
        const su = document.getElementById("success-modal");
        if (su && !su.classList.contains("hidden")) { hideSuccess(); return; }
        const sm = document.getElementById("signin-modal");
        if (sm && !sm.classList.contains("hidden")) { hideSigninModal(true); return; }
        closeDetail(); openSidebar(false);
      }
    });
    document.querySelectorAll("#tabbar .tab").forEach((t) =>
      t.addEventListener("click", () => navTo(t.dataset.tabNav))
    );
    window.addEventListener("hashchange", onHashChange);
    document.querySelectorAll("#criticas-scope .seg-btn").forEach((b) =>
      b.addEventListener("click", () => {
        state.criticasScope = b.dataset.scope;
        renderCriticas();
      })
    );
    document.querySelectorAll("#amigos-tabs .seg-btn").forEach((b) =>
      b.addEventListener("click", () => { state.amigosTab = b.dataset.atab; renderAmigosScreen(); })
    );
    document.querySelectorAll("#criticas-tabs .seg-btn").forEach((b) =>
      b.addEventListener("click", () => { state.criticasTab = b.dataset.ctab; renderCriticasScreen(); })
    );
    document.querySelectorAll("[data-a2hs-close]").forEach((el) => el.addEventListener("click", hideA2HS));

    // Photo viewer: open on any [data-photo-url] tap; wire its actions.
    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-photo-url]");
      if (t) { e.preventDefault(); openPhotoViewer(t.dataset.photoUrl); }
    });
    document.querySelectorAll("[data-close-viewer]").forEach((el) => el.addEventListener("click", hidePhotoViewer));
    const vDl = document.querySelector("[data-viewer-download]");
    const vSh = document.querySelector("[data-viewer-share]");
    if (vDl) vDl.addEventListener("click", () => downloadPhoto(viewerUrl));
    if (vSh) vSh.addEventListener("click", () => sharePhoto(viewerUrl));

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

  function onRestaurantAdded(r) {
    state.restaurants = mergeRestaurants(state.restaurants, [r]);
    buildRegionFilters();
    render();
    onSelect(r);
  }

  // Called by AuthModule when the signed-in user changes.
  async function onAuthChange(user, getToken) {
    if (user) {
      hideSigninModal(true); // signed in — close and don't auto-prompt again this session
      await UserData.setUser(user, getToken); // async; UserData.onChange triggers re-render
      // Tutorial only on the account's FIRST-ever sign-in. The flag lives in the
      // cloud profile, so it can't reappear on a new device or the installed
      // PWA's separate storage. (Fallback to localStorage when not cloud.)
      if (UserData.isCloud()) {
        if (!UserData.isOnboarded()) { showTour(); UserData.markOnboarded(); }
      } else if (!tourDone()) {
        showTour();
      }
    } else {
      UserData.clearUser();
      maybePromptSignin();
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
    AuthModule.init({ onUser: onAuthChange });

    const curated = await (await fetch("data/restaurants.json")).json();
    state.curated = curated; // kept for pull-to-refresh rebuilds
    const community = await DB.fetchAll();
    state.restaurants = mergeRestaurants(curated, community, Storage.getCustomRestaurants());

    // Apply shared category edits (Firebase) or local ones as a fallback.
    const overrides = DB.isAvailable() ? await DB.fetchOverrides() : Storage.getOverrides();
    state.restaurants.forEach((r) => {
      if (overrides[r.id]) r.category = overrides[r.id];
    });

    buildCategoryFilters();
    buildRegionFilters();
    wireEvents();
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
    state.restaurants.forEach((r) => { if (overrides[r.id]) r.category = overrides[r.id]; });
    buildRegionFilters();
    render();
    refreshActiveDataScreen();
  }

  return { init, onRestaurantAdded, onAuthChange };
})();
