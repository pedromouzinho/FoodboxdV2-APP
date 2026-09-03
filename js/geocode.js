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
    // Geocoders wrap the district name ("Distrito de Évora", "Évora District") —
    // strip the wrapper so the lookup hits; the table covers every PT district.
    const key = normalizePlaceName(name)
      .replace(/^distrito d[eao]s? /, "")
      .replace(/^district of /, "")
      .replace(/ district$/, "");
    return REGION_BY_DISTRICT[key] || name.replace(/^Distrito d[eao]s? /i, "");
  }

  // Country names arrive in whatever language Google's locale picked ("Spain",
  // "España"…). Canonicalize to Portuguese so regions/filters never duplicate.
  const COUNTRY_PT = {
    "spain": "Espanha", "espana": "Espanha", "espagne": "Espanha",
    "france": "França", "francia": "França",
    "italy": "Itália", "italia": "Itália", "italie": "Itália",
    "germany": "Alemanha", "deutschland": "Alemanha", "alemania": "Alemanha",
    "united kingdom": "Reino Unido", "uk": "Reino Unido", "great britain": "Reino Unido",
    "netherlands": "Países Baixos", "the netherlands": "Países Baixos", "holland": "Países Baixos",
    "belgium": "Bélgica", "belgique": "Bélgica",
    "switzerland": "Suíça", "suisse": "Suíça",
    "austria": "Áustria", "osterreich": "Áustria",
    "morocco": "Marrocos", "maroc": "Marrocos", "marruecos": "Marrocos",
    "brazil": "Brasil", "brasil": "Brasil",
    "united states": "Estados Unidos", "usa": "Estados Unidos",
    "ireland": "Irlanda", "greece": "Grécia", "poland": "Polónia",
    "cape verde": "Cabo Verde", "cabo verde": "Cabo Verde",
    "andorra": "Andorra", "luxembourg": "Luxemburgo", "luxemburgo": "Luxemburgo"
  };
  function canonicalCountry(name) {
    if (!name) return name;
    const key = normalizePlaceName(name);
    if (key === "portugal") return "Portugal";
    return COUNTRY_PT[key] || name;
  }
  // Region labels stored by old clients can be raw districts or English country
  // names — bring them back to the app's buckets for display/filtering.
  function canonicalRegion(region) {
    if (!region) return region;
    const viaCountry = canonicalCountry(region);
    if (viaCountry !== region) return viaCountry;
    if (/^distrito d/i.test(normalizePlaceName(region)) || / district$/i.test(region)) {
      const mapped = regionForDistrict(region);
      if (mapped && REGION_BY_DISTRICT[normalizePlaceName(mapped)]) return REGION_BY_DISTRICT[normalizePlaceName(mapped)];
      if (mapped) {
        const k = normalizePlaceName(mapped);
        if (REGION_BY_DISTRICT[k]) return REGION_BY_DISTRICT[k];
        return mapped;
      }
    }
    return region;
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
  function countryFromComponents(components) {
    if (!components) return null;
    const c = components.find((x) => (x.types || []).includes("country"));
    return c ? canonicalCountry(c.long_name || c.short_name) : null;
  }
  function isPortugal(country) {
    const k = normalizePlaceName(country);
    return !k || k === "portugal";
  }
  // Portuguese places bucket into the app's NUTS-II regions; foreign ones use the
  // country itself as the region, so they group and filter without any new code.
  function regionFromComponents(components) {
    if (!components) return null;
    const country = countryFromComponents(components);
    if (!isPortugal(country)) return country;
    const admin1 = components.find((c) => (c.types || []).includes("administrative_area_level_1"));
    if (!admin1) return null;
    return regionForDistrict(admin1.long_name || admin1.short_name);
  }

  function viaGoogle(query) {
    return new Promise((resolve) => {
      googleGeocoder.geocode({ address: query }, (results, status) => {
        if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
          const loc = results[0].geometry.location;
          const comps = results[0].address_components;
          resolve({
            lat: loc.lat(), lng: loc.lng(),
            region: regionFromComponents(comps) || regionForTown(query),
            country: countryFromComponents(comps) || "",
            formatted: results[0].formatted_address || "",
            partial: results[0].partial_match === true
          });
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
        const country = canonicalCountry(a.country || "");
        return {
          lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon),
          region: (isPortugal(country) ? (regionForDistrict(district) || regionForTown(query)) : country),
          country,
          formatted: data[0].display_name || "",
          partial: false
        };
      }
    } catch (e) {
      /* ignore network/parse errors and fall through */
    }
    return null;
  }

  // Does this hit actually correspond to the town that was typed? Forcing a country
  // onto the query makes geocoders return a fuzzy match somewhere else entirely
  // ("Salamanca, Portugal" -> a field near Abrantes), so we check the answer instead
  // of trusting the first one back.
  function matchesTown(res, town) {
    const t = normalizePlaceName(town);
    if (!t) return true;
    const hay = normalizePlaceName(res && res.formatted);
    if (!hay) return !(res && res.partial);
    return hay.includes(t);
  }

  // Resolve coordinates for "name, town". Portugal is tried first (ambiguous towns
  // like "Oura" must not drift) but never forced: a result is only accepted when it
  // really is the town that was typed, so foreign places land where they belong.
  async function locate(name, town, expectedRegion) {
    const typed = (expectedRegion && expectedRegion.trim()) || "";
    const known = typed || regionForTown(town);
    const knownIsForeign = !!typed && !REGION_BY_DISTRICT[normalizePlaceName(typed)] && !isPortugal(typed);
    const run = googleGeocoder ? viaGoogle : viaNominatim;

    const queries = [];
    if (knownIsForeign) {
      // The person told us the country/region — trust it and skip the Portugal pass.
      queries.push(`${name}, ${town}, ${typed}`);
      queries.push(`${town}, ${typed}`);
    } else if (known) {
      queries.push(`${name}, ${town}, ${known}, Portugal`);
      queries.push(`${town}, ${known}, Portugal`);
    }
    queries.push(`${name}, ${town}, Portugal`);
    queries.push(`${name}, ${town}`); // worldwide
    queries.push(`${town}, Portugal`);
    queries.push(`${town}`);          // worldwide

    let firstAny = null;   // last-resort, even if it looks wrong
    let townHit = null;    // right town, but not the region we expected
    for (const q of queries) {
      const res = await run(q);
      if (!res) continue;
      if (!firstAny) firstAny = res;
      if (!matchesTown(res, town)) continue; // wrong place — keep looking
      if (!townHit) townHit = res;
      if (!known) return res;                // nothing to reconcile: it's the town
      if (res.region && normalizePlaceName(res.region) === normalizePlaceName(known)) return res;
      if (!typed && res.country && !isPortugal(res.country)) return res; // confident foreign hit
    }
    const best = townHit || firstAny;
    if (best && known && !best.region) best.region = known;
    return best;
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
        const country = countryFromComponents(comps) || "";
        resolve({ town, region, country, label: [town, region].filter(Boolean).join(", ") });
      });
    });
  }

  return { init, locate, reverse, regionForTown, isPortugal, canonicalCountry, canonicalRegion };
})();
