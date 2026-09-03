// Compressão de imagem, num sítio só — antes disto NENHUM dos quatro pontos
// de upload comprimia: a foto ia para o Storage tal como saía da câmara, e
// uma câmara de telemóvel são 3-5 MB por foto. Com o limite de 6 MB das
// regras, metade das fotos passava à justa e a outra metade era recusada —
// e as que passavam pagavam-se em dados móveis de quem as via.
//
// O contrato: devolve SEMPRE um ficheiro utilizável. Se a compressão falhar
// (formato exótico, canvas sem memória), devolve o ORIGINAL — pior uma foto
// grande do que upload nenhum. O test:visita mede o que o upload recebe.
const Imagem = (() => {
  const LADO_MAX = 1600;   // chega para ecrã e ficha; ninguém faz zoom forense
  const QUALIDADE = 0.82;  // JPEG: abaixo disto nota-se, acima pesa sem ganho

  async function comprimir(file) {
    try {
      if (!file || !/^image\//.test(file.type)) return file;
      const bmp = await createImageBitmap(file);
      const lado = Math.max(bmp.width, bmp.height);
      // Já pequena e já JPEG: não se recomprime (cada passagem perde qualidade).
      if (lado <= LADO_MAX && file.type === "image/jpeg") return file;
      const escala = Math.min(1, LADO_MAX / lado);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(bmp.width * escala));
      c.height = Math.max(1, Math.round(bmp.height * escala));
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", QUALIDADE));
      if (!blob) return file;
      // Uma conversão sem redução que AUMENTE o ficheiro não vale a pena.
      if (escala === 1 && blob.size >= file.size) return file;
      const nome = (String(file.name || "foto").replace(/\.[^.]+$/, "") || "foto") + ".jpg";
      return new File([blob], nome, { type: "image/jpeg" });
    } catch (e) {
      return file; // o contrato: nunca piorar as coisas
    }
  }

  return { comprimir };
})();
