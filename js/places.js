// Optional Google Places enrichment: rating, review count, photo, opening
// hours and price level shown inline next to each restaurant. Only runs
// when the Google Maps JS API (with the "places" library) is available.
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

  function priceLevelLabel(level) {
    if (typeof level !== "number") return "";
    return "€".repeat(Math.max(1, level));
  }

  function renderInto(container, data) {
    if (!container) return;
    if (!data) {
      container.innerHTML = "";
      return;
    }

    const parts = [];
    if (data.photoUrl) {
      parts.push(`<img src="${data.photoUrl}" alt="" />`);
    }
    if (typeof data.rating === "number") {
      const reviews = data.userRatingsTotal ? ` (${data.userRatingsTotal})` : "";
      parts.push(`<span>⭐ ${data.rating}${reviews}</span>`);
    }
    if (typeof data.openNow === "boolean") {
      parts.push(`<span>${data.openNow ? "🟢 Aberto agora" : "🔴 Fechado agora"}</span>`);
    }
    if (data.priceLevel) {
      parts.push(`<span>${data.priceLevel}</span>`);
    }

    container.innerHTML = parts.join("");
  }

  function enrich(restaurant, container) {
    const cached = Storage.getCachedPlace(restaurant.id);
    if (cached) {
      renderInto(container, cached);
      return;
    }

    if (!service) return;

    service.findPlaceFromQuery(
      {
        query: restaurant.mapsQuery,
        fields: ["place_id"]
      },
      (results, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !results || !results[0]) {
          return;
        }

        service.getDetails(
          {
            placeId: results[0].place_id,
            fields: ["rating", "user_ratings_total", "opening_hours", "photos", "price_level"]
          },
          (place, detailsStatus) => {
            if (detailsStatus !== google.maps.places.PlacesServiceStatus.OK || !place) {
              return;
            }

            const data = {
              rating: place.rating,
              userRatingsTotal: place.user_ratings_total,
              openNow: place.opening_hours ? place.opening_hours.isOpen() : undefined,
              priceLevel: priceLevelLabel(place.price_level),
              photoUrl:
                place.photos && place.photos[0]
                  ? place.photos[0].getUrl({ maxWidth: 80, maxHeight: 80 })
                  : null
            };

            Storage.setCachedPlace(restaurant.id, data);
            renderInto(container, data);
          }
        );
      }
    );
  }

  return { init, isAvailable, enrich };
})();
