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

**Mais do que um commit por publicar é o sinal de que algo vai correr mal.** Se
o trabalho é longo, parte-o em commits e publica cada um.

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

**Repara ainda que nem todos falham em voz alta.** O `test:map` imprime números
em vez de os afirmar: sai com 0 mesmo quando o enquadramento está errado. Ao
mexer nele, compara os números — `fitBounds: 1`, zoom travado em 14,
`resetView` em 9 — e não o código de saída.

## Onde está o resto

| Ficheiro | O que é |
| --- | --- |
| [`HANDOFF-IOS-AGENTE.md`](HANDOFF-IOS-AGENTE.md) | Levar a app à App Store: quem executa o quê, e a prova de cada passo |
| [`SETUP_IOS.md`](SETUP_IOS.md) | Referência técnica do Capacitor e do projeto iOS |
| [`DESIGN-HANDOFF.md`](DESIGN-HANDOFF.md) | Handoff de UI/UX: estado das fases e desvios deliberados |
| [`CONTEXT.md`](CONTEXT.md) | Handoff técnico completo do projeto |
| [`README.md`](README.md) | O que a app é e como está montada |
