// localStorage helpers for visited tracking, user-added restaurants and Places cache.

const Storage = {
  VISITED_KEY: "portugalRestaurants.visited",
  CUSTOM_KEY: "portugalRestaurants.custom",
  PLACES_CACHE_KEY: "portugalRestaurants.placesCache",

  getVisited() {
    return new Set(JSON.parse(localStorage.getItem(this.VISITED_KEY) || "[]"));
  },

  setVisited(id, visited) {
    const visitedSet = this.getVisited();
    if (visited) {
      visitedSet.add(id);
    } else {
      visitedSet.delete(id);
    }
    localStorage.setItem(this.VISITED_KEY, JSON.stringify([...visitedSet]));
  },

  isVisited(id) {
    return this.getVisited().has(id);
  },

  getCustomRestaurants() {
    return JSON.parse(localStorage.getItem(this.CUSTOM_KEY) || "[]");
  },

  addCustomRestaurant(restaurant) {
    const list = this.getCustomRestaurants();
    list.push(restaurant);
    localStorage.setItem(this.CUSTOM_KEY, JSON.stringify(list));
  },

  removeCustomRestaurant(id) {
    const list = this.getCustomRestaurants().filter((r) => r.id !== id);
    localStorage.setItem(this.CUSTOM_KEY, JSON.stringify(list));
  },

  getPlacesCache() {
    return JSON.parse(localStorage.getItem(this.PLACES_CACHE_KEY) || "{}");
  },

  getCachedPlace(id) {
    const cache = this.getPlacesCache();
    const entry = cache[id];
    if (!entry) return null;
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - entry.fetchedAt > ONE_WEEK) return null;
    return entry.data;
  },

  setCachedPlace(id, data) {
    const cache = this.getPlacesCache();
    cache[id] = { data, fetchedAt: Date.now() };
    localStorage.setItem(this.PLACES_CACHE_KEY, JSON.stringify(cache));
  }
};
