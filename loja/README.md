# Metadados da App Store — rascunho para aprovar

> **O que é isto:** tudo o que a App Store Connect pede ao lado da build, escrito
> para ser copiado campo a campo. Os textos são um rascunho do agente; **a
> decisão é do dono** — sobretudo a descrição, que é a promessa que a app faz a
> quem nunca a viu.
>
> Os limites de caracteres estão contados e verificados. Ultrapassá-los faz o
> formulário recusar, e reescrever à pressa no browser é como se perde o tom.

---

## Screenshots

`loja/screenshots/`, **1320 × 2868** — a medida de 6,9 polegadas (iPhone 17 Pro
Max), que é a que a App Store exige hoje para iPhone. As restantes medidas são
derivadas por ela, e por isso não é preciso tirá-las.

| # | Ficheiro | O que mostra | Porquê este, e por esta ordem |
| --- | --- | --- | --- |
| 1 | `01-mapa.png` | Portugal inteiro, pins de Braga ao Algarve, alguns já marcados | É o que a app é à primeira vista, e os pins preenchidos mostram que é *um diário*, não um directório |
| 2 | `02-pergunta-me.png` | A IA a responder: «Maria Catita · 4.7 (8558) · €€€ · 2 km», a citar o gosto de quem pergunta | **É o que mais distingue a app.** Cita o perfil de gosto e dá distâncias reais |
| 3 | `03-diario.png` | «16 restaurantes · 10 críticas · 18 pratos», com as fotos | A metade pessoal do produto, e a razão para voltar |
| 4 | `04-lista.png` | «68 RESTAURANTES», cartões com foto, nota, preço e especialidade | Densidade de informação sem ser preciso ler |
| 5 | `05-ficha.png` | Monte d'Açorda: foto, 4.6 (759), €€€, telefone, especialidade | O que se ganha ao tocar num sítio |
| 6 | `06-filtros.png` | Cozinha, estilo, região, preço | A lista dobra-se ao que apetece hoje |

**A ordem não é decorativa:** na App Store, os dois primeiros são os que aparecem
nos resultados de pesquisa sem ninguém abrir a página. Por isso o mapa abre e o
«Pergunta-me» vem logo a seguir — é o que ninguém mais faz.

**Os 1, 4, 5 e 6 foram tirados sem sessão**, que é o que o revisor vê e o que a
nota ao revisor afirma. O 2 e o 3 exigem conta, e mostram-na com dados reais.

> ⚠️ **Repara no que o 2 e o 3 mostram de verdade:** restaurantes que o dono
> visitou, e um texto da IA que cita o gosto dele por nome. É a conta real. Numa
> montra pública isso é uma escolha, não um detalhe — se preferires ecrãs com
> dados neutros, é preciso uma conta de demonstração povoada de propósito.

---

## Campos de texto

### Nome · máx. 30
```
Foodboxd
```

### Subtítulo · máx. 30 (usa 28)
```
O teu diário de restaurantes
```

### Texto promocional · máx. 170
Muda-se sem submeter versão nova — é o sítio para novidades sazonais.
```
Um mapa dos sítios que valem a pena e um diário do que comeste. Sem conta para
explorar; com conta para guardares o que é teu.
```

### Palavras-chave · máx. 100, separadas por vírgulas, sem espaços depois
Não repetir o nome da app nem a categoria: já são indexados.
```
restaurantes,tascas,petiscos,onde comer,diario,mapa,marisqueira,portugal,avaliacoes,pratos
```

### Descrição · máx. 4000

```
O Foodboxd é um mapa dos restaurantes que valem a pena e um diário do que
comeste neles.

Não é mais um agregador de avaliações anónimas. É o teu registo: onde foste, o
que pediste, e o que achaste — para não voltares a olhar para uma lista de
sítios sem saber qual deles já te correu bem.

SEM CONTA, JÁ FUNCIONA
Abre e vês o mapa inteiro, a lista, os filtros e a ficha de cada sítio, com
avaliação, escala de preços, telefone e a especialidade da casa. Só precisas de
conta para guardar o que é teu.

O MAPA
Todos os sítios num mapa, de Braga ao Algarve. Filtra por cozinha, por estilo —
tasca, petiscos, casual, fine dining — por região e por preço. Ou escreve o nome
de um prato e encontra quem o faz.

O DIÁRIO
Marca como visitado, dá estrelas, escreve o que quiseres e regista os pratos que
provaste. Junta fotografias. Da próxima vez que passares à porta, sabes o que
pedir.

A LISTA DE DESEJOS
Marca os sítios onde ainda queres ir. Deixa de haver aquele restaurante de que
te lembras vagamente e nunca mais encontras.

PERGUNTA-ME
Descreve o que te apetece — «peixe fresco, barato, perto e tranquilo» — e a app
sugere, cruzando o teu gosto, a tua lista e onde estás. A localização é pedida
só aqui, nunca ao abrir, e a app funciona sem ela.

OS AMIGOS
Segue quem quiseres acompanhar e vê onde andaram e o que acharam. Cria grupos
para separares a malta do trabalho da malta do costume.

O QUE NÃO HÁ
Sem publicidade. Sem seguimento para publicidade. Sem venda de dados. Apagas a
conta dentro da app, e apaga mesmo — incluindo as fotografias.

Feito em Portugal.
```

