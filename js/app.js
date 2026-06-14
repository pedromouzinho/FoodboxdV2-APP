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
  const state = { restaurants: [], currentDetail: null };

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
    return state.restaurants.filter((r) => {
      if (!cats.includes(r.category)) return false;
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
      container.innerHTML = `<p class="empty">Nenhum restaurante encontrado.<br>Tenta limpar os filtros.</p>`;
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
    if (r.source === "community") badges.push('<span class="badge community">comunidade</span>');
    if (UserData.isPriority(r.id)) badges.push(`<span class="badge priority" title="Quero ir já">${icon("flame")} já</span>`);
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
    if (PlacesModule.isAvailable()) PlacesModule.enrichCard(r, card.querySelector("[data-meta]"));
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
    document.getElementById("visited-counter").textContent = `${visited} / ${total}`;
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
      ${r.notes ? `<div class="detail-note">${icon("sparkles")} <strong>Provar:</strong> ${esc(r.notes)}</div>` : ""}
      <div class="detail-actions" data-actions>
        <a class="btn btn-ghost" href="${directionsUrl(r)}" target="_blank" rel="noopener">${icon("navigation")} Direções</a>
        <a class="btn btn-ghost" href="${googleMapsUrl(r)}" target="_blank" rel="noopener">${icon("external")} Google</a>
        <button class="btn btn-ghost btn-block" data-share>${icon("share")} Partilhar</button>
        <button class="btn btn-block" data-visit-toggle="${esc(r.id)}"></button>
      </div>
      <div class="my-marks" data-my-marks></div>
      <div class="cat-edit">
        <span class="detail-section-title">Tipo de sítio${DB.isAvailable() ? "" : " (só neste navegador)"}</span>
        <div class="chip-row" data-cat-edit></div>
        <div class="cat-suggest" data-cat-suggest hidden></div>
      </div>
      <div data-gallery></div>
      <div data-hours></div>
      <div data-reviews></div>
      <div class="amigos" data-amigos></div>
      <div class="comments" data-comments></div>`;

    const visitBtn = body.querySelector("[data-visit-toggle]");
    syncDetailVisitBtn(visitBtn, visited);
    visitBtn.addEventListener("click", () => {
      const now = !UserData.isVisited(r.id);
      setVisited(r.id, now);
      syncDetailVisitBtn(visitBtn, now);
      renderMyMarks(r);
      renderAmigos(r);
    });

    body.querySelector("[data-share]").addEventListener("click", () => shareRestaurant(r));

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

  // ---------- Personal marks (priority / rating / note / visit history) ----------
  function renderMyMarks(r) {
    const el = document.querySelector("#detail-body [data-my-marks]");
    if (!el) return;

    if (!UserData.isCloud()) {
      if (DB.isAvailable()) {
        el.innerHTML =
          `<div class="signin-invite">${icon("log-in")} <span>Inicia sessão com a Google para marcar prioridade, avaliar e guardar notas — e ver as dos amigos.</span></div>`;
      } else {
        el.innerHTML = "";
      }
      return;
    }

    const priority = UserData.isPriority(r.id);
    const rating = UserData.getRating(r.id) || { stars: 0, note: "" };
    const last = UserData.lastVisit(r.id);
    const visits = UserData.getHistory(r.id).length;

    el.innerHTML = `
      <div class="detail-section-title">A minha marcação</div>
      <button class="btn btn-block priority-toggle${priority ? " on" : ""}" data-priority aria-pressed="${priority}">
        ${icon("flame")} ${priority ? "Na lista “quero ir já”" : "Quero ir já"}
      </button>
      <div class="rate-row">
        <span class="rate-label">A minha nota</span>
        <div class="stars-input" data-stars>${[1, 2, 3, 4, 5]
          .map((n) => `<button type="button" class="star-btn${n <= rating.stars ? " on" : ""}" data-star="${n}" aria-label="${n} estrelas">${icon("star")}</button>`)
          .join("")}</div>
      </div>
      <textarea class="note-input" data-note placeholder="Nota pessoal (ex: pedir a sobremesa)…" rows="2">${esc(rating.note || "")}</textarea>
      <div class="visit-history">
        <button class="btn btn-ghost btn-sm" data-add-visit>${icon("check-circle")} Marcar visita de hoje</button>
        <span class="muted history-summary">${
          last ? `Última visita: ${fmtDate(last)}${visits > 1 ? ` · ${visits} visitas` : ""}` : "Sem visitas registadas"
        }</span>
      </div>`;

    el.querySelector("[data-priority]").addEventListener("click", () => {
      const now = !UserData.isPriority(r.id);
      UserData.setPriority(r.id, now);
      renderMyMarks(r);
      render(); // refresh the "quero ir já" badge on the cards
    });

    el.querySelectorAll("[data-stars] .star-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        let stars = parseInt(btn.dataset.star, 10);
        const cur = UserData.getRating(r.id) || { stars: 0, note: "" };
        if (cur.stars === stars) stars = 0; // click same star again to clear
        UserData.setRating(r.id, stars, el.querySelector("[data-note]").value.trim());
        renderMyMarks(r);
        renderAmigos(r);
      });
    });

    let noteTimer = null;
    el.querySelector("[data-note]").addEventListener("input", (e) => {
      clearTimeout(noteTimer);
      const val = e.target.value.trim();
      noteTimer = setTimeout(() => {
        const cur = UserData.getRating(r.id) || { stars: 0, note: "" };
        UserData.setRating(r.id, cur.stars, val);
        renderAmigos(r);
      }, 600);
    });

    el.querySelector("[data-add-visit]").addEventListener("click", () => {
      UserData.addVisit(r.id, new Date().toISOString());
      setVisited(r.id, true);
      renderMyMarks(r);
      renderAmigos(r);
    });
  }

  // ---------- Group view ("Amigos") ----------
  function renderAmigos(r) {
    const el = document.querySelector("#detail-body [data-amigos]");
    if (!el) return;
    if (!UserData.isCloud()) { el.innerHTML = ""; return; }

    const visitedBy = UserData.visitedBy(r.id);
    const priorityBy = UserData.priorityBy(r.id);
    const ratings = UserData.ratingsFor(r.id);
    const avg = UserData.avgRating(r.id);

    if (!visitedBy.length && !priorityBy.length && !ratings.length) {
      el.innerHTML = "";
      return;
    }

    const blocks = [`<div class="detail-section-title">${icon("users")} Amigos</div>`];

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
    const withNotes = ratings.filter((x) => x.note);
    if (withNotes.length) {
      blocks.push(
        `<div class="amigos-notes">${withNotes
          .map(
            (x) => `<div class="amigos-note">${avatar(x.name, x.photoURL)}<div><span class="who">${esc(x.name)}${
              x.stars ? ` · ${icon("star")} ${x.stars}` : ""
            }</span><p>${esc(x.note)}</p></div></div>`
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
               <textarea class="note-input" data-comment-text placeholder="Escreve um comentário para o grupo…" rows="2"></textarea>
               <button class="btn btn-primary btn-sm" data-comment-send>Comentar</button>
             </div>`
          : DB.isAvailable()
          ? `<p class="hint">${icon("log-in")} Inicia sessão para comentar.</p>`
          : ""
      }`;

    const listEl = el.querySelector("[data-comments-list]");
    const comments = await DB.fetchComments(r.id);
    // guard against the user navigating to another restaurant meanwhile
    if (state.currentDetail !== r) return;
    listEl.innerHTML = comments.length
      ? comments.map(renderComment).join("")
      : `<p class="muted">Ainda sem comentários. Sê o primeiro!</p>`;

    if (signedIn) {
      const textEl = el.querySelector("[data-comment-text]");
      const sendBtn = el.querySelector("[data-comment-send]");
      sendBtn.addEventListener("click", async () => {
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
          textEl.placeholder = "Não consegui publicar. Tenta de novo.";
        }
        sendBtn.disabled = false;
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

  function shareRestaurant(r) {
    const url = googleMapsUrl(r);
    const text = `${r.name} — ${r.town}, ${r.region}`;
    if (navigator.share) {
      navigator.share({ title: r.name, text, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(`${text}\n${url}`).catch(() => {});
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
      statsEl.innerHTML = `<p class="hint">Ativa a Google Maps API para ver avaliações, fotos e horários aqui.</p>`;
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
        `<div class="gallery">${data.photos.slice(1, 6).map((p) => `<img src="${esc(p)}" alt="" loading="lazy">`).join("")}</div>`;
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
      reviewsEl.innerHTML =
        `<div class="detail-section-title" style="margin-bottom:10px">Avaliações</div>` +
        `<div class="reviews">${data.reviews.map(renderReview).join("")}</div>` +
        `<p class="attribution">Avaliações via Google</p>`;
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
      if (!from || !to) { status.textContent = "Indica o ponto de partida e o destino."; return; }
      if (!PlannerModule.isAvailable()) { status.textContent = "O planeador precisa da Google Maps ativa."; return; }
      status.textContent = "A calcular rota…";
      try {
        const { stops } = await PlannerModule.findStops({ from, to, radiusKm: parseInt(radius.value, 10), restaurants: state.restaurants });
        if (!stops.length) { status.textContent = "Nenhum restaurante perto desta rota."; return; }
        status.textContent = `${stops.length} paragem(ns) perto da rota:`;
        stops.forEach(({ restaurant, distanceKm }) => {
          const li = document.createElement("li");
          li.innerHTML = `<strong>${esc(restaurant.name)}</strong> — ${esc(restaurant.town)}<br><span class="dist">${distanceKm.toFixed(1)} km da rota</span>`;
          li.addEventListener("click", () => onSelect(restaurant));
          results.appendChild(li);
        });
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
    document.getElementById("hide-visited-checkbox").addEventListener("change", render);
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
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeDetail(); openSidebar(false); }
    });
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
  function onAuthChange(user, getToken) {
    if (user) {
      UserData.setUser(user, getToken); // async; UserData.onChange triggers re-render
    } else {
      UserData.clearUser();
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
      }
    });
    AuthModule.init({ onUser: onAuthChange });

    const curated = await (await fetch("data/restaurants.json")).json();
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
  }

  return { init, onRestaurantAdded, onAuthChange };
})();
