// Google Places enrichment: rating, photos, opening hours, price, phone and
// reviews — shown inside the app (detail drawer) and as mini-stats on cards.
// Results are cached in localStorage for a week to limit API calls.

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

  // Resolve full details for a restaurant (cached). Resolves to data or null.
  function fetchDetails(restaurant, opts) {
    return new Promise((resolve) => {
      const force = opts && opts.force; // bypass + overwrite cache (e.g. expired photo URLs)
      if (!force) {
        const cached = Storage.getCachedPlace(restaurant.id);
        if (cached) return resolve(cached);
      }
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
  async function enrichCard(restaurant, metaEl) {
    if (!metaEl) return null;
    const data = await fetchDetails(restaurant);
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

  return { init, isAvailable, fetchDetails, textSearch, enrichCard };
})();