---

## Escolhas do formulário

| Campo | Resposta | Porquê |
| --- | --- | --- |
| Categoria principal | **Food & Drink** | É o que a app é |
| Categoria secundária | **Travel** | Apanha quem procura onde comer numa viagem |
| Idioma principal | **Português (Portugal)** | A app é toda em português |
| Privacy Policy URL | `https://foodboxd.pt/privacidade` | Já está no ar, verificada com HTTP 200 |
| Support URL | `https://foodboxd.pt/ajuda` | Escrita, ver abaixo |
| Marketing URL | `https://foodboxd.pt` | Opcional, mas já existe |
| Sign-in required | **NO** | Medido: a app vê-se toda sem conta (secção 4.4 do handoff) |

**✅ A página de ajuda existe** — [`ajuda.html`](../ajuda.html), servida em
`/ajuda`. O dono deixou a decisão ao agente, e a decisão foi não usar o atalho:
apontar o *Support* para a política de privacidade é obrigar quem tem um
problema a ler um texto legal, e nota-se.

Responde ao que uma pessoa presa realmente pergunta — preciso de conta, entrei
pela Google e perdi o que tinha na Apple, porque me pede a localização, quem vê o
que escrevo, como denuncio, como apago a conta — e tem o email em cima, antes de
tudo. Faz de caminho um segundo serviço: **a diretriz 1.2 exige contacto
publicado**, e agora há um.

---

## Classificação etária

O questionário da Apple pergunta pelo conteúdo. A resposta que importa:

> **A app tem conteúdo gerado por utilizadores?** — **Sim.** Fotografias e
> críticas escritas por pessoas, visíveis a outras.

Isto é o que ativa a exigência da diretriz 1.2 — **e essa parte está cumprida**:
há denunciar, há bloquear, há desbloquear, e as denúncias vão para o Firestore.
Ver a secção 4.0 do handoff, com as medições.

Tudo o resto é **Nenhum/Não**: sem violência, sem conteúdo sexual, sem jogo a
dinheiro, sem álcool ou tabaco como tema (que apareçam num prato ou numa carta
de vinhos não conta), sem acesso irrestrito à web.

> **Nota sobre a última:** a app abre o Google Maps e a política de privacidade
> num browser externo. São destinos fixos, não um browser dentro da app — a
> resposta continua a ser *não*.

Com estas respostas a classificação esperada é **12+** (por causa do UGC). Se o
formulário devolver outra coisa, vale a pena reler as respostas antes de aceitar.

---

## Conformidade de exportação

> **A app usa encriptação?** — Usa **apenas HTTPS**, e nada mais.

Isso cai na isenção habitual. Na prática responde-se que a app usa encriptação,
e a seguir que é **só encriptação padrão do sistema** (HTTPS/TLS), o que dispensa
a documentação de exportação.

**✅ E já não é preciso responder em cada versão.** O
`ITSAppUsesNonExemptEncryption = false` está no [`ios-info.json`](../ios-info.json),
versionado como os textos de permissão, e o `scripts/ios-info.mjs` escreve-o no
`Info.plist` a cada `npm run sync`.

> **O tipo importava, e quase passava.** O script escrevia tudo como *string*, e
> `"false"` num plist é um valor presente que a Apple lê como verdadeiro — a
> pergunta voltaria em cada versão, que é o oposto do que a chave existe para
> fazer. Passou a escrever `bool` quando o valor é booleano. Confirmado com
> `plutil -p`: `"ITSAppUsesNonExemptEncryption" => false`, sem aspas.

---

## O que fica por decidir

1. **Se os screenshots 2 e 3 podem levar dados reais** — ver o aviso lá em cima.
2. **A descrição** — está escrita, e é a peça que mais merece ser lida devagar.
   O «O QUE NÃO HÁ» no fim é uma aposta deliberada: numa loja cheia de apps que
   vivem de publicidade, dizer que não há nenhuma é o argumento mais forte que
   esta app tem. Se soar a arrogante, corta-se.
