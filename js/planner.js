// Trip planner: geocodes two place names, draws a driving route, and finds
// restaurants within a given distance of that route.

const PlannerModule = (() => {
  let geocoder = null;
  let currentOrigin = null;
  let currentDestination = null;

  function init() {
    if (!MapModule.isAvailable()) return;
    geocoder = new google.maps.Geocoder();
  }

  function isAvailable() {
    return !!geocoder;
  }

  function geocodeAddress(address) {
    return new Promise((resolve, reject) => {
      geocoder.geocode({ address: `${address}, Portugal` }, (results, status) => {
        if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
          resolve(results[0].geometry.location);
        } else {
          reject(new Error(`Não foi possível encontrar "${address}".`));
        }
      });
    });
  }

  function routeBetween(origin, destination, waypoints) {
    return new Promise((resolve, reject) => {
      MapModule.getDirectionsService().route(
        {
          origin,
          destination,
          waypoints: waypoints || [],
          travelMode: google.maps.TravelMode.DRIVING
        },
        (result, status) => {
          if (status === google.maps.DirectionsStatus.OK) {
            resolve(result);
          } else {
            reject(new Error("Não foi possível calcular a rota."));
          }
        }
      );
    });
  }

  // Sample points along the route every ~1km so distance-to-route checks
  // are reasonably accurate without heavy geometry.
  function sampleRoutePoints(path, stepMeters = 1000) {
    const points = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const segDist = google.maps.geometry.spherical.computeDistanceBetween(a, b);
      const steps = Math.max(1, Math.ceil(segDist / stepMeters));
      for (let s = 0; s <= steps; s++) {
        points.push(google.maps.geometry.spherical.interpolate(a, b, s / steps));
      }
    }
    return points;
  }

  function minDistanceMeters(point, routePoints) {
    let min = Infinity;
    for (const p of routePoints) {
      const d = google.maps.geometry.spherical.computeDistanceBetween(point, p);
      if (d < min) min = d;
    }
    return min;
  }

  function formatDistance(meters) {
    const km = meters / 1000;
    return `${km >= 100 ? Math.round(km) : km.toFixed(1)} km`;
  }

  function formatDuration(seconds) {
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }

  function routeSummary(result) {
    const legs = (result.routes[0] && result.routes[0].legs) || [];
    const meters = legs.reduce((sum, leg) => sum + ((leg.distance && leg.distance.value) || 0), 0);
    const seconds = legs.reduce((sum, leg) => sum + ((leg.duration && leg.duration.value) || 0), 0);
    return {
      distanceText: meters ? formatDistance(meters) : "",
      durationText: seconds ? formatDuration(seconds) : ""
    };
  }

  async function findStops({ from, to, radiusKm, restaurants }) {
    if (!geocoder) {
      throw new Error("O planeador de viagem precisa do Google Maps ativo.");
    }

    const [origin, destination] = await Promise.all([geocodeAddress(from), geocodeAddress(to)]);
    currentOrigin = origin;
    currentDestination = destination;
    const result = await routeBetween(origin, destination);

    MapModule.drawRoute(result);
    const bounds = result.routes[0].bounds;
    MapModule.fitToRoute(bounds);

    const routePoints = sampleRoutePoints(result.routes[0].overview_path);

    const stops = restaurants
      .map((restaurant) => {
        const point = new google.maps.LatLng(restaurant.lat, restaurant.lng);
        const distanceMeters = minDistanceMeters(point, routePoints);
        return { restaurant, distanceKm: distanceMeters / 1000 };
      })
      .filter((s) => s.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return { stops, bounds };
  }

  async function drawStopRoute(restaurant) {
    if (!currentOrigin || !currentDestination) {
      throw new Error("Calcule primeiro a viagem.");
    }
    const stop = new google.maps.LatLng(restaurant.lat, restaurant.lng);
    const result = await routeBetween(currentOrigin, currentDestination, [{ location: stop, stopover: true }]);
    MapModule.drawRoute(result);
    MapModule.fitToRoute(result.routes[0].bounds);
    return routeSummary(result);
  }

  function clear() {
    currentOrigin = null;
    currentDestination = null;
    MapModule.clearRoute();
    MapModule.resetView();
  }

  return { init, isAvailable, findStops, drawStopRoute, clear };
})();
