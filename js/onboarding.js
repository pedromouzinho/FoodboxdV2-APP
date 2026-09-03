// Primeira utilização — três ecrãs antes de a app aparecer, na primeira sessão
// de cada conta (Fase 2 do handoff de design).
//
// O problema que resolve: até aqui uma conta nova via um mapa com pins que não
// eram dela, um diário vazio e um feed vazio, com um tutorial guiado por cima a
// explicar a interface antes de a pessoa ter razão para se importar com ela.
//
//   1. cidade         — centra o mapa em algo reconhecível
//   2. já foste?      — os sítios curados mais perto, toque para marcar
//   3. quem conheces? — seguir pessoas, ou um código para convidar
//
// Nenhum passo é obrigatório: todos têm saída. O tutorial guiado passa a ser
// opcional, a partir do perfil.

const Onboarding = (() => {
  // Cidades de arranque. Não é uma lista fechada — o campo aceita qualquer
  // sítio e resolve-o pelo Geocode, como o resto da app.
  const CITIES = [
    { name: "Lisboa", lat: 38.7223, lng: -9.1393 },
    { name: "Porto", lat: 41.1579, lng: -8.6291 },
    { name: "Braga", lat: 41.5454, lng: -8.4265 },
    { name: "Coimbra", lat: 40.2033, lng: -8.4103 },
    { name: "Évora", lat: 38.5714, lng: -7.9135 },
    { name: "Faro", lat: 37.0194, lng: -7.9304 },
    { name: "Funchal", lat: 32.6669, lng: -16.9241 },
    { name: "Ponta Delgada", lat: 37.7412, lng: -25.6756 }
  ];
  const NEARBY_COUNT = 8;

  let el = null;
  let step = 0;
  let town = null;
  let picked = new Set();   // ids marcados como visitados no passo 2
  let followed = new Set(); // uids seguidos no passo 3
  let opts = {};
  let resolveDone = null;

  const $ = (sel) => el && el.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Distância a direito, em km. Chega para ordenar por proximidade — não vale a
  // pena Haversine completo para escolher oito cartões.
  function distKm(a, b) {
    const dx = (a.lat - b.lat) * 111;
    const dy = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function nearby(list, centre, n) {
    return (list || [])
      .filter((r) => typeof r.lat === "number" && typeof r.lng === "number")
      .map((r) => ({ r, d: distKm(r, centre) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, n)
      .map((x) => x.r);
  }

  // ---------- passo 1: cidade ----------
  function paintCity() {
    $("[data-ob-body]").innerHTML = `
      <p class="ob-lead">Serve só para o mapa abrir onde tu comes, em vez do meio do país.</p>
      <div class="ob-cities">
        ${CITIES.map((c) => `
          <button type="button" class="chip" data-city="${esc(c.name)}"
                  aria-pressed="${town && town.name === c.name}">${esc(c.name)}</button>`).join("")}
      </div>
      <div class="field ob-field">
        <label for="ob-town">Outra localidade</label>
        <input id="ob-town" type="text" placeholder="ex: Reguengos de Monsaraz" autocomplete="address-level2" />
      </div>
      <p class="ob-status" data-ob-status aria-live="polite"></p>`;

    el.querySelectorAll("[data-city]").forEach((b) => b.addEventListener("click", () => {
      town = CITIES.find((c) => c.name === b.dataset.city) || null;
      el.querySelectorAll("[data-city]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      const input = $("#ob-town");
      if (input) input.value = "";
      syncFooter();
    }));

    const input = $("#ob-town");
    let timer = null;
    input.addEventListener("input", () => {
      el.querySelectorAll("[data-city]").forEach((x) => x.setAttribute("aria-pressed", "false"));
      town = null;
      syncFooter();
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 3) { $("[data-ob-status]").textContent = ""; return; }
      timer = setTimeout(() => resolveTown(q), 600);
    });
  }

  async function resolveTown(q) {
    const status = $("[data-ob-status]");
    if (!status) return;
    status.textContent = "A procurar…";
    try {
      // locate(name, town): sem nome, é uma procura de localidade — e o
      // matchesTown() de dentro valida que o resultado é mesmo a terra escrita.
      const hit = await Geocode.locate("", q);
      if (!hit || typeof hit.lat !== "number") throw new Error("sem resultado");
      town = { name: hit.town || q, lat: hit.lat, lng: hit.lng };
      status.textContent = `${town.name}${hit.region ? " · " + hit.region : ""}`;
    } catch (e) {
      town = null;
      status.textContent = "Não encontrei essa localidade. Escolhe uma das cidades acima.";
    }
    syncFooter();
  }

  // ---------- passo 2: já foste a algum destes? ----------
  function paintPlaces() {
    const list = nearby(opts.restaurants || [], town || CITIES[0], NEARBY_COUNT);
    if (!list.length) {
      $("[data-ob-body]").innerHTML = `<p class="ob-lead">Ainda não há sítios perto de ${esc(town ? town.name : "ti")}. Podes acrescentá-los a seguir.</p>`;
      syncFooter();
      return;
    }
    $("[data-ob-body]").innerHTML = `
      <p class="ob-lead">Toca nos que já conheces. Ficam no teu diário e no mapa desde já.</p>
      <div class="ob-places">
        ${list.map((r) => `
          <button type="button" class="ob-place" data-place="${esc(r.id)}" aria-pressed="${picked.has(r.id)}">
            <span class="ob-place-check"><svg class="icon"><use href="#i-check"/></svg></span>
            <span class="ob-place-text">
              <span class="ob-place-name">${esc(r.name)}</span>
              <span class="ob-place-meta">${esc(r.town || "")}</span>
            </span>
          </button>`).join("")}
      </div>`;
    el.querySelectorAll("[data-place]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.place;
      if (picked.has(id)) picked.delete(id); else picked.add(id);
      b.setAttribute("aria-pressed", String(picked.has(id)));
      syncFooter();
    }));
  }

  // ---------- passo 3: quem conheces? ----------
  async function paintPeople() {
    const body = $("[data-ob-body]");
    body.innerHTML = `<div class="skeleton" style="height:64px"></div>`;
    let people = [];
    try {
      const token = window.FirebaseAuth ? await window.FirebaseAuth.getToken() : null;
      const me = UserData.me();
      people = (await DB.searchProfiles("", token)).filter((p) => p.uid !== me.uid).slice(0, 12);
    } catch (e) { people = []; }

    // Nunca um beco sem saída: sem ninguém para seguir, um código para convidar.
    if (!people.length) {
      body.innerHTML = `
        <p class="ob-lead">Ainda não há ninguém para seguir. Convida quem quiseres — a app é mais interessante a dois.</p>
        <div class="ob-invite">
          <span class="ob-invite-label">Partilha esta ligação</span>
          <code class="ob-invite-code">${esc(location.origin)}</code>
        </div>`;
      syncFooter();
      return;
    }
    body.innerHTML = `
      <p class="ob-lead">Só vês a atividade de quem segues. Podes mudar isto a qualquer altura.</p>
      <div class="ob-people">
        ${people.map((p) => `
          <div class="ob-person">
            <span class="ob-avatar">${esc((p.displayName || "?").trim().charAt(0).toUpperCase())}</span>
            <span class="ob-person-name">${esc(p.displayName || "Sem nome")}</span>
            <button type="button" class="chip" data-follow="${esc(p.uid)}"
                    aria-pressed="${followed.has(p.uid) || UserData.isFollowing(p.uid)}">
              ${followed.has(p.uid) || UserData.isFollowing(p.uid) ? "A seguir" : "Seguir"}
            </button>
          </div>`).join("")}
      </div>`;
    el.querySelectorAll("[data-follow]").forEach((b) => b.addEventListener("click", async () => {
      const uid = b.dataset.follow;
      const on = b.getAttribute("aria-pressed") === "true";
      b.disabled = true;
      try {
        if (on) { await UserData.unfollow(uid); followed.delete(uid); }
        else { await UserData.follow(uid); followed.add(uid); }
        b.setAttribute("aria-pressed", String(!on));
        b.textContent = !on ? "A seguir" : "Seguir";
      } catch (e) { /* mantém o estado anterior */ }
      b.disabled = false;
      syncFooter();
    }));
  }

  // ---------- moldura ----------
  const STEPS = [
    { title: "Onde comes normalmente?", paint: paintCity, skip: "Escolher depois", cta: () => "Continuar" },
    { title: "Já foste a algum destes?", paint: paintPlaces, skip: "Nenhum destes",
      cta: () => (picked.size ? `Marcar ${picked.size}` : "Continuar") },
    { title: "Quem conheces?", paint: paintPeople, skip: "Começar sozinho", cta: () => "Entrar" }
  ];

  function syncFooter() {
    const s = STEPS[step];
    const cta = $("[data-ob-cta]");
    const skip = $("[data-ob-skip]");
    if (cta) {
      cta.textContent = s.cta();
      // Só o primeiro passo tem um requisito, e mesmo esse tem saída pelo "skip".
      cta.disabled = step === 0 && !town;
    }
    if (skip) skip.textContent = s.skip;
    const dots = $("[data-ob-dots]");
    if (dots) dots.innerHTML = STEPS.map((_, i) => `<span class="ob-dot${i === step ? " on" : ""}"></span>`).join("");
  }

  function paint() {
    $("[data-ob-title]").textContent = STEPS[step].title;
    $("[data-ob-count]").textContent = `${step + 1} de ${STEPS.length}`;
    STEPS[step].paint();
    syncFooter();
    $("[data-ob-body]").scrollTop = 0;
  }

  function next() {
    if (step === 0 && town) UserData.setHomeTown(town);
    if (step === 1 && picked.size) picked.forEach((id) => UserData.setVisited(id, true));
    if (step < STEPS.length - 1) { step += 1; paint(); return; }
    finish();
  }

  function finish() {
    el.classList.add("hidden");
    el.setAttribute("aria-hidden", "true");
    document.body.classList.remove("ob-open");
    UserData.markOnboarded();
    if (town && typeof opts.onTown === "function") opts.onTown(town);
    if (typeof opts.onDone === "function") opts.onDone({ town, places: picked.size, people: followed.size });
    if (resolveDone) { resolveDone({ town, places: picked.size, people: followed.size }); resolveDone = null; }
  }

  function start(options) {
    el = document.getElementById("onboarding");
    if (!el) return Promise.resolve(null);
    opts = options || {};
    step = 0;
    town = UserData.getHomeTown();
    picked = new Set();
    followed = new Set();
    el.classList.remove("hidden");
    el.setAttribute("aria-hidden", "false");
    document.body.classList.add("ob-open");
    if (!el.dataset.wired) {
      el.dataset.wired = "1";
      $("[data-ob-cta]").addEventListener("click", next);
      $("[data-ob-skip]").addEventListener("click", () => {
        if (step === 0) town = null;
        if (step < STEPS.length - 1) { step += 1; paint(); } else finish();
      });
    }
    paint();
    return new Promise((res) => { resolveDone = res; });
  }

  function isOpen() { return !!el && !el.classList.contains("hidden"); }

  return { start, isOpen, CITIES };
})();
