# Foodboxd — regras para agentes

Este ficheiro é lido no arranque de qualquer sessão neste repositório. É curto
de propósito: cada linha aqui pesa em todas as sessões.

## Regra zero — dois agentes, um ramo

Este projeto é trabalhado por **dois agentes ao mesmo tempo**:

- um num contentor isolado na nuvem — sem Xcode, sem consolas, sem iOS;
- outro no Mac do dono — com Xcode, simulador e sessões autenticadas.

Trabalham **os dois no mesmo ramo**: `claude/beautiful-davinci-vsyokk`.

**As duas regras, e são para ambos:**

1. **Puxa antes de começar.** Sempre, mesmo que tenhas puxado há pouco.
2. **Publica logo a seguir a cada commit.** Não guardes commits locais.

```bash
git pull --rebase origin claude/beautiful-davinci-vsyokk    # antes
git push origin claude/beautiful-davinci-vsyokk             # depois de CADA commit
```

**Quem publica em produção:** qualquer um dos dois, disparando o workflow
*Deploy (produção)* — o agente da nuvem consegue fazê-lo pela API do GitHub, sem
ninguém ter de carregar em botão nenhum. O que **não** se faz é publicar sem
pedir.

**Mais do que um commit por publicar é o sinal de que algo vai correr mal.** Se
o trabalho é longo, parte-o em commits e publica cada um.

3. **Só um trabalha de cada vez.** Não é uma otimização — é a regra. Quando um
   lado está a trabalhar, o outro está parado e sincronizado. Quem acaba diz
   explicitamente que acabou, com o que fez e o que fica por fazer; só depois o
   outro começa, e começa por puxar.

Duas sessões a mexer no mesmo ramo ao mesmo tempo produzem conflitos que nenhuma
das duas vê enquanto os cria. E o custo não é o rebase: é que cada lado toma
decisões sobre um ficheiro que o outro já mudou.

Se o outro lado publicou entretanto: `git pull --rebase` e resolve. Rebase, não
merge — o histórico fica legível e a ordem dos factos preserva-se.

> Isto nasceu de um erro real. O agente da nuvem sabia que o do Mac tinha três
> commits por publicar e avançou na mesma, a apostar que as regiões do ficheiro
> não se sobrepunham. Não se sobrepuseram, mas a aposta não era dele para fazer
> — e sobrou um rebase para o outro lado. A regra existe para não voltar a haver
> aposta nenhuma.

**Nunca trabalhes a partir de um zip.** Um snapshot não tem histórico, não
publica, e não sabe o que aconteceu entretanto. Se receberes um, usa-o só para
ler; o trabalho é no clone.

**O repositório atende por dois nomes.** `pedromouzinho/dbdeai` e
`pedromouzinho/FoodboxdV2-APP` são o **mesmo repositório** — foi renomeado e o
GitHub redireciona. Não são dois sítios e não é preciso escolher.

## O que não fazer sem perguntar

- **Não introduzas frameworks, bundlers nem bibliotecas de componentes.** A app é
  vanilla por decisão do dono: um `index.html`, um `css/style.css`, módulos IIFE
  em `js/`.
- **Não publiques em produção sem pedir.** O deploy é manual, em GitHub Actions →
  *Deploy (produção)*.
- **Não corras nada destrutivo contra a base de dados real.** Há oito pessoas com
  dados lá dentro. Para apagar conta e afins, usa o emulador
  (`npm run emu:start`) ou uma conta acabada de criar, sem amigos nem grupos.

## Antes de dar trabalho por feito

```bash
npm run preview        # telemóvel e ecrã grande, claro e escuro
npm run audit          # contraste, alvos de toque, transbordo, ids repetidos
npm run test:map
npm run test:update
```

Se mexeres em ficheiros que a app corre, corre-os. Se só mexeres em documentação,
diz que não os correste e porquê — não os dês por corridos.

**Um teste que nunca falhou não prova nada.** Ao acrescentar uma verificação,
corre-a primeiro contra o código com o defeito e mostra que ela falha.

**Se um arnês falhar pelo ambiente e não pelo código, o defeito é do arnês.**
Corrige-o — não o contornes nem o ignores. Já aconteceu duas vezes: dois deles
tinham o caminho do Chromium do contentor escrito à mão e nunca arrancaram no
Mac, e outros dois dependiam de não haver rede para a Google, passando de um
lado e falhando do outro com o mesmo código. Um arnês que só funciona numa
máquina não é um arnês, é um hábito.

**E a quinta da mesma família foi a pior de ver:** um teste a **passar** por
causa do ambiente. O convite de sessão só abre se o SDK do Firebase vier do
gstatic; sem rede à Google nunca abria, e o ensaio media o contrário do que diz
medir. O sintoma de um arnês dependente do ambiente nem sempre é vermelho.

**Repara ainda que nem todos falham em voz alta.** O `test:map` imprime números
em vez de os afirmar: sai com 0 mesmo quando o enquadramento está errado. Ao
mexer nele, compara os números — `fitBounds: 1`, zoom travado em 14,
`resetView` em 9 — e não o código de saída.

