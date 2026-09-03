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
    // Só o desenho. Quando o nome da Apple é guardado depois de a sessão já
    // existir, é isto que faz o chip e o Perfil deixarem de mostrar "Amigo" sem
    // esperar pelo arranque seguinte. De propósito NÃO chama o `onUser`: esse é
    // o `onAuthChange` inteiro, e corrê-lo outra vez com o primeiro ainda a meio
    // arrancava o onboarding duas vezes numa conta acabada de criar.
    if (fb.onProfileChange) fb.onProfileChange((user) => {
      renderUI(user);
      // O chip é metade. O nome que os AMIGOS veem sai do UserData, pelo
      // `upsertProfile` — e o UserData só o calcula uma vez, dentro do
      // `setUser`. Sem esta linha, quem entrasse pela Apple passava a primeira
      // sessão inteira a aparecer como "Amigo" na lista de toda a gente.
      // `typeof` e não `window.UserData`: o UserData é um `const` de topo, e um
      // `const` de topo é global léxico — NÃO é propriedade do window. A mesma
      // armadilha que está anotada no js/config.js. Com `window.UserData` a
      // guarda era sempre falsa e isto nunca corria, em silêncio.
      if (user && typeof UserData !== "undefined" && UserData.nomeMudou) {
        UserData.nomeMudou(user.displayName);
      }
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

  // ---- Email e palavra-passe ----
  //
  // Ao contrário dos dois sociais, estes devolvem o erro a quem chamou em vez
  // de o engolirem num console.warn. A razão é a interface: o ecrã de entrada
  // tem de dizer À PESSOA o que correu mal — "essa palavra-passe está errada"
  // não é o mesmo que "esse email já tem conta", e um "não foi possível" para
  // os dois manda-a tentar o mesmo outra vez.
  //
  // A tradução dos códigos vive aqui e não no ecrã, para o dia em que houver
  // outro sítio a entrar.
  const ERROS = {
    "auth/invalid-email": "Esse email não parece um email.",
    "auth/user-disabled": "Esta conta está desativada.",
    "auth/user-not-found": "Não há conta com esse email.",
    "auth/wrong-password": "Palavra-passe errada.",
    "auth/invalid-credential": "Email ou palavra-passe errados.",
    "auth/email-already-in-use": "Já existe uma conta com esse email. Tenta entrar.",
    "auth/weak-password": "A palavra-passe tem de ter pelo menos 6 caracteres.",
    "auth/missing-password": "Falta a palavra-passe.",
    "auth/too-many-requests": "Demasiadas tentativas. Espera um pouco.",
    "auth/network-request-failed": "Sem ligação. Tenta outra vez.",
    // Este não é culpa de quem está a usar a app: quer dizer que o fornecedor
    // Email/Password não está ligado na consola do Firebase. Dizê-lo assim
    // poupa a quem vier a diagnosticar um bug que não existe no código.
    "auth/operation-not-allowed": "A entrada por email não está ativada neste projeto."
  };
  function traduzir(e) {
    const codigo = (e && e.code) || "";
    return ERROS[codigo] || (e && e.message) || "Não consegui. Tenta outra vez.";
  }

  async function entrarComEmail(email, palavra) {
    if (!fb || !fb.entrarComEmail) throw new Error("A entrada por email não está disponível.");
    try { return await fb.entrarComEmail(email, palavra); }
    catch (e) { throw new Error(traduzir(e)); }
  }
  async function criarComEmail(email, palavra, nome) {
    if (!fb || !fb.criarComEmail) throw new Error("A criação de conta não está disponível.");
    try { return await fb.criarComEmail(email, palavra, nome); }
    catch (e) { throw new Error(traduzir(e)); }
  }
  async function recuperarPalavra(email) {
    if (!fb || !fb.recuperarPalavra) throw new Error("A recuperação não está disponível.");
    try { return await fb.recuperarPalavra(email); }
    catch (e) { throw new Error(traduzir(e)); }
  }

  // Apagar a conta corre no servidor (função `conta`), não aqui: há coisas que
  // o cliente não tem como apagar — as arestas de quem TE segue pertencem a
  // essas pessoas, não a ti. Ver o comentário em functions/index.js.
  //
  // A sessão só é terminada depois de o servidor confirmar. Se falhar a meio, a
  // conta continua de pé e a pessoa pode tentar outra vez, em vez de ficar de
  // fora de uma conta que ainda existe.
  function endpointConta() {
    if (!CONFIG.EMULATORS) return (CONFIG.API_BASE || "") + "/api/conta";
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

  return { init, signIn, signInApple, signOut, deleteAccount,
           entrarComEmail, criarComEmail, recuperarPalavra };
})();
