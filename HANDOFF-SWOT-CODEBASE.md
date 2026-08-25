# Handoff: uma SWOT profunda da codebase do Foodboxd

**Para quem é:** um modelo a fazer uma análise SWOT da codebase, comparando-a com
o que se espera de uma app de consumo profissional. Foi escrito para o **Fable**,
mas serve qualquer sessão que chegue de fora.

**Como usar:** abre uma sessão na raiz do repositório e diz *"lê o
`HANDOFF-SWOT-CODEBASE.md` e faz o que ele pede"*. Não é preciso colar nada.

---

## O que se pede, em duas frases

Uma análise SWOT — forças, fraquezas, oportunidades, ameaças — da codebase do
Foodboxd, **medida e não estimada**, comparada com o que uma equipa profissional
teria numa app de consumo equivalente prestes a ir para a App Store.

A pergunta a que a análise responde no fim é esta: **se esta app tiver sucesso e
passar de 8 pessoas para 8 000, o que é que parte primeiro, e o que é que já
está bem construído para aguentar?**

---

## Antes de tudo: o erro que torna esta análise inútil

Uma SWOT de uma codebase pequena, escrita por um modelo, tende a produzir sempre
a mesma lista: *não usa framework, não tem TypeScript, tem um ficheiro de 5 000
linhas, não tem testes unitários, o CSS é global.* Cada um destes pontos é
verdadeiro aqui. **E quase nenhum é útil**, por duas razões diferentes:

**Uns são decisões deliberadas do dono, tomadas com razão escrita.** Recomendar o
contrário é não ter lido. A secção *"O que não é defeito"* lista-as, com a razão
de cada uma. Podes discordar delas — mas discordar exige argumentar contra a
razão que lá está, não ignorá-la.

**Outros são verdadeiros e irrelevantes à escala a que esta app vive.** Um
ficheiro de 5 000 linhas é um problema quando cinco pessoas lhe mexem ao mesmo
tempo. Aqui mexem-lhe duas sessões de agente, uma de cada vez, com uma regra
escrita a impedir simultaneidade. O custo real é outro — e é esse que interessa
nomear.

> **A regra de método, e é a mais importante deste documento:** cada fraqueza que
> apontares tem de vir com **o dano concreto que causa, a quem, e quando**. "Não
> tem testes unitários" não é um achado. "O `applyGroupFilter` decide quem vê o
> quê e não tem teste nenhum; se alguém lhe partir a condição de bloqueio, uma
> pessoa bloqueada volta a aparecer no feed e ninguém dá por isso" é um achado.

---

## O que a app é

