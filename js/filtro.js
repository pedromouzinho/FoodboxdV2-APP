// Filtro de conteúdo dos comentários — a terceira das quatro exigências da
// diretriz 1.2 da App Store (as outras: denunciar ✓, bloquear ✓, e o
// compromisso de agir em 24h, que vive nos /termos).
//
// O que isto é: um filtro de palavrões e insultos, corrido ANTES de publicar.
// O que isto não é: moderação a sério — essa é humana, feita a partir das
// denúncias, na consola. Um filtro de palavras apanha o abuso preguiçoso e
// mostra ao revisor da Apple que o mecanismo existe; quem quiser insultar com
// vocabulário limpo passa, e é para isso que o denunciar existe.
//
// A normalização (acentos fora, l33t desfeito) existe porque a primeira coisa
// que qualquer pessoa tenta é "m3rd@" — visto no teste antes de estar no
// código. As palavras comparam-se inteiras: "punheta" não apanha "espeto",
// e "grande" não apanha nada por conter "rande".
//
// O test:persistencia (bloco 4) exercita casos dos dois lados.

const Filtro = (() => {
  // Palavras inteiras, já na forma normalizada (minúsculas, sem acentos).
  const PROIBIDAS = new Set([
    // português
    "merda", "caralho", "foda", "fodas", "foder", "fodido", "fodida",
    "puta", "putas", "puto do caralho", "cabrao", "cabra", "cona", "conas",
    "paneleiro", "paneleira", "viado", "boiola", "preto de merda", "cigano de merda",
    "atrasado mental", "mongoloide", "retardado", "retardada",
    "vai te foder", "vaite foder", "filho da puta", "filha da puta", "fdp",
    "corno", "cornudo", "badalhoca", "badalhoco", "piça", "pica dura",
    // inglês
    "fuck", "fucking", "fucked", "shit", "bullshit", "asshole", "bitch",
    "cunt", "nigger", "nigga", "faggot", "retard", "whore", "slut",
    "motherfucker", "son of a bitch", "wanker", "dickhead"
  ]);
  // Expressões compostas (verificadas como substring do texto normalizado,
  // com espaços): apanham o insulto mesmo no meio de uma frase.
  const COMPOSTAS = [...PROIBIDAS].filter((p) => p.includes(" "));
  const SIMPLES = new Set([...PROIBIDAS].filter((p) => !p.includes(" ")));

  // Minúsculas, acentos fora, l33t desfeito, pontuação vira espaço.
  function normalizar(texto) {
    return String(texto || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[@]/g, "a").replace(/[$5]/g, "s").replace(/[3]/g, "e")
      .replace(/[1!]/g, "i").replace(/[0]/g, "o").replace(/[4]/g, "a")
      .replace(/[^a-zç\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Devolve { ok, motivo }. O motivo nunca repete a palavra — dizer "não
  // podes dizer X" é pôr o filtro a publicá-la.
  function avaliar(texto) {
    const norm = normalizar(texto);
    if (!norm) return { ok: true };
    const comEspacos = " " + norm + " ";
    for (const expr of COMPOSTAS) {
      if (comEspacos.includes(" " + expr + " ")) {
        return { ok: false, motivo: "linguagem" };
      }
    }
    for (const palavra of norm.split(" ")) {
      if (SIMPLES.has(palavra)) return { ok: false, motivo: "linguagem" };
    }
    return { ok: true };
  }

  return { avaliar };
})();
