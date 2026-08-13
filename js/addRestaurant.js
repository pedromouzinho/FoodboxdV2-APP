// "Add restaurant" modal. Designed so a non-technical person can add a place
// in seconds: type name + town + type, hit one button. We geocode in the
// background and save to the shared cloud list (Supabase) when it's set up,
// otherwise to the person's own browser. Coordinates/JSON live under
// "Opções avançadas" for the rare case the auto-location is off.

const AddRestaurantModule = (() => {
  let modal, form, closeBtn, locateBtn, locateStatus, copyJsonBtn, submitBtn, statusEl, aiSuggestBtn, titleEl, introEl;
  let nameInput, townInput, regionInput, categorySelect, notesInput, latInput, lngInput;
  // "wishlist" = um sítio onde quero ir (fica prioritário); "experience" = já fui
  // (abre logo a experiência para avaliar). Define o comportamento pós-adição.
  let mode = "wishlist";
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
    latInput = document.getElementById("form-lat");
    lngInput = document.getElementById("form-lng");

    titleEl = modal.querySelector(".modal-title");
    introEl = modal.querySelector(".modal-intro");
    const wishlistBtn = document.getElementById("add-wishlist-btn");
    const experienceBtn = document.getElementById("add-experience-btn");
    if (wishlistBtn) wishlistBtn.addEventListener("click", () => open("wishlist"));
    if (experienceBtn) experienceBtn.addEventListener("click", () => open("experience"));
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
      if (out && out.category) categorySelect.value = out.category;
      if (out && out.specialty && !notesInput.value.trim()) notesInput.value = out.specialty;
    } catch (e) {
      locateStatus.textContent = e.message;
    }
    aiSuggestBtn.innerHTML = prev;
    aiSuggestBtn.disabled = false;
  }

  function open(m) {
    mode = m === "experience" ? "experience" : "wishlist";
    pendingGeoConfirm = false;
    if (titleEl) titleEl.textContent = mode === "experience" ? "Adicionar experiência" : "Adicionar à wishlist";
    if (introEl) introEl.textContent = mode === "experience"
      ? "Um sítio onde já foste — depois avalias e registas a visita."
      : "Um sítio onde queres ir — fica marcado como prioritário.";
    if (submitBtn) submitBtn.textContent = mode === "experience" ? "Adicionar e avaliar" : "Adicionar à wishlist";
    modal.classList.remove("hidden");
    statusEl.textContent = "";
    statusEl.className = "form-status";
    nameInput.focus();
  }

  function close() {
    modal.classList.add("hidden");
    form.reset();
    pendingGeoConfirm = false;
    regionInput.value = "";
    locateStatus.textContent = "";
    statusEl.textContent = "";
    statusEl.className = "form-status";
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
    const category = categorySelect.value;
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
      lat: isNaN(lat) ? null : lat,
      lng: isNaN(lng) ? null : lng,
      notes,
      tags: [category],
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
      const opts = mode === "experience" ? { tab: "mem" } : { priority: true };
      if (DB.isAvailable() && signedIn) {
        setStatus("A guardar para todos...", "info");
        const saved = await DB.add(restaurant, token);
        App.onRestaurantAdded(saved, opts);
        setStatus(mode === "experience" ? "Adicionado. Avalia a tua experiência." : "Adicionado à wishlist.", "success");
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