**E a sexta é a pior de todas, porque a ferramenta não se cala: responde ao
contrário.** O `codesign -d --entitlements` mostra um dict **vazio** numa app de
simulador sem equipa de desenvolvimento, mesmo quando os entitlements estão a
funcionar — o Xcode não os embute na assinatura, mas o simulador aplica-os à
mesma. Quem acredita no comando conclui o oposto da verdade e vai desfazer o que
estava certo. A prova a sério está no log do `securityd`:

```
inserted <genp,acct=OAuth,svce=auth,agrp=pt.foodboxd.app,...>
```

A regra que sai daqui vale para além do `codesign`: **antes de concluir a partir
de uma ferramenta, pergunta se ela sabe responder à pergunta que lhe fizeste.**

**A sétima é o `test:apagar`, e corria a meio sem nunca o dizer.** Duas coisas,
a mesma família:

- O emulador do Firestore é uma aplicação **Java**, e o macOS não traz Java
  nenhum. Pior: o `brew install openjdk` instala uma fórmula **keg-only**, que
  fica fora do PATH de propósito — a máquina tem Java e o comando diz que não
  tem. O `npm run emu:start` passou a ser o [`scripts/emu.mjs`](scripts/emu.mjs),
  que **procura** o JDK (PATH → `/usr/libexec/java_home` → Homebrew nas duas
  arquiteturas) em vez de ter um caminho escrito à mão, que é o erro do
  Chromium outra vez.
- O ensaio punha `FIRESTORE_EMULATOR_HOST` e `FIREBASE_AUTH_EMULATOR_HOST` e
  **esquecia-se do Storage**. Sem `STORAGE_EMULATOR_HOST` o Admin SDK fala com o
  Google a sério — e as três afirmações sobre ficheiros caíam sempre num ramo
  `if (contagem.ficheirosRestaurantes === null)` que **não afirma nada e não
  conta como falha**. Nunca correram. Correram pela primeira vez a 24/08/2026.

Repara no que isto tem de comum com a quinta: **o ramo de escape que existe para
o ensaio ser tolerante é o sítio onde ele se esconde.** Um `if (não dá para
medir) { não medir }` é honesto no código e mentiroso no resumo, porque o
contador de falhas fica a zero na mesma. Quando escreveres um, faz com que ele
**diga em voz alta** o que deixou de medir — e vai ver se não está a ser o
caminho normal.

**A oitava falhava ao calhar, e a correção já estava escrita seis linhas acima.**
O `test:update` tinha um caso — o convite de sessão — a **contar 1500 ms** em vez
de esperar pelo sinal. Falhou uma vez com `cor=rgb(4, 5, 6)`, que é a cor do caso
anterior: o recarregamento ainda não tinha chegado. Passou nas três seguintes com
o mesmo código.

O que faz disto um caso a registar não é a corrida, é onde ela estava: **os casos
1 e 2 já tinham sido corrigidos, com um comentário a explicar porquê** — *"esperar
pelo sinal real em vez de contar segundos… já apanhei uma passagem e uma falha
seguidas"* — e o caso 3, logo a seguir, ficou com o defeito que o comentário
descreve. Uma correção que se aplica a um caso e não aos irmãos ao lado.

Duas coisas para levar daqui:

- **Um arnês que falha ao calhar é um defeito do arnês**, mesmo quando passa nas
  vezes seguintes. Não se corre outra vez até dar verde: espera-se pela
  **condição**, com prazo, e o prazo esgotado deixa o `chk` falhar com o valor à
  vista em vez de rebentar com um traço de pilha.
- **Ao corrigir uma corrida, procura os irmãos.** Se um caso contava tempo, os
  outros do mesmo ficheiro provavelmente também contam. Havia mais dois. Mas
  **nem todos**: onde se afirma que uma coisa **não** mudou, esperar tempo é o
  certo — não há condição por que esperar, e trocá-la por uma espera de condição
  seria trocar um defeito por outro.

E, ao puxar por este fio, apareceu o de baixo, que é o mesmo defeito com pior
consequência: **um `await` de 60 s sem `.catch` rebentava com um traço de pilha
em vez de dar uma linha de FALHA** — e, se esgotasse, a afirmação seguinte
**passava por engano**, porque a cor continuava a antiga por não ter havido
atualização nenhuma para travar. Um verde a dizer o contrário do que mede.
Passou a ser uma afirmação com nome (o `test:update` tem agora **7** casos, não
6). Apanhado uma vez em dez e não reproduzido em dez corridas seguidas depois —
está **domado**, não está provado resolvido.

**A regra curta:** num arnês, uma espera que possa esgotar ou é uma afirmação com
nome, ou é um traço de pilha à espera de acontecer — e às vezes é um falso verde,
que é pior do que os dois.

## Onde está o resto

| Ficheiro | O que é |
| --- | --- |
| [`HANDOFF-IOS-AGENTE.md`](HANDOFF-IOS-AGENTE.md) | Levar a app à App Store: quem executa o quê, e a prova de cada passo |
| [`SETUP_IOS.md`](SETUP_IOS.md) | Referência técnica do Capacitor e do projeto iOS |
| [`DESIGN-HANDOFF.md`](DESIGN-HANDOFF.md) | Handoff de UI/UX: estado das fases e desvios deliberados |
| [`CONTEXT.md`](CONTEXT.md) | **Começa aqui se chegaste agora.** Estado do projeto, e a secção 12 com o que só se soube a correr a app |
| [`README.md`](README.md) | O que a app é e como está montada |
