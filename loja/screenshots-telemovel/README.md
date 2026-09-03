# Screenshots do telemóvel (26/08/2026)

Cinco capturas tiradas no iPhone do dono, com a app a sério e dados a sério —
ao contrário das seis em [`../screenshots/`](../screenshots/), que são do
simulador com a conta de testes. Ficam as duas: estas são mais bonitas (fotos
reais, mapa cheio, feed com atividade), aquelas não levantam a questão da
privacidade que está aqui em baixo.

## O que carregar, e onde

A página de submissão mostra o slot **iPhone 6.5" Display**, que aceita
`1284 × 2778` — é a pasta `6.5-1284x2778`. A pasta `6.9-1320x2868` existe
porque é o tamanho do conjunto antigo e o que a App Store Connect pede quando
mostra o slot de 6.9"; carrega-se a que a página pedir nesse dia, sem ter de
voltar a converter nada.

A ordem dos nomes é a ordem de exibição, e não é arbitrária: a própria página
avisa que **só as três primeiras aparecem na folha de instalação**, por isso
os três primeiros são os que respondem "o que é isto?" — o mapa, um
restaurante, e a pergunta à IA. Na App Store Connect a ordem muda-se
arrastando, se preferires outra.

| # | Ecrã | Porque está aqui |
| --- | --- | --- |
| 01 | Mapa | O gancho: Portugal cheio de pinos agrupados |
| 02 | Ficha (Gambrinus) | O que se ganha ao abrir um sítio: avaliação, preço, ligar, direções |
| 03 | Sugestão / Pergunta-me | A única coisa que nenhuma app de listas faz |
| 04 | Diário | O registo pessoal — 16 restaurantes, 10 críticas, 18 pratos |
| 05 | Amigos | A camada social: quem visitou o quê, e as fotos |

## Duas coisas ditas antes de alguém tropeçar nelas

**1. A 05-amigos leva gente real para uma página pública.** Aparece o nome e a
fotografia de perfil de uma pessoa (Leonor Marques), e a fotografia partilhada
mostra as caras de outros clientes do restaurante, que não sabem que estão
numa loja de aplicações. A App Store é pública, mundial e indexada. Antes de
carregar esta, ou se pede autorização a quem lá está, ou se repete o ecrã com
a conta de testes. As outras quatro não têm este problema.

**2. A barra de estado está invisível, e não é defeito da captura.** Nas 01,
04 e 05 não se vê a hora nem a bateria porque o
[`index.html:909`](../../index.html#L909) manda
`StatusBar.setStyle({ style: "DARK" })` — e no plugin do Capacitor `DARK`
quer dizer *texto claro para fundos escuros*. O fundo da app é creme
(`#f6f1e7`), logo o texto branco desaparece. Medido: na zona da hora, a 01 vai
de `255,255,255` a `254,255,250` — contraste nenhum. Nas 02 e 03 vê-se porque
o escurecimento do modal serve de fundo.

Para os screenshots isto até é limpo, e muitas apps escondem a barra de
propósito. Para quem usa a app todos os dias não é: perde a hora e a bateria
enquanto lá está. A correção é uma palavra (`LIGHT`), mas mexe no aspeto de
todos os ecrãs claros — por isso fica dita aqui e decide-se à parte, em vez de
entrar de contrabando num commit de imagens.

## Como foram feitos

Origem: `IMG_8122`–`IMG_8126.HEIC`, 1206 × 2622 (iPhone 16 Pro), convertidos
com o script que está na mensagem do commit. Display P3 → sRGB, JPEG sem canal
alfa (o carregador da Apple recusa alfa), escala pela largura e o excesso de
altura cortado **pelo topo** — 2 px no 6.9", 14 px no 6.5", tudo dentro da
faixa vazia da barra de estado. Cortar por baixo comeria a tabbar, que é
conteúdo.
