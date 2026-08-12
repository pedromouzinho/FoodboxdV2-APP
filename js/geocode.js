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

  // Resolve coordinates for "name, town". Ambiguous town names (e.g. "Oura"
  // exists in both Algarve and the north) used to land on the wrong one, so we
  // bias the query with the expected region (typed, or inferred from the town)
  // and prefer a result whose region actually matches it.
  async function locate(name, town, expectedRegion) {
    const known = (expectedRegion && expectedRegion.trim()) || regionForTown(town);
    const run = googleGeocoder ? viaGoogle : viaNominatim;
    const queries = [];
    if (known) {
      queries.push(`${name}, ${town}, ${known}, Portugal`);
      queries.push(`${town}, ${known}, Portugal`);
    }
    queries.push(`${name}, ${town}, Portugal`);
    queries.push(`${town}, Portugal`);

    let firstAny = null;
    for (const q of queries) {
      const res = await run(q);
      if (!res) continue;
      if (!firstAny) firstAny = res; // region-biased query comes first, so this is already a good guess
      if (!known) return res;
      if (res.region && normalizePlaceName(res.region) === normalizePlaceName(known)) return res;
    }
    if (firstAny && known && !firstAny.region) firstAny.region = known;
    return firstAny;
  }

  // Reverse-geocode coordinates into a usable area name ("Évora", "Setúbal") so
  // discovery searches can be anchored to where the user actually is.
  function reverse(lat, lng) {
    return new Promise((resolve) => {
      if (!googleGeocoder || typeof lat !== "number" || typeof lng !== "number") return resolve(null);
      googleGeocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status !== google.maps.GeocoderStatus.OK || !results || !results[0]) return resolve(null);
        const comps = results[0].address_components || [];
        const pick = (type) => {
          const c = comps.find((x) => (x.types || []).includes(type));
          return c ? c.long_name : "";
        };
        const town = pick("locality") || pick("postal_town") || pick("administrative_area_level_2") || "";
        const region = regionFromComponents(comps) || "";
        resolve({ town, region, label: [town, region].filter(Boolean).join(", ") });
      });
    });
  }

  return { init, locate, reverse, regionForTown };
})();
