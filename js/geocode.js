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

  // Map a Portuguese district (what geocoders return for the country) to the
  // app's region buckets (NUTS-II), so added places aren't all dumped in Alentejo.
  const REGION_BY_DISTRICT = {
    "faro": "Algarve",
    "beja": "Alentejo", "évora": "Alentejo", "evora": "Alentejo", "portalegre": "Alentejo",
    "setúbal": "Lisboa", "setubal": "Lisboa", "lisboa": "Lisboa", "lisbon": "Lisboa",
    "santarém": "Centro", "santarem": "Centro", "leiria": "Centro", "coimbra": "Centro",
    "aveiro": "Centro", "viseu": "Centro", "guarda": "Centro",
    "castelo branco": "Centro", "castelo-branco": "Centro",
    "porto": "Norte", "oporto": "Norte", "braga": "Norte", "viana do castelo": "Norte",
    "vila real": "Norte", "bragança": "Norte", "braganca": "Norte",
    "madeira": "Madeira", "região autónoma da madeira": "Madeira",
    "açores": "Açores", "azores": "Açores", "região autónoma dos açores": "Açores"
  };
  const REGION_BY_TOWN = {
    "altura": "Algarve",
    "guia": "Algarve",
    "oura": "Algarve",
    "vila real de santo antónio": "Algarve",
    "vila real de santo antonio": "Algarve",
    "cascais": "Lisboa",
    "linhó": "Lisboa",
    "linho": "Lisboa",
    "lisboa": "Lisboa",
    "setúbal": "Lisboa",
    "setubal": "Lisboa",
    "trafaria": "Lisboa",
    "maia": "Norte",
    "viseu": "Centro",
    "arraiolos": "Alentejo",
    "campinho": "Alentejo",
    "cercal do alentejo": "Alentejo",
    "évora": "Alentejo",
    "evora": "Alentejo",
    "montemor-o-novo": "Alentejo",
    "mourão": "Alentejo",
    "mourao": "Alentejo",
    "reguengos de monsaraz": "Alentejo",
    "valverde": "Alentejo"
  };
  function normalizePlaceName(name) {
    return String(name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }
  function regionForDistrict(name) {
    if (!name) return null;
    const key = normalizePlaceName(name);
    return REGION_BY_DISTRICT[key] || name; // fall back to the district name itself
  }
  function regionForTown(name) {
    if (!name) return null;
    const key = normalizePlaceName(name);
    if (REGION_BY_TOWN[key]) return REGION_BY_TOWN[key];
    const parts = key.split(",").map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      if (REGION_BY_TOWN[part]) return REGION_BY_TOWN[part];
    }
    return Object.entries(REGION_BY_TOWN).find(([town]) => key.includes(town))?.[1] || null;
  }
  function regionFromComponents(components) {
    if (!components) return null;
    const admin1 = components.find((c) => (c.types || []).includes("administrative_area_level_1"));
    if (!admin1) return null;
    return regionForDistrict(admin1.long_name || admin1.short_name);
  }

  function viaGoogle(query) {
    return new Promise((resolve) => {
      googleGeocoder.geocode({ address: query }, (results, status) => {
        if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
          const loc = results[0].geometry.location;
          resolve({ lat: loc.lat(), lng: loc.lng(), region: regionFromComponents(results[0].address_components) || regionForTown(query) });
        } else {
          resolve(null);
        }
      });
    });
  }

  async function viaNominatim(query) {
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=" +
      encodeURIComponent(query);
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (data && data[0]) {
        const a = data[0].address || {};
        const district = a.state || a.county || a.region || a.state_district || "";
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), region: regionForDistrict(district) || regionForTown(query) };
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

  return { init, locate, regionForTown };
})();
