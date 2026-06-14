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

  async function call(action, payload) {
    const t = await token();
    if (!t) throw new Error("Inicie sessão para usar a IA.");
    const res = await fetch("/api/ai", {
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
    planner: (p) => call("planner", p),
    summarizeReviews: (p) => call("summarizeReviews", p),
    draftReview: (p) => call("draftReview", p),
    nlSearch: (p) => call("nlSearch", p),
    categorize: (p) => call("categorize", p)
  };
})();
