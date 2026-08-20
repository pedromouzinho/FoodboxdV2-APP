// Google Sign-In UI + glue. The actual Firebase Auth SDK is loaded as an ES
// module in index.html, which (once ready) exposes window.FirebaseAuth and
// fires a "firebase-auth-ready" event. This classic script wires that into the
// topbar and tells the App when the signed-in user changes.
//
// Degrades silently when Firebase isn't configured / the SDK fails to load:
// the sign-in button stays hidden and the app runs in anonymous/local mode.

const AuthModule = (() => {
  let fb = null; // window.FirebaseAuth
  let onUser = null; // (user|null, getTokenFn) => void
  let btn, chip, chipImg, chipName, signoutBtn;

  function init(opts) {
    onUser = (opts && opts.onUser) || null;
    btn = document.getElementById("signin-btn");
    chip = document.getElementById("user-chip");
    chipImg = document.getElementById("user-chip-img");
    chipName = document.getElementById("user-chip-name");
    signoutBtn = document.getElementById("signout-btn");

    // Ia direto para a Google. A diretriz 4.8 exige que o Sign in with Apple
    // esteja disponível onde houver login social de terceiros — um atalho só
    // para a Google escondia a outra opção. Passa a abrir o ecrã com as duas.
    if (btn) btn.addEventListener("click", function () {
      if (opts && typeof opts.onSignInRequest === "function") opts.onSignInRequest();
      else signIn();
    });
    if (signoutBtn) signoutBtn.addEventListener("click", signOut);

    if (window.FirebaseAuth && window.FirebaseAuth.configured) {
      wire();
    } else {
      document.addEventListener("firebase-auth-ready", wire, { once: true });
    }
  }

  function wire() {
    fb = window.FirebaseAuth;
    if (!fb || !fb.configured) return;
    fb.onChange((user) => {
      renderUI(user);
      if (onUser) onUser(user, fb.getToken);
    });
  }

  function signIn() {
    if (!fb) return;
    fb.signIn().catch((e) => {
      // Common when the Google provider isn't enabled yet, or popup blocked.
      console.warn("Sign-in failed:", e && e.message);
    });
  }
  function signInApple() {
    if (!fb || !fb.signInApple) return;
    fb.signInApple().catch((e) => {
      // Comum enquanto o provider não estiver ativado na consola do Firebase,
      // ou se a janela for fechada a meio.
      console.warn("Apple sign-in failed:", e && e.message);
    });
  }
  function signOut() {
    if (fb) fb.signOut().catch(() => {});
  }

  // Apagar a conta corre no servidor (função `conta`), não aqui: há coisas que
  // o cliente não tem como apagar — as arestas de quem TE segue pertencem a
  // essas pessoas, não a ti. Ver o comentário em functions/index.js.
  //
  // A sessão só é terminada depois de o servidor confirmar. Se falhar a meio, a
  // conta continua de pé e a pessoa pode tentar outra vez, em vez de ficar de
  // fora de uma conta que ainda existe.
  function endpointConta() {
    if (!CONFIG.EMULATORS) return "/api/conta";
    return `http://127.0.0.1:${CONFIG.EMU.functions}/${CONFIG.FIREBASE_PROJECT_ID}/europe-west1/conta`;
  }

  async function deleteAccount() {
    if (!fb || !fb.configured) throw new Error("Não há sessão iniciada.");
    const t = await fb.getToken();
    if (!t) throw new Error("Não há sessão iniciada.");
    const res = await fetch(endpointConta(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
      body: JSON.stringify({ action: "apagar" })
    });
    if (!res.ok) {
      let msg = "Não foi possível apagar a conta agora.";
      try { msg = (await res.json()).error || msg; } catch (e) {}
      throw new Error(msg);
    }
    await fb.signOut().catch(() => {});
    return true;
  }

  function renderUI(user) {
    if (!btn || !chip) return;
    if (user) {
      btn.classList.add("hidden");
      chip.classList.remove("hidden");
      if (chipName) chipName.textContent = user.displayName || user.email || "Conta";
      if (chipImg) {
        if (user.photoURL) {
          chipImg.src = user.photoURL;
          chipImg.classList.remove("hidden");
          chipImg.removeAttribute("data-initial");
        } else {
          chipImg.classList.add("hidden");
        }
      }
    } else {
      chip.classList.add("hidden");
      btn.classList.remove("hidden");
    }
  }

  return { init, signIn, signInApple, signOut, deleteAccount };
})();
