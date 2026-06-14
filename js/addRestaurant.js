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
    closeBtn.addEventListener("click", close);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });

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
    regionInput.value = "Alentejo";
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
      locateStatus.textContent = "Indica o nome e a localidade primeiro.";
      return;
    }
    locateStatus.textContent = "A procurar...";
    const coords = await Geocode.locate(nameInput.value.trim(), townInput.value.trim());
    if (coords) {
      latInput.value = coords.lat.toFixed(5);
      lngInput.value = coords.lng.toFixed(5);
      locateStatus.textContent = "Localização encontrada ✓";
    } else {
      locateStatus.textContent = "Não encontrado. Preenche as coordenadas manualmente.";
    }
  }

  function buildRestaurantFromForm(coords) {
    const name = nameInput.value.trim();
    const town = townInput.value.trim();
    const region = (regionInput.value || "Alentejo").trim();
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
      setStatus("Indica o nome e a localidade.", "error");
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
          "Não consegui encontrar essa localização. Tenta uma cidade mais específica, ou abre \"Opções avançadas\".",
          "error"
        );
        submitBtn.disabled = false;
        return;
      }

      const restaurant = buildRestaurantFromForm(coords);

      if (DB.isAvailable()) {
        setStatus("A guardar para todos...", "info");
        const saved = await DB.add(restaurant);
        App.onRestaurantAdded(saved);
        setStatus("Adicionado para todos! 🎉", "success");
      } else {
        Storage.addCustomRestaurant(restaurant);
        App.onRestaurantAdded(restaurant);
        setStatus("Adicionado (guardado só neste navegador).", "success");
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
