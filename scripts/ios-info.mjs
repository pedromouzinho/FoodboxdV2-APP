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
import { readFileSync, writeFileSync } from "node:fs";
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

entitlements();
equipaDeAssinatura();

// A equipa de assinatura, pelo mesmo motivo dos entitlements: escolhe-se no
// Xcode, vive no project.pbxproj, e o project.pbxproj é gerado e descartável.
// Um clone novo ficava outra vez sem equipa — e sem equipa não há build para
// dispositivo nem upload para a App Store Connect.
//
// O Team ID não é segredo (vai dentro de todos os perfis de aprovisionamento),
// por isso mora em ios-signing.json, versionado.
function equipaDeAssinatura() {
  const fonte = join(ROOT, "ios-signing.json");
  if (!existsSync(fonte)) return;
  const equipa = (JSON.parse(readFileSync(fonte, "utf8")).developmentTeam || "").trim();
  if (!equipa) return;

  const pbx = join(ROOT, "ios/App/App.xcodeproj/project.pbxproj");
  let t = readFileSync(pbx, "utf8");

  // Já lá está e é a mesma? Nada a fazer. Já lá está e é outra? Corrige — o
  // ficheiro versionado manda, senão duas máquinas assinam com equipas
  // diferentes e ninguém percebe porquê.
  const existentes = [...t.matchAll(/DEVELOPMENT_TEAM = ([^;]+);/g)].map((m) => m[1].trim());
  if (existentes.length && existentes.every((e) => e === equipa)) {
    console.log(`ios-info: equipa de assinatura já era ${equipa}`);
    return;
  }
  if (existentes.length) {
    t = t.replace(/DEVELOPMENT_TEAM = [^;]+;/g, `DEVELOPMENT_TEAM = ${equipa};`);
    writeFileSync(pbx, t);
    console.log(`ios-info: equipa de assinatura corrigida para ${equipa} (${existentes.length} configurações)`);
    return;
  }

  // Contar em vez de confiar, pela mesma razão dos entitlements: se o template
  // do Capacitor mudar a forma desta linha, o replace acerta em zero, o
  // ficheiro é escrito à mesma e o sucesso saía impresso na mesma — e a falha
  // só aparecia lá à frente, no upload, com uma mensagem sobre perfis.
  const alvo = /(\n(\t+)PRODUCT_BUNDLE_IDENTIFIER = pt\.foodboxd\.app;)/g;
  const encontradas = (t.match(alvo) || []).length;
  if (!encontradas) {
    console.error("ios-info: não encontrei nenhuma linha `PRODUCT_BUNDLE_IDENTIFIER = pt.foodboxd.app;`");
    console.error("  o template do projeto mudou; sem DEVELOPMENT_TEAM não há build para dispositivo.");
    process.exit(1);
  }
  t = t.replace(alvo, `$1\n$2DEVELOPMENT_TEAM = ${equipa};`);
  writeFileSync(pbx, t);
  console.log(`ios-info: equipa de assinatura ${equipa} escrita em ${encontradas} configurações`);
}

// Os entitlements vivem em ios-entitlements.plist, na raiz, pelo mesmo motivo
// dos textos de permissão. Sem eles o login com a Google falha com "keychain
// error" e mais nada — o GoogleSignIn não consegue guardar o token.
//
// Não chega copiar: o target tem de saber onde está, e o `cap add ios` gera o
// projeto sem CODE_SIGN_ENTITLEMENTS. A definição vai só nas configurações do
// target da app (as que têm INFOPLIST_FILE = App/Info.plist) — pô-la na linha
// de comandos aplica-a também aos Pods, e aí o caminho relativo não resolve e o
// build rebenta em cada pod.
function entitlements() {
  const fonte = join(ROOT, "ios-entitlements.plist");
  if (!existsSync(fonte)) return;
  execFileSync("/bin/cp", [fonte, join(ROOT, "ios/App/App/App.entitlements")]);
  const pbx = join(ROOT, "ios/App/App.xcodeproj/project.pbxproj");
  let t = readFileSync(pbx, "utf8");
  if (!t.includes("CODE_SIGN_ENTITLEMENTS")) {
    // Contar em vez de confiar. Se o template do Capacitor mudar — basta passar
    // a `INFOPLIST_FILE = "App/Info.plist";`, com aspas — o replace acerta em
    // zero, o ficheiro é escrito à mesma e o sucesso saía impresso na mesma. O
    // login com a Google voltava a morrer com "keychain error", que é o sintoma
    // mudo que já custou um bloco inteiro a diagnosticar.
    const alvo = /(\n(\t+)INFOPLIST_FILE = App\/Info\.plist;)/g;
    const encontradas = (t.match(alvo) || []).length;
    if (!encontradas) {
      console.error("ios-info: não encontrei nenhuma linha `INFOPLIST_FILE = App/Info.plist;`");
      console.error("  o template do projeto mudou; sem CODE_SIGN_ENTITLEMENTS o login com a Google");
      console.error("  falha com 'keychain error' e nada mais. Ver o Bloco 3 do HANDOFF-IOS-AGENTE.md.");
      process.exit(1);
    }
    t = t.replace(alvo, "$1\n$2CODE_SIGN_ENTITLEMENTS = App/App.entitlements;");
    writeFileSync(pbx, t);
    console.log(`ios-info: CODE_SIGN_ENTITLEMENTS apontado em ${encontradas} configurações do target`);
  }
  console.log("ios-info: entitlements copiados");
}

