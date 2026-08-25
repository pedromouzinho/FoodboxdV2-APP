// "Add restaurant" modal. Designed so a non-technical person can add a place
// in seconds: type name + town + type, hit one button. We geocode in the
// background and save to the shared cloud list (Supabase) when it's set up,
// otherwise to the person's own browser. Coordinates/JSON live under
// "Opções avançadas" for the rare case the auto-location is off.

const AddRestaurantModule = (() => {
  let modal, form, closeBtn, locateBtn, locateStatus, copyJsonBtn, submitBtn, statusEl, aiSuggestBtn, titleEl, introEl;
  let nameInput, townInput, regionInput, categorySelect, notesInput, latInput, lngInput, stylesWrap;
  // "wishlist" = um sítio onde quero ir (fica prioritário); "experience" = já fui
  // (abre logo a experiência para avaliar). Define o comportamento pós-adição.
  // "quero" | "fui" — o último passo do formulário.
  let escolha = "quero";
  let pendingGeoConfirm = false; // second submit click confirms an out-of-region pin

  function slugify(text) {
    return text
      .toString()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function init() {
    modal = document.getElementById("add-restaurant-modal");
    form = document.getElementById("add-restaurant-form");
    closeBtn = document.getElementById("add-modal-close");
    locateBtn = document.getElementById("form-locate-btn");
    locateStatus = document.getElementById("form-locate-status");
    copyJsonBtn = document.getElementById("form-copy-json-btn");
    submitBtn = document.getElementById("form-submit-btn");
    statusEl = document.getElementById("form-status");

    nameInput = document.getElementById("form-name");
    townInput = document.getElementById("form-town");
    regionInput = document.getElementById("form-region");
    categorySelect = document.getElementById("form-category");
    notesInput = document.getElementById("form-notes");
    stylesWrap = document.getElementById("form-styles");
    if (stylesWrap && typeof STYLES !== "undefined") {
      stylesWrap.innerHTML = "";
      Object.entries(STYLES).forEach(([key, st]) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.dataset.styleKey = key;
        chip.textContent = st.label;
        chip.setAttribute("aria-pressed", "false");
        chip.addEventListener("click", () =>
          chip.setAttribute("aria-pressed", chip.getAttribute("aria-pressed") === "true" ? "false" : "true"));
        stylesWrap.appendChild(chip);
      });
    }
    latInput = document.getElementById("form-lat");
    lngInput = document.getElementById("form-lng");

    titleEl = modal.querySelector(".modal-title");
    introEl = modal.querySelector(".modal-intro");
    // A porta única: o "+" da barra de cima. Serve o mapa e a lista, e é o
    // único sítio da app que abre este formulário.
    const abrir = document.getElementById("add-open-btn");
    if (abrir) abrir.addEventListener("click", () => open());
    document.querySelectorAll("#add-restaurant-modal [data-escolha]").forEach((b) =>
      b.addEventListener("click", () => { escolha = b.dataset.escolha; pintarEscolha(); }));
    modal.querySelectorAll("[data-close-modal]").forEach((el) => el.addEventListener("click", close));

    locateBtn.addEventListener("click", manualLocate);
    copyJsonBtn.addEventListener("click", copyAsJson);
    form.addEventListener("submit", onSubmit);

    // AI: suggest a category + specialty from the name/town (signed-in only).
    aiSuggestBtn = document.getElementById("form-ai-suggest-btn");
    if (aiSuggestBtn && typeof AIModule !== "undefined" && AIModule.available()) {
      aiSuggestBtn.classList.remove("hidden");
      aiSuggestBtn.addEventListener("click", aiSuggest);
    }
  }

  async function aiSuggest() {
    if (!nameInput.value.trim()) { locateStatus.textContent = "Indique o nome primeiro."; return; }
    if (typeof UserData === "undefined" || !UserData.isCloud()) return;
    aiSuggestBtn.disabled = true;
    const prev = aiSuggestBtn.innerHTML;
    aiSuggestBtn.innerHTML = "A sugerir…";
    try {
      const out = await AIModule.categorize({
        name: nameInput.value.trim(),
        town: townInput.value.trim(),
        googleTypes: []
      });
      if (out && out.cuisine) categorySelect.value = out.cuisine;
      if (out && Array.isArray(out.styles) && stylesWrap) {
        stylesWrap.querySelectorAll("[data-style-key]").forEach((c) =>
          c.setAttribute("aria-pressed", String(out.styles.includes(c.dataset.styleKey))));
      }
      if (out && out.specialty && !notesInput.value.trim()) notesInput.value = out.specialty;
    } catch (e) {
      locateStatus.textContent = e.message;
    }
    aiSuggestBtn.innerHTML = prev;
    aiSuggestBtn.disabled = false;
  }

  // Uma porta só.
  //
  // Havia dois botões na cabeça da lista — "Wishlist" e "Já fui" — e obrigavam
  // a escolher ANTES de escrever o nome, quando a escolha é sobre o sítio e só
  // se sabe depois de o ter à frente. Passou a haver um "+" na barra de cima,
  // que serve o mapa e a lista, e a escolha é o último campo do formulário.
  //
  // O `open()` deixa de receber modo. Fica sem parâmetros de propósito: o modo
  // era a única coisa que os dois botões diziam de diferente.
  function open() {
    pendingGeoConfirm = false;
    escolha = "quero";
    pintarEscolha();
    modal.classList.remove("hidden");
    statusEl.textContent = "";
    statusEl.className = "form-status";
    // O `focus()` era imediato, e por isso o teclado subia no mesmo instante em
    // que o modal aparecia — o cartão nascia já arrastado para fora do ecrã pelo
    // topo, com o título debaixo da Dynamic Island. Não era preciso arrastar
    // nada para o defeito aparecer: bastava abrir.
    //
    // Adiado para depois da animação de entrada (0.2s no `.modal-card`), para o
    // cartão assentar primeiro e só então o teclado subir. Continua a poupar um
    // toque a quem já sabe o que vai escrever.
    setTimeout(() => { try { nameInput.focus({ preventScroll: true }); } catch (e) { nameInput.focus(); } }, 260);
  }

  function close() {
    modal.classList.add("hidden");
    form.reset();
    pendingGeoConfirm = false;
    escolha = "quero";
    pintarEscolha();
    regionInput.value = "";
    locateStatus.textContent = "";
    statusEl.textContent = "";
    statusEl.className = "form-status";
  }

  // O texto do botão depende de duas coisas que mudam em momentos diferentes: a
  // escolha, e o aviso do GeoValidate (que troca o botão para "Guardar mesmo
  // assim" e ficava pendurado até ao open() seguinte). Recalcular num sítio só
  // é o que evita as duas ficarem a discutir.
  function pintarEscolha() {
    const fui = escolha === "fui";
    document.querySelectorAll("#add-restaurant-modal [data-escolha]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.escolha === escolha));
    });
    const dica = document.querySelector("#add-restaurant-modal [data-escolha-hint]");
    if (dica) dica.textContent = fui
      ? "Fica marcado como visitado, e podes avaliar a seguir."
      : "Fica marcado como prioritário no mapa.";
    if (submitBtn && !pendingGeoConfirm) {
      submitBtn.textContent = fui ? "Adicionar e avaliar" : "Adicionar à lista";
    }
  }

  function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = "form-status" + (type ? " " + type : "");
  }

  // Advanced "Encontrar localização" button — fills the coord fields so the
  // user can see/adjust them before saving.
  async function manualLocate() {
    if (!nameInput.value || !townInput.value) {
      locateStatus.textContent = "Indique o nome e a localidade primeiro.";
      return;
    }
    locateStatus.textContent = "A procurar...";
    const coords = await Geocode.locate(nameInput.value.trim(), townInput.value.trim(), regionInput.value.trim());
    if (coords) {
      latInput.value = coords.lat.toFixed(5);
      lngInput.value = coords.lng.toFixed(5);
      if (coords.region && !regionInput.value.trim()) regionInput.value = coords.region;
      locateStatus.textContent = coords.region ? `Localização encontrada · ${coords.region}` : "Localização encontrada ✓";
    } else {
      locateStatus.textContent = "Não encontrado. Preenche as coordenadas manualmente.";
    }
  }

  function buildRestaurantFromForm(coords) {
    const name = nameInput.value.trim();
    const town = townInput.value.trim();
    const inferredRegion = typeof Geocode !== "undefined" ? Geocode.regionForTown(town) : null;
    // Country comes from geocoding; Portugal only as the last resort. Foreign
    // places use their country as the region, so they group and filter naturally.
    const country = (coords && coords.country) || "Portugal";
    const foreign = typeof Geocode !== "undefined" && Geocode.isPortugal ? !Geocode.isPortugal(country) : false;
    const region = regionInput.value.trim() || (coords && coords.region) || (foreign ? country : inferredRegion) || "Portugal";
    const cuisine = categorySelect.value; // the select now holds the CUISINE
    const styles = stylesWrap
      ? [...stylesWrap.querySelectorAll('[data-style-key][aria-pressed="true"]')].map((c) => c.dataset.styleKey)
      : [];
    const category = typeof legacyCategoryFor === "function" ? legacyCategoryFor(cuisine, styles) : "tradicional";
    const notes = notesInput.value.trim();
    const lat = coords ? coords.lat : parseFloat(latInput.value);
    const lng = coords ? coords.lng : parseFloat(lngInput.value);

    return {
      id: `${slugify(name)}-${slugify(town)}`,
      name,
      town,
      region,
      country,
      category,
      cuisine,
      styles,
      lat: isNaN(lat) ? null : lat,
      lng: isNaN(lng) ? null : lng,
      notes,
      tags: [cuisine].concat(styles),
      mapsQuery: `${name}, ${town}, ${country}`
    };
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!nameInput.value.trim() || !townInput.value.trim()) {
      setStatus("Indique o nome e a localidade.", "error");
      return;
    }

    submitBtn.disabled = true;

    try {
      // Use the coordinates if the user already filled them in (advanced),
      // otherwise look them up automatically.
      let coords = null;
      const lat = parseFloat(latInput.value);
      const lng = parseFloat(lngInput.value);
      if (!isNaN(lat) && !isNaN(lng)) {
        coords = { lat, lng };
      } else {
        setStatus("A localizar no mapa...", "info");
        coords = await Geocode.locate(nameInput.value.trim(), townInput.value.trim(), regionInput.value.trim());
      }

      if (!coords) {
        setStatus(
          "Não foi possível encontrar essa localização. Tente uma cidade mais específica ou abra as \"Opções avançadas\".",
          "error"
        );
        submitBtn.disabled = false;
        return;
      }

      // Geo sanity-check: warn (once) if the pin falls outside the region the
      // place will be filed under. The effective region mirrors buildRestaurantFromForm.
      if (!pendingGeoConfirm && typeof GeoValidate !== "undefined") {
        const effectiveRegion = regionInput.value.trim()
          || (coords && coords.region)
          || (typeof Geocode !== "undefined" && Geocode.regionForTown ? (Geocode.regionForTown(townInput.value.trim()) || "") : "");
        try {
          const check = GeoValidate.isWithinRegion(effectiveRegion, coords.lat, coords.lng, coords.country);
          if (check && !check.ok) {
            const where = effectiveRegion || coords.country || "Portugal";
            setStatus(`Esta localização parece estar fora de ${where}. Carrega novamente para guardar mesmo assim.`, "warning");
            pendingGeoConfirm = true;
            // Depois do pintarEscolha(), senão a escolha voltava a escrever o
            // texto por cima deste. Os dois escrevem no mesmo botão.
            submitBtn.textContent = "Guardar mesmo assim";
            submitBtn.disabled = false;
            return;
          }
        } catch (e) { /* fail-open: never block saving on a validation error */ }
      }

      const restaurant = buildRestaurantFromForm(coords);

      // "comunidade" tag only when Google has no real match for the place.
      // If Google Maps has rating/reviews/photos/phone, treat it as verified.
      restaurant.verified = false;
      if (typeof PlacesModule !== "undefined" && PlacesModule.isAvailable()) {
        setStatus("A verificar no Google…", "info");
        try {
          const d = await PlacesModule.fetchDetails(restaurant);
          restaurant.verified = !!(d && (d.rating || d.userRatingsTotal || d.phone || (d.photos && d.photos.length)));
        } catch (e) { /* keep unverified */ }
      }

      // Stamp "quem recomendou" when the person is signed in.
      const signedIn = typeof UserData !== "undefined" && UserData.isCloud();
      let token = null;
      if (signedIn) {
        const me = UserData.me();
        restaurant.addedByUid = me.uid;
        restaurant.addedByName = me.displayName;
        if (window.FirebaseAuth) {
          try { token = await window.FirebaseAuth.getToken(); } catch (e) { token = null; }
        }
      }

      // The shared list requires a signed-in author (Firestore rules enforce
      // addedByUid == auth.uid). Without a session, save locally instead.
      // Post-add behaviour depends on the CTA used.
      // "Já fui" passa a marcar VISITADO, que é o que a palavra promete. Até
      // aqui só abria a ficha e deixava a pessoa registar à mão — dizia uma
      // coisa e fazia outra. Decisão do dono, 25/08.
      const opts = escolha === "fui"
        ? { tab: "experiencia", visited: true }
        : { priority: true };
      if (DB.isAvailable() && signedIn) {
        setStatus("A guardar para todos...", "info");
        const saved = await DB.add(restaurant, token);
        App.onRestaurantAdded(saved, opts);
        setStatus(escolha === "fui" ? "Adicionado. Avalia a tua experiência." : "Adicionado à tua lista.", "success");
      } else {
        Storage.addCustomRestaurant(restaurant);
        App.onRestaurantAdded(restaurant, opts);
        setStatus(
          DB.isAvailable()
            ? "Guardado só neste navegador. Inicie sessão para partilhar com todos."
            : "Adicionado (guardado só neste navegador).",
          "success"
        );
      }

      setTimeout(close, 900);
    } catch (err) {
      setStatus("Algo correu mal: " + err.message, "error");
      submitBtn.disabled = false;
      return;
    }

    submitBtn.disabled = false;
  }

  function copyAsJson() {
    const restaurant = buildRestaurantFromForm();
    if (restaurant.lat === null || restaurant.lng === null) {
      locateStatus.textContent = 'Clica em "Encontrar localização" primeiro.';
      return;
    }
    const { id, name, town, region, category, lat, lng, notes, tags, mapsQuery } = restaurant;
    const json = JSON.stringify(
      { id, name, town, region, category, lat, lng, notes, tags, mapsQuery },
      null,
      2
    );

    navigator.clipboard
      .writeText(json)
      .then(() => {
        locateStatus.textContent = "JSON copiado! Cola em data/restaurants.json.";
      })
      .catch(() => {
        window.prompt("Copia este JSON:", json);
      });
  }

  return { init };
})();
