// Google Maps wrapper: map init, markers, info windows, route drawing.
// If no API key is configured, `available` stays false and every method
// becomes a harmless no-op so the rest of the app keeps working.

const MapModule = (() => {
  let map = null;
  let infoWindow = null;
  let directionsRenderer = null;
  let directionsService = null;
  let markers = new Map(); // id -> google.maps.Marker
  let available = false;

  const PORTUGAL_CENTER = { lat: 38.55, lng: -7.95 };

  function init({ googleMapsLoaded }) {
    const banner = document.getElementById("map-banner");

    if (!googleMapsLoaded || typeof google === "undefined") {
      banner.classList.remove("hidden");
      available = false;
      return;
    }

    banner.classList.add("hidden");
    available = true;

    map = new google.maps.Map(document.getElementById("map"), {
      center: PORTUGAL_CENTER,
      zoom: 9,
      mapTypeControl: false,
      streetViewControl: false
    });

    infoWindow = new google.maps.InfoWindow();
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      polylineOptions: { strokeColor: "#b5651d", strokeWeight: 4, strokeOpacity: 0.7 }
    });
  }

  function isAvailable() {
    return available;
  }

  const PIN_PATH = "M12 0C7 0 3 4 3 9c0 6.6 9 15 9 15s9-8.4 9-15c0-5-4-9-9-9z";
  const PRIORITY_COLOR = "#b5531f"; // --primary, same as the "Prioritário" badge

  // The pin carries three things at once: category (colour), whether you've been
  // (filled vs hollow) and whether it's on your wishlist (corner badge). Drawn as
  // an inline SVG rather than a Maps symbol + text label, so it renders the same
  // on every platform.
  function getMarkerIcon(category, visited, priority) {
    const color = (CUISINES[category] && CUISINES[category].hex) || "#555555";
    const fill = visited ? color : "#ffffff";
    const stroke = visited ? "#ffffff" : color;
    const width = visited ? 2 : 2.5;
    const badge = priority
      ? `<circle cx="20" cy="6" r="5" fill="${PRIORITY_COLOR}" stroke="#ffffff" stroke-width="1.6"/>`
      : "";
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26" width="39" height="39">` +
      `<g transform="translate(1,1)"><path d="${PIN_PATH}" fill="${fill}" stroke="${stroke}" ` +
      `stroke-width="${width}" stroke-linejoin="round"/></g>${badge}</svg>`;
    return {
      url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
      scaledSize: new google.maps.Size(39, 39),
      anchor: new google.maps.Point(19.5, 37.5) // the pin's tip
    };
  }

  // What you still have to do sits above what you've already done.
  function markerZIndex(visited, priority) {
    return priority ? 3 : (visited ? 1 : 2);
  }

  // The marks live in UserData (cloud when signed in, localStorage otherwise) —
  // reading Storage directly here used to show a stale state for signed-in users.
  function markStateOf(id) {
    if (typeof UserData === "undefined") return { visited: Storage.isVisited(id), priority: false };
    return { visited: UserData.isVisited(id), priority: UserData.isPriority(id) };
  }

  function highlightMarker(id) {
    if (!available) return;
    const marker = markers.get(id);
    if (!marker) return;
    marker.setAnimation(google.maps.Animation.BOUNCE);
    setTimeout(() => marker.setAnimation(null), 700);
  }

  function renderMarkers(restaurants, onClick) {
    if (!available) return;

    markers.forEach((marker) => marker.setMap(null));
    markers.clear();

    restaurants.forEach((restaurant) => {
      const { visited, priority } = markStateOf(restaurant.id);
      const marker = new google.maps.Marker({
        position: { lat: restaurant.lat, lng: restaurant.lng },
        map,
        title: restaurant.name,
        icon: getMarkerIcon(typeof cuisineOf === "function" ? cuisineOf(restaurant) : restaurant.category, visited, priority),
        zIndex: markerZIndex(visited, priority)
      });
      marker.addListener("click", () => onClick(restaurant));
      markers.set(restaurant.id, marker);
    });
  }

  // ---- Temporary search results (the map magnifier) ----
  // Deliberately different from your own pins: grey, hollow, dashed, and on top —
  // they are places you are only LOOKING at, and vanish when the search closes.
  let searchMarkers = [];
  function searchMarkerIcon() {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26" width="34" height="34">` +
      `<g transform="translate(1,1)"><path d="${PIN_PATH}" fill="#ffffff" stroke="#6b6259" ` +
      `stroke-width="2" stroke-dasharray="3 2.4" stroke-linejoin="round"/></g>` +
      `<circle cx="12" cy="10" r="2.6" fill="#6b6259"/></svg>`;
    return {
      url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
      scaledSize: new google.maps.Size(34, 34),
      anchor: new google.maps.Point(17, 32.7)
    };
  }
  function setSearchMarkers(places, onClick) {
    if (!available) return;
    clearSearchMarkers();
    (places || []).forEach((p) => {
      if (typeof p.lat !== "number") return;
      const marker = new google.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map, title: p.name, icon: searchMarkerIcon(), zIndex: 10
      });
      marker.addListener("click", () => onClick && onClick(p));
      searchMarkers.push(marker);
    });
  }
  function clearSearchMarkers() {
    searchMarkers.forEach((m) => m.setMap(null));
    searchMarkers = [];
  }
  // Centre + a radius that covers what's actually on screen, so "search this area"
  // means this area.
  function getViewport() {
    if (!available || !map) return null;
    const c = map.getCenter();
    if (!c) return null;
    const b = map.getBounds();
    let radiusKm = 5;
    if (b) {
      const ne = b.getNorthEast();
      const dLat = Math.abs(ne.lat() - c.lat()) * 111;
      const dLng = Math.abs(ne.lng() - c.lng()) * 111 * Math.cos((c.lat() * Math.PI) / 180);
      radiusKm = Math.max(1, Math.min(50, Math.sqrt(dLat * dLat + dLng * dLng)));
    }
    return { lat: c.lat(), lng: c.lng(), radiusKm };
  }

  function panTo(lat, lng) {
    if (!available || typeof lat !== "number") return;
    map.panTo({ lat, lng });
  }

  function setMarkerState(id, category, state) {
    if (!available) return;
    const marker = markers.get(id);
    if (!marker) return;
    const visited = !!(state && state.visited);
    const priority = !!(state && state.priority);
    marker.setIcon(getMarkerIcon(category, visited, priority));
    marker.setZIndex(markerZIndex(visited, priority));
  }

  function openInfoWindow(restaurant, contentHtml, onDomReady) {
    if (!available) return;
    const marker = markers.get(restaurant.id);
    if (!marker) return;

    infoWindow.setContent(contentHtml);
    if (onDomReady) {
      google.maps.event.clearListeners(infoWindow, "domready");
      infoWindow.addListener("domready", () => onDomReady(infoWindow.getContent()));
    }
    infoWindow.open(map, marker);
  }

  function focusRestaurant(restaurant) {
    if (!available) return;
    map.panTo({ lat: restaurant.lat, lng: restaurant.lng });
    map.setZoom(13);
  }

  // Remember the current camera so we can return to it later (e.g. after the
  // user closes a restaurant's detail). Restore clears the saved state.
  let savedCamera = null;
  function saveCamera() {
    if (!available) return;
    savedCamera = { center: map.getCenter(), zoom: map.getZoom() };
  }
  function restoreCamera() {
    if (!available || !savedCamera) return;
    map.panTo(savedCamera.center);
    map.setZoom(savedCamera.zoom);
    savedCamera = null;
  }

  function getDirectionsService() {
    return directionsService;
  }

  function drawRoute(result) {
    if (!available) return;
    directionsRenderer.setDirections(result);
  }

  function clearRoute() {
    if (!available) return;
    directionsRenderer.setDirections({ routes: [] });
  }

  function fitToRoute(bounds) {
    if (!available) return;
    map.fitBounds(bounds);
  }

  function resetView() {
    if (!available) return;
    map.setCenter(PORTUGAL_CENTER);
    map.setZoom(9);
  }

  function getMap() {
    return map;
  }

  return {
    init,
    isAvailable,
    getMap,
    highlightMarker,
    renderMarkers,
    setMarkerState,
    setSearchMarkers,
    clearSearchMarkers,
    getViewport,
    panTo,
    openInfoWindow,
    focusRestaurant,
    saveCamera,
    restoreCamera,
    getDirectionsService,
    drawRoute,
    clearRoute,
    fitToRoute,
    resetView
  };
})();