// GoogleService-Info.plist — pelo mesmo motivo dos textos: ios/ é gerada e não
// vai para o git, portanto o ficheiro tem de viver na raiz e ser copiado a cada
// sync, ou desaparece no clone seguinte.
//
// É o que o @capacitor-firebase/authentication precisa para carregar: sem ele o
// FirebaseApp.configure() do plugin levanta uma exceção não apanhada e a app
// morre no arranque, antes de mostrar seja o que for. Descarrega-se da consola
// do Firebase depois de registar lá uma app iOS — ver o bloco 1.4b do
// HANDOFF-IOS-AGENTE.md.
const GS = "GoogleService-Info.plist";
if (existsSync(join(ROOT, GS))) {
  execFileSync("/bin/cp", [join(ROOT, GS), join(ROOT, "ios/App/App", GS)]);
  console.log(`ios-info: ${GS} copiado para o projeto iOS`);
  registarNoXcode();
  urlSchemeDaGoogle();
  subspecDaGoogle();
} else {
  console.log(`ios-info: sem ${GS} na raiz — o login nativo fica por ligar (bloco 1 do handoff)`);
}

// Copiar o ficheiro para a pasta NÃO chega: se não estiver nos recursos do
// projeto, não entra no bundle e o FirebaseApp.configure() continua a não o
// encontrar — a app compila e morre à mesma no arranque. Foi assim que gastei
// um build a perceber porquê.
//
// Os ids são fixos e começados por FBD0 para se saber de onde vêm; o Xcode só
// exige que sejam 24 hexadecimais únicos dentro do ficheiro.
function registarNoXcode() {
  const pbx = join(ROOT, "ios/App/App.xcodeproj/project.pbxproj");
  let t = readFileSync(pbx, "utf8");
  if (t.includes(GS)) return; // já registado — o sync corre muitas vezes
  const REF = "FBD0FBD0FBD0FBD0FBD00002";
  const BUILD = "FBD0FBD0FBD0FBD0FBD00001";
  t = t.replace("/* End PBXBuildFile section */",
    `\t\t${BUILD} /* ${GS} in Resources */ = {isa = PBXBuildFile; fileRef = ${REF} /* ${GS} */; };\n/* End PBXBuildFile section */`);
  t = t.replace("/* End PBXFileReference section */",
    `\t\t${REF} /* ${GS} */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = "${GS}"; sourceTree = "<group>"; };\n/* End PBXFileReference section */`);
  // Estas duas âncoras são ids fixos do template do Capacitor. Se ele os
  // mudar, o replace acerta em zero e o ficheiro fica escrito na mesma: o
  // .plist não entraria no bundle, o FirebaseApp.configure() não o encontraria,
  // e a app morreria no arranque com ecrã preto. Contar em vez de confiar.
  const ancoras = [
    [/(\t+504EC3131FED79650016851F \/\* Info\.plist \*\/,\n)/, `$1\t\t\t\t${REF} /* ${GS} */,\n`, "grupo App"],
    [/(\t+504EC30F1FED79650016851F \/\* Assets\.xcassets in Resources \*\/,\n)/, `$1\t\t\t\t${BUILD} /* ${GS} in Resources */,\n`, "fase Resources"],
  ];
  for (const [alvo, subst, onde] of ancoras) {
    if (!alvo.test(t)) {
      console.error(`ios-info: não encontrei a âncora do ${onde} no project.pbxproj`);
      console.error(`  o template do Capacitor mudou; sem isto o ${GS} não entra no bundle`);
      console.error("  e a app morre no arranque. Ver o Bloco 3 do HANDOFF-IOS-AGENTE.md.");
      process.exit(1);
    }
    t = t.replace(alvo, subst);
  }
  writeFileSync(pbx, t);
  console.log(`ios-info: ${GS} registado nos recursos do Xcode`);
}

