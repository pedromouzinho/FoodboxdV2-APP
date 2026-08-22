// Escreve os textos de permissão do iOS no Info.plist, a partir de ios-info.json.
//
// Existe porque a pasta ios/ é gerada e está no .gitignore — o que é certo, não
// se versiona um projeto Xcode inteiro. Só que os três NSxxxUsageDescription
// viviam lá dentro e mais nada: um clone novo gerava a app sem eles, e são
// material de App Review. Com isto a pasta fica descartável de verdade e os
// textos ficam em git.
//
// Corre no fim do `npm run sync`. Sem ios/ à frente (o agente da nuvem, o CI)
// não faz nada e sai a zero — não é erro, é não haver onde escrever.
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PLIST = join(ROOT, "ios/App/App/Info.plist");
const PB = "/usr/libexec/PlistBuddy";

if (!existsSync(PLIST)) {
  console.log("ios-info: sem ios/App/App/Info.plist — nada a fazer (corre npx cap add ios primeiro)");
  process.exit(0);
}
if (!existsSync(PB)) {
  console.error("ios-info: PlistBuddy não existe — isto só corre em macOS");
  process.exit(1);
}

const fonte = JSON.parse(await readFile(join(ROOT, "ios-info.json"), "utf8"));
const chaves = Object.keys(fonte).filter((k) => !k.startsWith("_"));
if (!chaves.length) {
  console.error("ios-info: ios-info.json não tem chaves nenhumas");
  process.exit(1);
}

// stderr silenciado: o Set numa chave que ainda não existe escreve
// "Does Not Exist" antes de falhar, e isso é o caminho normal na primeira vez.
const pb = (args) => execFileSync(PB, [...args, PLIST], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

let escritas = 0;
for (const chave of chaves) {
  const valor = fonte[chave];
  // Set falha se a chave não existir; nesse caso Add. Idempotente nos dois
  // sentidos, para o sync poder correr as vezes que forem precisas.
  try {
    pb(["-c", `Set :${chave} ${valor}`]);
  } catch {
    pb(["-c", `Add :${chave} string ${valor}`]);
  }
  const lido = pb(["-c", `Print :${chave}`]).trim();
  if (lido !== valor) {
    console.error(`ios-info: ${chave} ficou diferente do que devia`);
    console.error(`  esperado: ${valor}`);
    console.error(`  no plist: ${lido}`);
    process.exit(1);
  }
  escritas++;
}

execFileSync("/usr/bin/plutil", ["-lint", PLIST], { stdio: "ignore" });
console.log(`ios-info: ${escritas} textos de permissão escritos no Info.plist`);

// GoogleService-Info.plist — pelo mesmo motivo dos textos: ios/ é gerada e não
// vai para o git, portanto o ficheiro tem de viver na raiz e ser copiado a cada
// sync, ou desaparece no clone seguinte.
//
// É o que falta para o @capacitor-firebase/authentication poder entrar: sem ele
// o FirebaseApp.configure() do plugin levanta uma exceção não apanhada e a app
// morre no arranque, antes de mostrar seja o que for. Descarrega-se da consola
// do Firebase depois de registar lá uma app iOS — ver o bloco 1 do
// HANDOFF-IOS-AGENTE.md.
const GS = "GoogleService-Info.plist";
if (existsSync(join(ROOT, GS))) {
  execFileSync("/bin/cp", [join(ROOT, GS), join(ROOT, "ios/App/App", GS)]);
  console.log(`ios-info: ${GS} copiado para o projeto iOS`);
} else {
  console.log(`ios-info: sem ${GS} na raiz — o login nativo fica por ligar (bloco 1 do handoff)`);
}
