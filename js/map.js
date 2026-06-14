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

  function getMarkerIcon(category, visited) {
    const color = (CATEGORIES[category] && CATEGORIES[category].color) || "#555555";
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: color,
      fillOpacity: visited ? 0.35 : 1,
      strokeColor: "#ffffff",
      strokeWeight: 2,
      scale: 9
    };
  }

  function getMarkerLabel(visited) {
    return visited ? { text: "✓", color: "#ffffff", fontSize: "11px", fontWeight: "bold" } : null;
  }

  function renderMarkers(restaurants, onClick) {
    if (!available) return;

    markers.forEach((marker) => marker.setMap(null));
    markers.clear();

    restaurants.forEach((restaurant) => {
      const visited = Storage.isVisited(restaurant.id);
      const marker = new google.maps.Marker({
        position: { lat: restaurant.lat, lng: restaurant.lng },
        map,
        title: restaurant.name,
        icon: getMarkerIcon(restaurant.category, visited),
        label: getMarkerLabel(visited)
      });
      marker.addListener("click", () => onClick(restaurant));
      markers.set(restaurant.id, marker);
    });
  }

  function setMarkerVisited(id, category, visited) {
    if (!available) return;
    const marker = markers.get(id);
    if (!marker) return;
    marker.setIcon(getMarkerIcon(category, visited));
    marker.setLabel(getMarkerLabel(visited));
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
    renderMarkers,
    setMarkerVisited,
    openInfoWindow,
    focusRestaurant,
    getDirectionsService,
    drawRoute,
    clearRoute,
    fitToRoute,
    resetView
  };
})();
