// "Add restaurant" modal. Designed so a non-technical person can add a place
// in seconds: type name + town + type, hit one button. We geocode in the
// background and save to the shared cloud list (Supabase) when it's set up,
// otherwise to the person's own browser. Coordinates/JSON live under
// "Opções avançadas" for the rare case the auto-location is off.

const AddRestaurantModule = (() => {
  let modal, form, closeBtn, locateBtn, locateStatus, copyJsonBtn, submitBtn, statusEl;
  let nameInput, townInput, regionInput, categorySelect, notesInput, latInput, lngInput;

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

    document.getElementById("add-restaurant-btn").addEventListener("click", open);
    modal.querySelectorAll("[data-close-modal]").forEach((el) => el.addEventListener("click", close));

    locateBtn.addEventListener("click", manualLocate);
    copyJsonBtn.addEventListener("click", copyAsJson);
    form.addEventListener("submit", onSubmit);
  }

  function open() {
    modal.classList.remove("hidden");
    statusEl.textContent = "";
    statusEl.className = "form-status";
    nameInput.focus();
  }

  function close() {
    modal.classList.add("hidden");
    form.reset();
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
    const coords = await Geocode.locate(nameInput.value.trim(), townInput.value.trim());
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
    // Prefer a region the user typed; else the one detected from geocoding; else fall back.
    const region = regionInput.value.trim() || (coords && coords.region) || "Alentejo";
    const category = categorySelect.value;
    const notes = notesInput.value.trim();
    const lat = coords ? coords.lat : parseFloat(latInput.value);
    const lng = coords ? coords.lng : parseFloat(lngInput.value);

    return {
      id: `${slugify(name)}-${slugify(town)}`,
      name,
      town,
      region,
      category,
      lat: isNaN(lat) ? null : lat,
      lng: isNaN(lng) ? null : lng,
      notes,
      tags: [category],
      mapsQuery: `${name}, ${town}, Portugal`
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
        coords = await Geocode.locate(nameInput.value.trim(), townInput.value.trim());
      }

      if (!coords) {
        setStatus(
          "Não foi possível encontrar essa localização. Tente uma cidade mais específica ou abra as \"Opções avançadas\".",
          "error"
        );
        submitBtn.disabled = false;
        return;
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
      if (DB.isAvailable() && signedIn) {
        setStatus("A guardar para todos...", "info");
        const saved = await DB.add(restaurant, token);
        App.onRestaurantAdded(saved);
        setStatus("Restaurante adicionado.", "success");
      } else {
        Storage.addCustomRestaurant(restaurant);
        App.onRestaurantAdded(restaurant);
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
