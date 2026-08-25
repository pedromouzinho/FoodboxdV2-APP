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

| Ficheiro | O que mostra | Porquê este |
| --- | --- | --- |
| `01-mapa.png` | Portugal inteiro, com os pins espalhados de Braga ao Algarve | É o que a app é à primeira vista, e mostra que não está vazia |
| `02-lista.png` | «68 RESTAURANTES», cartões com foto, avaliação, preço e especialidade | Prova densidade e qualidade de informação sem ser preciso ler |
| `03-ficha.png` | Monte d'Açorda: foto, 4.6 (759), €€€, telefone, especialidade | Mostra o que se ganha ao tocar num sítio |
| `04-filtros.png` | Cozinha, estilo, região, preço | Mostra que a lista se dobra ao que apetece hoje |

**Todos foram tirados sem sessão iniciada**, de propósito: é o que o revisor vai
ver, e é o argumento da nota ao revisor — a app vê-se toda sem conta.

> **O que falta, e é uma escolha:** um quinto ecrã com o diário ou o
> «Pergunta-me» a responder mostraria a parte pessoal, que é metade do produto.
> Exige sessão com dados dentro, portanto exige o dono. **Vale a pena** — é o que
> distingue a app de um directório de restaurantes.

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
| Support URL | ⚠️ **por definir** | Ver abaixo |
| Marketing URL | `https://foodboxd.pt` | Opcional, mas já existe |
| Sign-in required | **NO** | Medido: a app vê-se toda sem conta (secção 4.4 do handoff) |

> ⚠️ **O Support URL é obrigatório e ainda não existe.** Tem de ser uma página
> onde alguém consiga pedir ajuda. As saídas, por ordem de esforço: apontar para
> `foodboxd.pt/privacidade`, que já tem o email de contacto (aceite, mas é
> estranho); ou uma página `foodboxd.pt/ajuda` com três linhas e o mesmo email.
> **A segunda é meia hora e fica melhor.**

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

**Para não ter de responder isto em cada versão**, acrescenta-se ao `Info.plist`:

```xml
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

> Se o dono quiser, o agente põe isto no `ios-info.json` para ficar versionado,
> como os textos de permissão — o `Info.plist` é gerado e descartável, e à mão
> desaparecia no clone seguinte.

---

## O que fica por decidir

1. **O Support URL** — a página de ajuda, ou o atalho para a de privacidade.
2. **O quinto screenshot** — o diário ou o «Pergunta-me», que exige sessão.
3. **A descrição** — está escrita, e é a peça que mais merece ser lida devagar.
   O «O QUE NÃO HÁ» no fim é uma aposta deliberada: numa loja cheia de apps que
   vivem de publicidade, dizer que não há nenhuma é o argumento mais forte que
   esta app tem. Se soar a arrogante, corta-se.
