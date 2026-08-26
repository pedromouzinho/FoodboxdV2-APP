// Google Places enrichment: rating, photos, opening hours, price, phone and
// reviews — shown inside the app (detail drawer) and as mini-stats on cards.
// Cache em três camadas: localStorage (30 dias) → Firestore partilhado
// (30 dias, pago uma vez por sítio para TODOS os dispositivos) → rede.

const PlacesModule = (() => {
  let service = null;

  function init() {
    if (!MapModule.isAvailable() || !google.maps.places) return;
    service = new google.maps.places.PlacesService(MapModule.getMap());
  }

  function isAvailable() {
    return !!service;
  }

  function priceLabel(level) {
    return typeof level === "number" ? "€".repeat(Math.max(1, level)) : "";
  }

  // Só o que já está em cache local — SEM rede, nunca. É o que a lista e os
  // thumbnails podem usar: em agosto de 2026 cada cartão chamava a Google
  // (Find Place + Details + fotos) em cada dispositivo de cache fresca, e a
  // fatura passou o crédito em €108 com 8 utilizadores. A rede é para quando
  // se ABRE a ficha; um cartão sem cache fica sem estrelinha até lá.
  function fromCache(restaurant) {
    return Storage.getCachedPlace(restaurant.id) || null;
  }

  // Resolve full details for a restaurant (cached). Resolves to data or null.
  //
  // Três camadas, da mais barata para a mais cara: cache local (30 dias) →
  // cache PARTILHADA no Firestore (o primeiro dispositivo que busca um sítio
  // paga a chamada; todos os outros leem de graça) → a Google. Sem a camada
  // partilhada, o custo crescia com o número de DISPOSITIVOS — cada telemóvel,
  // browser e reinstalação pagava a vassourada inteira outra vez.
  async function fetchDetails(restaurant, opts) {
    const force = opts && opts.force; // bypass + overwrite cache (e.g. expired photo URLs)
    if (!force) {
      const local = Storage.getCachedPlace(restaurant.id);
      if (local) return local;
      try {
        const partilhada = await DB.fetchPlaceCache(restaurant.id);
        if (partilhada) {
          Storage.setCachedPlace(restaurant.id, partilhada);
          return partilhada;
        }
      } catch (e) { /* sem cache partilhada segue-se para a rede */ }
    }
    const data = await daRede(restaurant);
    if (data) {
      // Melhor-esforço: a escrita partilhada exige sessão (regras), e falhar
      // aqui nunca pode estragar a ficha de quem está a olhar para ela.
      try {
        const fb = window.FirebaseAuth;
        const token = fb && fb.configured ? await fb.getToken() : null;
        if (token) DB.savePlaceCache(restaurant.id, data, token).catch(() => {});
      } catch (e) { /* fica só na cache local */ }
    }
    return data;
  }

  function daRede(restaurant) {
    return new Promise((resolve) => {
      if (!service) return resolve(null);

      service.findPlaceFromQuery(
        { query: restaurant.mapsQuery, fields: ["place_id"] },
        (results, status) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !results || !results[0]) {
            return resolve(null);
          }
          service.getDetails(
            {
              placeId: results[0].place_id,
              fields: [
                "rating",
                "user_ratings_total",
                "price_level",
                "types",
                "opening_hours",
                "photos",
                "geometry",
                "reviews",
                "formatted_phone_number",
                "website",
                "url"
              ]
            },
            (place, st) => {
              if (st !== google.maps.places.PlacesServiceStatus.OK || !place) return resolve(null);
              const data = {
                rating: place.rating,
                userRatingsTotal: place.user_ratings_total,
                priceLevel: priceLabel(place.price_level),
                priceLevelNum: typeof place.price_level === "number" ? place.price_level : null,
                types: place.types || [],
                lat: place.geometry && place.geometry.location ? place.geometry.location.lat() : null,
                lng: place.geometry && place.geometry.location ? place.geometry.location.lng() : null,
                openNow: place.opening_hours ? place.opening_hours.isOpen() : undefined,
                weekdayText: place.opening_hours ? place.opening_hours.weekday_text || null : null,
                phone: place.formatted_phone_number || null,
                website: place.website || null,
                googleUrl: place.url || null,
                photos: (place.photos || []).slice(0, 6).map((p) => p.getUrl({ maxWidth: 800 })),
                reviews: (place.reviews || []).slice(0, 4).map((r) => ({
                  author: r.author_name,
                  rating: r.rating,
                  text: r.text,
                  when: r.relative_time_description,
                  photo: r.profile_photo_url || null
                }))
              };
              Storage.setCachedPlace(restaurant.id, data);
              resolve(data);
            }
          );
        }
      );
    });
  }

  // Details for a place we DISCOVERED (not yet a restaurant in the app) — used by
  // the preview card inside the AI modal. Cached in memory per placeId; doesn't
  // touch the per-restaurant Storage cache.
  const placeIdCache = new Map();
  function detailsByPlaceId(placeId) {
    if (!placeId) return Promise.resolve(null);
    if (placeIdCache.has(placeId)) return Promise.resolve(placeIdCache.get(placeId));
    return new Promise((resolve) => {
      if (!service) return resolve(null);
      service.getDetails(
        {
          placeId,
          fields: [
            "photos", "rating", "user_ratings_total", "price_level",
            "opening_hours", "formatted_address", "url", "website", "formatted_phone_number"
          ]
        },
        (place, st) => {
          if (st !== google.maps.places.PlacesServiceStatus.OK || !place) return resolve(null);
          const data = {
            rating: place.rating,
            userRatingsTotal: place.user_ratings_total,
            priceLevel: priceLabel(place.price_level),
            openNow: place.opening_hours ? place.opening_hours.isOpen() : undefined,
            weekdayText: place.opening_hours ? place.opening_hours.weekday_text || null : null,
            address: place.formatted_address || "",
            phone: place.formatted_phone_number || null,
            website: place.website || null,
            googleUrl: place.url || null,
            photos: (place.photos || []).slice(0, 3).map((p) => p.getUrl({ maxWidth: 800 }))
          };
          placeIdCache.set(placeId, data);
          resolve(data);
        }
      );
    });
  }

  // Discover NEW places from Google Maps by free-text query (e.g. the taste-
  // driven searches the AI proposes). Resolves to a compact array of candidates,
  // or [] on any failure. `opts.location` ({lat,lng}) biases results to a zone.
  function textSearch(query, opts) {
    return new Promise((resolve) => {
      if (!service || !query) return resolve([]);
      const limit = (opts && opts.limit) || 6;
      const request = { query };
      if (opts && opts.location && typeof opts.location.lat === "number") {
        request.location = new google.maps.LatLng(opts.location.lat, opts.location.lng);
        request.radius = (opts.radiusKm || 20) * 1000;
      }
      service.textSearch(request, (results, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !results) return resolve([]);
        const out = results
          .slice(0, limit)
          .map((p) => ({
            placeId: p.place_id,
            name: p.name,
            address: p.formatted_address || p.vicinity || "",
            lat: p.geometry && p.geometry.location ? p.geometry.location.lat() : null,
            lng: p.geometry && p.geometry.location ? p.geometry.location.lng() : null,
            rating: typeof p.rating === "number" ? p.rating : null,
            userRatingsTotal: p.user_ratings_total || 0,
            priceLevelNum: typeof p.price_level === "number" ? p.price_level : null,
            priceLevel: priceLabel(p.price_level),
            types: p.types || []
          }))
          .filter((p) => p.name && p.lat != null);
        resolve(out);
      });
    });
  }

  // Inline rating + open-now for a sidebar card meta element.
  // SÓ de cache: um cartão de lista nunca paga uma chamada à Google.
  async function enrichCard(restaurant, metaEl) {
    if (!metaEl) return null;
    const data = fromCache(restaurant);
    if (!data) return null;
    const parts = [];
    if (typeof data.rating === "number") {
      parts.push(
        `<span class="rating"><svg class="icon"><use href="#i-star"/></svg>${data.rating.toFixed(1)} <span class="count">(${data.userRatingsTotal || 0})</span></span>`
      );
    }
    if (typeof data.openNow === "boolean") {
      parts.push(`<span class="open-now ${data.openNow ? "open" : "closed"}">${data.openNow ? "Aberto" : "Fechado"}</span>`);
    }
    if (data.priceLevel) parts.push(`<span class="muted" style="font-size:0.82rem">${data.priceLevel}</span>`);
    metaEl.innerHTML = parts.join("");
    return data;
  }

  return { init, isAvailable, fromCache, fetchDetails, detailsByPlaceId, textSearch, enrichCard };
})();
