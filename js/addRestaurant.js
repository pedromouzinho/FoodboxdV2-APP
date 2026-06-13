// "Add restaurant" modal: lets the user add a place to their own browser
// (via localStorage) and/or generate a JSON snippet to add it permanently
// to data/restaurants.json.

const AddRestaurantModule = (() => {
  let modal, form, closeBtn, locateBtn, locateStatus, copyJsonBtn;
  let nameInput, townInput, regionInput, categorySelect, notesInput, latInput, lngInput;
  let geocoder = null;

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

    nameInput = document.getElementById("form-name");
    townInput = document.getElementById("form-town");
    regionInput = document.getElementById("form-region");
    categorySelect = document.getElementById("form-category");
    notesInput = document.getElementById("form-notes");
    latInput = document.getElementById("form-lat");
    lngInput = document.getElementById("form-lng");

    if (MapModule.isAvailable()) {
      geocoder = new google.maps.Geocoder();
    }

    document.getElementById("add-restaurant-btn").addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });

    locateBtn.addEventListener("click", locate);
    copyJsonBtn.addEventListener("click", copyAsJson);
    form.addEventListener("submit", onSubmit);
  }

  function open() {
    modal.classList.remove("hidden");
  }

  function close() {
    modal.classList.add("hidden");
    form.reset();
    regionInput.value = "Alentejo";
    locateStatus.textContent = "";
  }

  function locate() {
    const query = `${nameInput.value}, ${townInput.value}, Portugal`.trim();
    if (!nameInput.value || !townInput.value) {
      locateStatus.textContent = "Indica o nome e a localidade primeiro.";
      return;
    }
    if (!geocoder) {
      locateStatus.textContent = "Localização automática precisa do Google Maps ativo. Preenche manualmente.";
      return;
    }

    locateStatus.textContent = "A procurar...";
    geocoder.geocode({ address: query }, (results, status) => {
      if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
        const loc = results[0].geometry.location;
        latInput.value = loc.lat().toFixed(5);
        lngInput.value = loc.lng().toFixed(5);
        locateStatus.textContent = "Localização encontrada ✓";
      } else {
        locateStatus.textContent = "Não encontrado. Preenche as coordenadas manualmente.";
      }
    });
  }

  function buildRestaurantFromForm() {
    const name = nameInput.value.trim();
    const town = townInput.value.trim();
    const region = regionInput.value.trim() || "Alentejo";
    const category = categorySelect.value;
    const notes = notesInput.value.trim();
    const lat = parseFloat(latInput.value);
    const lng = parseFloat(lngInput.value);

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

  function onSubmit(e) {
    e.preventDefault();
    const restaurant = buildRestaurantFromForm();

    if (restaurant.lat === null || restaurant.lng === null) {
      locateStatus.textContent = 'Sem coordenadas: clica em "Encontrar localização" ou preenche manualmente.';
      return;
    }

    Storage.addCustomRestaurant(restaurant);
    App.onCustomRestaurantAdded(restaurant);
    close();
  }

  function copyAsJson() {
    const restaurant = buildRestaurantFromForm();
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
        locateStatus.textContent = "Não foi possível copiar automaticamente.";
        window.prompt("Copia este JSON:", json);
      });
  }

  return { init };
})();