O Foodboxd é um **diário de restaurantes**: um mapa de sítios que valem a pena e
um registo privado do que se comeu em cada um. Está em produção em
[foodboxd.pt](https://foodboxd.pt) com **oito pessoas reais lá dentro** — não é
um projeto de gaveta — e está a ser levada à App Store como app iOS.

| | |
| --- | --- |
| Forma | PWA em JavaScript vanilla, sem framework e sem passo de build |
| Nativo | Capacitor 6 a embrulhar a web app numa WKWebView |
| Servidor | Firebase — Auth, Firestore (por REST), Storage, Functions em `europe-west1` |
| IA | Anthropic, atrás de uma Cloud Function, para a funcionalidade «Pergunta-me» |
| Publicação | Firebase Hosting, disparado por GitHub Actions |
| Equipa | **uma pessoa**, com dois agentes a trabalhar no mesmo ramo, um de cada vez |

**Quem escreveu isto:** o dono não é engenheiro de software de profissão. Quase
todo o código foi escrito por agentes, sob direção dele. Isso importa para a
análise: as decisões arquiteturais foram tomadas por quem tem de as conseguir
manter sozinho daqui a seis meses, e a legibilidade vale mais aqui do que valeria
numa equipa com revisão de código a sério.

---

## O que não é defeito

Estas decisões estão escritas no [`CLAUDE.md`](CLAUDE.md) e no
[`CONTEXT.md`](CONTEXT.md). **Não as trates como dívida técnica por descobrir.**
Se as quiseres contestar, contesta a razão.

| Decisão | A razão que está escrita |
| --- | --- |
| **Vanilla JS, sem framework** | O dono quer conseguir ler e mudar o código sozinho. Um framework acrescenta uma camada que ele não domina e que o prenderia a versões |
| **Sem bundler, sem passo de build** | O que está no repositório é o que corre no browser. Não há mapa de fontes a consultar nem build a reproduzir quando alguma coisa corre mal às onze da noite |
| **Módulos IIFE em `js/`, expostos no `window`** | É a consequência de não haver bundler, não um descuido |
| **Firestore por REST em vez do SDK** | O SDK do Firestore é grande e a app carrega tudo sem empacotamento |
| **Contas da Google e da Apple separadas de propósito** | Decidido não ligar, com a razão escrita e o gatilho que reabriria a decisão |
| **Sem verificação de email no registo** | Decidido para a 1.0, escrito como decisão e não esquecimento |

Há mais decisões deste tipo espalhadas em comentários no topo dos ficheiros. Os
comentários longos deste repositório **não são ruído** — são onde vive o porquê.
Lê-os antes de julgar o código que encabeçam.

---

## O que já se sabe, para não o redescobrires

Estas coisas já estão identificadas. Confirmá-las é útil; apresentá-las como
descoberta não é. O que vale a pena é **medir o dano** de cada uma, que é
exatamente o que ainda não está feito.

- **`js/app.js` tem ~4 900 linhas** e mistura responsabilidades: ecrãs, gestos,
  tutorial, moderação, perfis, teclado.
- **Código morto do bloqueio de sessão.** A app passou a exigir conta a 25/08 e
  ficaram ramos "sem sessão" que já não são alcançáveis — `#signin-btn`,
  `#signin-modal`, guardas `showSigninModal()`.
- **Não há testes unitários.** Há cinco arneses de ponta a ponta, e o
  [`CLAUDE.md`](CLAUDE.md) tem **nove lições sobre arneses que mentiram** —
  incluindo um que passava sobre código partido. Essa secção é o melhor material
  deste repositório e devia informar a tua análise de qualidade.
- **Node 20 nas Cloud Functions** é decomissionado a 30/10/2026.
- **Não há monitorização nem registo de erros.** Se alguém tiver um erro amanhã,
  não há onde o ver.

---

## O mapa da codebase

<!-- MAPA -->

---

## Contra o que comparar

"Uma app profissional" é vago e produz conselhos genéricos. Usa este alvo
concreto:

> Uma app de consumo iOS, gratuita, com conteúdo gerado por utilizadores,
> mantida por uma equipa pequena (3–6 pessoas) numa empresa a sério, com
> ~50 000 utilizadores registados e cerca de dois anos de vida.

É deliberadamente uma equipa pequena e não a Google: comparar um projeto de uma
pessoa com a infraestrutura da Uber não produz nada acionável. O que essa equipa
teria e vale a pena confrontar item a item:

- registo de erros com alertas, e uma forma de saber que uma versão nova partiu
  alguma coisa **antes** de um utilizador escrever;
- testes que correm em cada alteração, e uma noção de cobertura;
- capacidade de reverter uma publicação em minutos;
- revisão de código por outra pessoa;
- gestão de segredos e rotação de chaves;
- um modelo de dados com migrações versionadas;
- acessibilidade verificada, não presumida;
- orçamento de desempenho e medição real em dispositivos lentos;
- uma resposta escrita para um incidente de segurança ou de dados.

**Para cada um: o Foodboxd tem? o que tem em vez disso? o que custa não ter, à
escala de hoje e à escala de 100× ?**

---

## Como quero a análise

**Quatro quadrantes, mas com peso desigual.** As forças e as fraquezas são sobre
o que existe hoje, medido. As oportunidades e as ameaças são sobre o que muda com
a escala, com o tempo, e com a App Store. Não distribuas o esforço por igual —
as fraquezas e as ameaças é onde está o valor.

**Cada ponto leva:**

| | |
| --- | --- |
| **A prova** | `ficheiro:linha`, ou o comando que correste e o que devolveu |
| **O dano** | o que corre mal em concreto, a quem, e em que circunstância |
| **A escala** | isto dói hoje com 8 pessoas, ou só com 8 000? |
| **O custo de arranjar** | minutos, horas, dias — e o que se parte ao arranjar |

**Ordena por dano × probabilidade,** não por quadrante e não por facilidade.

**No fim, três listas curtas:**

1. **O que arranjava em três dias**, se fossem os últimos três dias antes de a
   app crescer a sério. No máximo cinco coisas, por ordem.
2. **O que deixava exatamente como está**, e porquê — incluindo coisas que
   parecem defeitos e não são. Esta lista é tão importante como a primeira.
3. **A pergunta que não consegui responder a ler o código**, e o que seria
   preciso para a responder.

**O que não quero:** uma tabela de quatro caixas com marcadores de uma linha. Uma
recomendação de framework. Uma contagem de linhas apresentada como diagnóstico.
Nada que comece por "considerar" ou "avaliar a possibilidade de".

---

## Método

**Mede, não estimes.** É a regra desta casa e tem nove histórias por trás dela no
[`CLAUDE.md`](CLAUDE.md), todas de coisas que pareciam medidas e não eram. A que
mais interessa a quem chega:

> **Antes de concluíres a partir de uma ferramenta, pergunta se ela sabe
> responder à pergunta que lhe fizeste.** O `codesign -d --entitlements` mostra
> um dicionário vazio numa app de simulador mesmo quando os entitlements estão a
> funcionar. Quem acredita no comando conclui o oposto da verdade.

**Quando não conseguires medir, diz "não medi".** Vale mais uma lacuna admitida
do que uma inferência apresentada como facto. O repositório inteiro está escrito
com essa regra e nota-se quando alguém a quebra.

**Os documentos deste repositório estão desatualizados em pontos.** O
[`CONTEXT.md`](CONTEXT.md) e o [`HANDOFF-IOS-AGENTE.md`](HANDOFF-IOS-AGENTE.md)
são pistas, nunca provas — a app mudou muito nos últimos dias e nem tudo os
alcançou. A prova é o código, o `git log`, ou um `curl` ao site.

**O que podes correr:** qualquer coisa de leitura. `npm run audit` e os quatro
testes correm sem tocar em nada. O `npm run test:apagar` precisa do emulador
(`npm run emu:start`) e é o único destrutivo — corre contra o emulador, nunca
contra a base de dados real, que tem dados de oito pessoas.

**O que não podes fazer:** alterar ficheiros, fazer commit, publicar. Esta sessão
é de leitura e de juízo. Se encontrares uma correção óbvia, escreve-a na análise
em vez de a aplicares — quem decide o que entra é o dono.

---

## Onde está o resto

| Ficheiro | O que é |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | As regras da casa, e as nove lições sobre arneses que mentiram |
| [`CONTEXT.md`](CONTEXT.md) | Estado do projeto; a secção 12 tem o que só se soube a correr a app |
| [`HANDOFF-IOS-AGENTE.md`](HANDOFF-IOS-AGENTE.md) | O caminho até à App Store, e a tabela do que falta |
| [`DESIGN-HANDOFF.md`](DESIGN-HANDOFF.md) | Estado do desenho e os desvios deliberados |
| [`SETUP_IOS.md`](SETUP_IOS.md) | Referência do Capacitor e do projeto iOS |
| [`README.md`](README.md) | O que a app é e como está montada |
