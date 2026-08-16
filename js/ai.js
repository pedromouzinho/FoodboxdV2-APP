// Thin client for the Foodboxd AI backend (Cloud Function `ai`, same-origin via
// the /api/ai hosting rewrite). Sends the Firebase ID token; the key lives only
// on the server. Each helper returns the structured result or throws.

const AIModule = (() => {
  async function token() {
    try {
      return window.FirebaseAuth ? await window.FirebaseAuth.getToken() : null;
    } catch (e) {
      return null;
    }
  }

  // A reescrita /api/ai só existe no Firebase Hosting. No emulador chama-se a
  // função diretamente, na porta e região dela.
  function endpoint() {
    if (!CONFIG.EMULATORS) return "/api/ai";
    return `http://127.0.0.1:${CONFIG.EMU.functions}/${CONFIG.FIREBASE_PROJECT_ID}/europe-west1/ai`;
  }

  async function call(action, payload) {
    const t = await token();
    if (!t) throw new Error("Inicie sessão para usar a IA.");
    const res = await fetch(endpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
      body: JSON.stringify(Object.assign({ action }, payload || {}))
    });
    if (!res.ok) {
      let msg = "Não foi possível gerar agora.";
      try { msg = (await res.json()).error || msg; } catch (e) {}
      throw new Error(msg);
    }
    return (await res.json()).result;
  }

  return {
    available: () => !!(window.FirebaseAuth && window.FirebaseAuth.configured),
    recommend: (p) => call("recommend", p),
    smartSuggest: (p) => call("smartSuggest", p),
    rankDiscoveries: (p) => call("rankDiscoveries", p),
    tasteProfile: (p) => call("tasteProfile", p),
    planner: (p) => call("planner", p),
    summarizeReviews: (p) => call("summarizeReviews", p),
    draftReview: (p) => call("draftReview", p),
    nlSearch: (p) => call("nlSearch", p),
    categorize: (p) => call("categorize", p)
  };
})();
