// Turns a restaurant name + town into coordinates so people never have to
// touch latitude/longitude. Tries Google's geocoder first (if the Maps key
// is configured); otherwise falls back to the free OpenStreetMap service.

const Geocode = (() => {
  let googleGeocoder = null;

  function init() {
    if (MapModule.isAvailable() && typeof google !== "undefined") {
      googleGeocoder = new google.maps.Geocoder();
    }
  }

  function viaGoogle(query) {
    return new Promise((resolve) => {
      googleGeocoder.geocode({ address: query }, (results, status) => {
        if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
          const loc = results[0].geometry.location;
          resolve({ lat: loc.lat(), lng: loc.lng() });
        } else {
          resolve(null);
        }
      });
    });
  }

  async function viaNominatim(query) {
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
      encodeURIComponent(query);
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (data && data[0]) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
    } catch (e) {
      /* ignore network/parse errors and fall through */
    }
    return null;
  }

  // Resolve coordinates for "name, town". Tries the most specific query first,
  // then falls back to just the town so we almost always land somewhere sane.
  async function locate(name, town) {
    const specific = `${name}, ${town}, Portugal`;
    const townOnly = `${town}, Portugal`;

    if (googleGeocoder) {
      return (await viaGoogle(specific)) || (await viaGoogle(townOnly));
    }
    return (await viaNominatim(specific)) || (await viaNominatim(townOnly));
  }

  return { init, locate };
})();