// O @capacitor-firebase/authentication instala por omissão o subspec `Lite`,
// que traz o FirebaseAuth mas NÃO o GoogleSignIn. Sem ele, o
// signInWithGoogle() não rejeita nem resolve: fica pendurado para sempre, sem
// erro e sem folha do sistema — o caminho nativo da Google não está compilado.
//
// A forma de o acrescentar importa, e custou três tentativas:
//
//   :subspecs => ['Google']            o pod deixa de registar
//   :subspecs => ['Lite', 'Google']    idem
//   duas linhas: raiz + '/Google'      funciona
//
// `:subspecs` SUBSTITUI a raiz em vez de a somar. Sem a raiz, o CocoaPods fica
// sem source files para compilar e gera um PBXAggregateTarget — um target que
// não compila nada e não produz produto. Daí não haver símbolo nenhum no
// binário (`nm` a zero) nem entrada no OTHER_LDFLAGS, e o
// Capacitor.Plugins.FirebaseAuthentication ficar undefined em runtime, sem um
// único erro pelo caminho.
//
// Medido: com a raiz declarada e o '/Google' numa segunda linha, o target passa
// a PBXNativeTarget do tipo framework e o pod aparece no OTHER_LDFLAGS.
//
// O Podfile é regenerado pelo `cap sync` a cada corrida, por isso isto tem de
// ser reaplicado de cada vez, e não uma vez à mão. O `pod install` só corre
// quando a linha muda, que é o passo lento.
function subspecDaGoogle() {
  const podfile = join(ROOT, "ios/App/Podfile");
  const antes = readFileSync(podfile, "utf8");
  if (antes.includes("CapacitorFirebaseAuthentication/Google")) return; // já lá está
  const caminho = antes.match(/pod 'CapacitorFirebaseAuthentication', :path => '([^']+)'/);
  if (!caminho) return; // o plugin não está instalado

  // A linha vai para o "# Add your Pods here", DENTRO do target e FORA do
  // `def capacitor_pods`. O `cap sync` regenera esse def a cada corrida e
  // apagaria a linha de lá; o corpo do target não lhe pertence e sobrevive.
  const marca = "  # Add your Pods here";
  if (!antes.includes(marca)) {
    console.error("ios-info: o Podfile não tem a marca '# Add your Pods here' — o Capacitor mudou o template");
    process.exit(1);
  }
  const depois = antes.replace(marca,
    `  pod 'CapacitorFirebaseAuthentication/Google', :path => '${caminho[1]}'\n${marca}`);
  writeFileSync(podfile, depois);

  console.log("ios-info: Podfile com o subspec Google — a correr pod install");
  // O LANG tem de ir explícito: com LANG vazio o CocoaPods rebenta com um erro
  // de Unicode do Ruby, a meio, e a mensagem não diz nada sobre locale.
  const cocoapods = (args) => execFileSync("/usr/bin/env", ["pod", ...args], {
    cwd: join(ROOT, "ios/App"),
    encoding: "utf8",
    env: { ...process.env, LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" }
  });
  try {
    cocoapods(["install"]);
  } catch (e) {
    // Trazer o GoogleSignIn para um projeto que já resolveu sem ele pode
    // colidir: o GTMSessionFetcher fica preso numa versão que o GoogleSignIn
    // recusa. Num clone de raiz não acontece — o lock nasce já com os dois —
    // mas a quem já tinha a pasta, acontece.
    const saida = String((e && e.stdout) || "") + String((e && e.stderr) || "");
    if (!/GTMSessionFetcher/.test(saida)) {
      console.error("ios-info: o pod install falhou, e não foi o conflito conhecido:");
      console.error(saida.split("\n").filter(Boolean).slice(-20).join("\n"));
      process.exit(1);
    }
    console.log("ios-info: conflito de GTMSessionFetcher — a desprender a versão");
    cocoapods(["update", "GTMSessionFetcher"]);
  }
  console.log("ios-info: GoogleSignIn ligado");
}

// O login nativo com a Google volta para a app por um URL scheme, e o scheme é
// o REVERSED_CLIENT_ID do próprio GoogleService-Info.plist. Lê-se de lá em vez
// de se escrever à mão: são o mesmo valor, e dois sítios divergem.
function urlSchemeDaGoogle() {
  const rev = execFileSync(PB, ["-c", "Print :REVERSED_CLIENT_ID", join(ROOT, GS)],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  if (!rev) return;
  const jaLa = (() => {
    try { return pb(["-c", "Print :CFBundleURLTypes"]).includes(rev); } catch { return false; }
  })();
  if (jaLa) return;
  try { pb(["-c", "Print :CFBundleURLTypes"]); }
  catch { pb(["-c", "Add :CFBundleURLTypes array"]); }
  pb(["-c", "Add :CFBundleURLTypes:0 dict"]);
  pb(["-c", "Add :CFBundleURLTypes:0:CFBundleURLSchemes array"]);
  pb(["-c", `Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string ${rev}`]);
  console.log("ios-info: URL scheme do login com a Google escrito no Info.plist");
}
