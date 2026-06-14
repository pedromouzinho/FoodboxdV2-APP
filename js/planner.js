// Trip planner: geocodes two place names, draws a driving route, and finds
// restaurants within a given distance of that route.

const PlannerModule = (() => {
  let geocoder = null;

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

  function routeBetween(origin, destination) {
    return new Promise((resolve, reject) => {
      MapModule.getDirectionsService().route(
        {
          origin,
          destination,
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

  async function findStops({ from, to, radiusKm, restaurants }) {
    if (!geocoder) {
      throw new Error("O planeador de viagem precisa do Google Maps ativo.");
    }

    const [origin, destination] = await Promise.all([geocodeAddress(from), geocodeAddress(to)]);
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

  function clear() {
    MapModule.clearRoute();
    MapModule.resetView();
  }

  return { init, isAvailable, findStops, clear };
})();
