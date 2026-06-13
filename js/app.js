// Main app: loads data, renders the sidebar list + map markers, and wires
// up search, filters, visited tracking, "pick for me" and the trip planner.

const CATEGORIES = {
  tradicional: { label: "Tradicional / Tasca", color: "#a0522d" },
  petiscos: { label: "Petiscos", color: "#d62828" },
  pastelaria: { label: "Pastelaria / Doces", color: "#d6336c" },
  "fine-dining": { label: "Fine Dining", color: "#2d6a4f" }
};

const App = (() => {
  const state = {
    restaurants: []
  };

  function googleMapsUrl(restaurant) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.mapsQuery)}`;
  }

  function directionsUrl(restaurant) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(restaurant.mapsQuery)}`;
  }

  function categoryFor(restaurant) {
    return CATEGORIES[restaurant.category] || { label: restaurant.category, color: "#999999" };
  }

  // ---- Filters ----

  function buildRegionFilters() {
    const regions = [...new Set(state.restaurants.map((r) => r.region))].sort();
    const container = document.getElementById("region-filters");
    const existing = new Set([...container.querySelectorAll("input")].map((cb) => cb.dataset.region));

    regions.forEach((region) => {
      if (existing.has(region)) return;
      const label = document.createElement("label");
      label.className = "checkbox-row";
      label.innerHTML = `<input type="checkbox" checked data-region="${region}"> ${region}`;
      container.appendChild(label);
      label.querySelector("input").addEventListener("change", render);
    });
  }

  function buildCategoryFilters() {
    const container = document.getElementById("category-filters");
    Object.entries(CATEGORIES).forEach(([key, cat]) => {
      const label = document.createElement("label");
      label.className = "checkbox-row";
      label.innerHTML = `<input type="checkbox" checked data-category="${key}"> <span class="color-dot" style="background:${cat.color}"></span> ${cat.label}`;
      container.appendChild(label);
      label.querySelector("input").addEventListener("change", render);
    });
  }

  function getSelectedValues(containerId, dataAttr) {
    return [...document.querySelectorAll(`#${containerId} input:checked`)].map((cb) => cb.dataset[dataAttr]);
  }

  function getFilteredRestaurants() {
    const regions = getSelectedValues("region-filters", "region");
    const categories = getSelectedValues("category-filters", "category");
    const search = document.getElementById("search-input").value.trim().toLowerCase();
    const hideVisited = document.getElementById("hide-visited-checkbox").checked;

    return state.restaurants.filter((r) => {
      if (!regions.includes(r.region)) return false;
      if (!categories.includes(r.category)) return false;
      if (hideVisited && Storage.isVisited(r.id)) return false;
      if (search) {
        const haystack = [r.name, r.town, r.notes, ...(r.tags || [])].join(" ").toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  // ---- Rendering ----

  function render() {
    const filtered = getFilteredRestaurants();
    renderList(filtered);
    MapModule.renderMarkers(filtered, onSelectRestaurant);
    updateVisitedCounter();
  }

  function renderList(restaurants) {
    const container = document.getElementById("restaurant-list");
    container.innerHTML = "";

    if (restaurants.length === 0) {
      const empty = document.createElement("p");
      empty.style.padding = "1rem";
      empty.style.color = "var(--text-muted)";
      empty.textContent = "Nenhum restaurante encontrado.";
      container.appendChild(empty);
      return;
    }

    const grouped = {};
    restaurants.forEach((r) => {
      grouped[r.region] = grouped[r.region] || [];
      grouped[r.region].push(r);
    });

    Object.keys(grouped)
      .sort()
      .forEach((region) => {
        const heading = document.createElement("div");
        heading.className = "region-heading";
        heading.textContent = `${region} (${grouped[region].length})`;
        container.appendChild(heading);
        grouped[region].forEach((r) => container.appendChild(buildCard(r)));
      });
  }

  function buildCard(restaurant) {
    const visited = Storage.isVisited(restaurant.id);
    const cat = categoryFor(restaurant);

    const card = document.createElement("div");
    card.className = "restaurant-card" + (visited ? " visited" : "");
    card.dataset.id = restaurant.id;
    card.innerHTML = `
      <span class="card-marker color-dot" style="background:${cat.color}"></span>
      <div class="card-body">
        <div class="card-title">${restaurant.name} <span class="card-badge">${cat.label}</span></div>
        <div class="card-town">${restaurant.town} · ${restaurant.region}</div>
        ${restaurant.notes ? `<div class="card-notes">${restaurant.notes}</div>` : ""}
        <div class="places-info"></div>
        <div class="card-links">
          <a href="${googleMapsUrl(restaurant)}" target="_blank" rel="noopener">Abrir no Google Maps</a>
          <label class="visited-checkbox">
            <input type="checkbox" ${visited ? "checked" : ""} data-visited-id="${restaurant.id}"> Visitado
          </label>
        </div>
      </div>
    `;

    card.addEventListener("click", (e) => {
      if (e.target.closest("a") || e.target.closest("label")) return;
      onSelectRestaurant(restaurant);
    });

    card.querySelector("[data-visited-id]").addEventListener("change", (e) => {
      setVisited(restaurant.id, e.target.checked);
    });

    if (PlacesModule.isAvailable()) {
      PlacesModule.enrich(restaurant, card.querySelector(".places-info"));
    }

    return card;
  }

  function buildInfoWindowContent(restaurant) {
    const visited = Storage.isVisited(restaurant.id);
    const cat = categoryFor(restaurant);

    return `
      <div style="max-width:220px;font-family:inherit;">
        <strong>${restaurant.name}</strong><br/>
        <span style="color:#756f65;font-size:0.85em;">${restaurant.town} · ${cat.label}</span>
        ${restaurant.notes ? `<p style="margin:0.4em 0;font-size:0.9em;">${restaurant.notes}</p>` : ""}
        <div class="places-info"></div>
        <div style="margin-top:0.5em;display:flex;flex-direction:column;gap:0.3em;">
          <a href="${googleMapsUrl(restaurant)}" target="_blank" rel="noopener">Abrir no Google Maps</a>
          <a href="${directionsUrl(restaurant)}" target="_blank" rel="noopener">Direções</a>
          <label style="font-size:0.85em;">
            <input type="checkbox" data-visited-id="${restaurant.id}" ${visited ? "checked" : ""}> Visitado
          </label>
        </div>
      </div>
    `;
  }

  function highlightCard(id) {
    document.querySelectorAll(".restaurant-card").forEach((card) => {
      card.classList.toggle("highlighted", card.dataset.id === id);
    });
    const card = document.querySelector(`.restaurant-card[data-id="${id}"]`);
    if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function onSelectRestaurant(restaurant) {
    MapModule.focusRestaurant(restaurant);

    const content = buildInfoWindowContent(restaurant);
    MapModule.openInfoWindow(restaurant, content, (containerEl) => {
      const checkbox = containerEl.querySelector("[data-visited-id]");
      if (checkbox) {
        checkbox.addEventListener("change", (e) => setVisited(restaurant.id, e.target.checked));
      }
      if (PlacesModule.isAvailable()) {
        PlacesModule.enrich(restaurant, containerEl.querySelector(".places-info"));
      }
    });

    highlightCard(restaurant.id);
  }

  function setVisited(id, visited) {
    Storage.setVisited(id, visited);
    const restaurant = state.restaurants.find((r) => r.id === id);

    if (document.getElementById("hide-visited-checkbox").checked) {
      render();
      return;
    }

    if (restaurant) MapModule.setMarkerVisited(id, restaurant.category, visited);

    const card = document.querySelector(`.restaurant-card[data-id="${id}"]`);
    if (card) {
      card.classList.toggle("visited", visited);
      const cb = card.querySelector("[data-visited-id]");
      if (cb) cb.checked = visited;
    }

    updateVisitedCounter();
  }

  function updateVisitedCounter() {
    const total = state.restaurants.length;
    const visited = state.restaurants.filter((r) => Storage.isVisited(r.id)).length;
    document.getElementById("visited-counter").textContent = `${visited} / ${total} visitados`;
  }

  function pickRandom() {
    const filtered = getFilteredRestaurants();
    const unvisited = filtered.filter((r) => !Storage.isVisited(r.id));
    const pool = unvisited.length > 0 ? unvisited : filtered;

    if (pool.length === 0) {
      document.getElementById("planner-status").textContent =
        "Nenhum restaurante corresponde aos filtros atuais.";
      return;
    }

    const choice = pool[Math.floor(Math.random() * pool.length)];
    onSelectRestaurant(choice);
  }

  // ---- Trip planner ----

  function wirePlanner() {
    const radiusInput = document.getElementById("planner-radius");
    const radiusValue = document.getElementById("planner-radius-value");
    radiusInput.addEventListener("input", () => {
      radiusValue.textContent = radiusInput.value;
    });

    document.getElementById("planner-find-btn").addEventListener("click", async () => {
      const from = document.getElementById("planner-from").value.trim();
      const to = document.getElementById("planner-to").value.trim();
      const status = document.getElementById("planner-status");
      const resultsList = document.getElementById("planner-results");

      resultsList.innerHTML = "";

      if (!from || !to) {
        status.textContent = "Indica o ponto de partida e o destino.";
        return;
      }

      if (!PlannerModule.isAvailable()) {
        status.textContent = "O planeador precisa do Google Maps ativo (ver mapa).";
        return;
      }

      status.textContent = "A calcular rota...";

      try {
        const radiusKm = parseInt(radiusInput.value, 10);
        const { stops } = await PlannerModule.findStops({
          from,
          to,
          radiusKm,
          restaurants: state.restaurants
        });

        if (stops.length === 0) {
          status.textContent = "Nenhum restaurante perto desta rota.";
          return;
        }

        status.textContent = `${stops.length} restaurante(s) perto da rota:`;
        stops.forEach(({ restaurant, distanceKm }) => {
          const li = document.createElement("li");
          li.innerHTML = `<strong>${restaurant.name}</strong> — ${restaurant.town}<br/><span class="planner-distance">${distanceKm.toFixed(
            1
          )} km da rota</span>`;
          li.addEventListener("click", () => onSelectRestaurant(restaurant));
          resultsList.appendChild(li);
        });
      } catch (err) {
        status.textContent = err.message;
      }
    });

    document.getElementById("planner-clear-btn").addEventListener("click", () => {
      PlannerModule.clear();
      document.getElementById("planner-status").textContent = "";
      document.getElementById("planner-results").innerHTML = "";
    });
  }

  // ---- Misc wiring ----

  function wireEvents() {
    document.getElementById("search-input").addEventListener("input", render);
    document.getElementById("hide-visited-checkbox").addEventListener("change", render);
    document.getElementById("pick-random-btn").addEventListener("click", pickRandom);

    document.getElementById("sidebar-toggle").addEventListener("click", () => {
      document.getElementById("sidebar").classList.toggle("open");
    });

    wirePlanner();
  }

  function onCustomRestaurantAdded(restaurant) {
    state.restaurants.push(restaurant);
    buildRegionFilters();
    render();
  }

  async function init(options) {
    MapModule.init(options);
    PlacesModule.init();
    PlannerModule.init();
    AddRestaurantModule.init();

    const response = await fetch("data/restaurants.json");
    const data = await response.json();
    state.restaurants = [...data, ...Storage.getCustomRestaurants()];

    buildRegionFilters();
    buildCategoryFilters();
    wireEvents();
    render();
  }

  return { init, onCustomRestaurantAdded };
})();
