# Sistema visual

O aplicativo usa um tema escuro construído em torno das cores da marca: `#1B1717` no lugar do branco e
`#810100` no lugar do azul da referência que originou o desenho.

## Conceito

Sala de leitura jurídica à noite. O oxblood entra como **estrutura** — fio de cabeçalho, marcador da página
ativa, preenchimento de ação — e não espalhado pela tela. Vermelho em toda parte vira alarme, e este é um
aplicativo que fica aberto o dia inteiro.

## Cores

| Token | Valor | Uso |
| --- | --- | --- |
| `--base` | `#131010` | janela, atrás do painel |
| `--surface` | `#1B1717` | painel de conteúdo, a cor da marca |
| `--raised` | `#241F1F` | cartões, campos, linhas de lista |
| `--hover` | `#2E2727` | estado de passagem do mouse |
| `--line` | `#362E2E` | bordas |
| `--line-strong` | `#493E3E` | bordas de controle e barra de rolagem |
| `--text` | `#F5F0EF` | texto principal |
| `--muted` | `#A79C9B` | texto de apoio |
| `--dim` | `#8C8080` | rótulos e legendas |
| `--blood` | `#810100` | preenchimento de botões e marca |
| `--blood-bright` | `#A50302` | passagem do mouse sobre preenchimento |
| `--blood-ink` | `#E9736E` | vermelho quando precisa ser texto |
| `--green` | `#5FA383` | confirmação, status conferido |
| `--amber` | `#C9964A` | avisos que não são erro |

O `#810100` da marca tem 1,07:1 de contraste sobre o fundo escuro: é ilegível como texto. Por isso ele
preenche superfícies e o `--blood-ink` cobre os casos em que o vermelho precisa ser lido. Sobre o oxblood
preenchido, o texto é branco puro, com 10,8:1.

Contrastes medidos na tela, todos acima do mínimo AA de 4,5:1:

| Elemento | Contraste |
| --- | --- |
| título e texto principal | 15,7:1 |
| texto de apoio | 6,7:1 |
| eyebrow e marca em vermelho claro | 6,0:1 |
| rótulos menores | 4,7:1 |
| botão primário | 10,8:1 |

## Tipografia

Três famílias, cada uma com uma função:

- **Archivo Variable**, com o eixo de largura em 104% a 112%, nos títulos. Herança de jornal, autoridade sem
  gritar. O eixo de largura é o que a distingue de uma geométrica comum.
- **Manrope Variable** na interface: navegação, rótulos, botões, formulários.
- **Newsreader Variable** apenas no texto da publicação, na lista e na gaveta de detalhes. É o conteúdo que
  a pessoa realmente lê; dar a ele uma face de leitura, com entrelinha de texto corrido, é decisão
  funcional, não decoração.

## Forma

Cromo arredondado, dados retos. O painel usa 20 px de raio, cartões 14 px, campos 9 px e botões viram
pílula. Já as linhas da lista de publicações não têm raio nem fundo: numa lista longa, densidade e
alinhamento valem mais que suavidade.

## Detalhes de identidade

- fita oxblood de 3 px marcando o item ativo da navegação, como marcador de livro;
- fio vermelho curto sob cada título de página, como régua de cabeçalho de jornal;
- publicação marcada como `Requer atenção` com barra vermelha na borda esquerda;
- brilho radial oxblood no canto superior direito da janela, dando profundidade sem textura falsa;
- barras de rolagem escuras, porque as claras do Windows destoavam do tema.

## Comportamento da rolagem

A barra lateral é fixa em `100vh` e não acompanha a rolagem; apenas o painel de conteúdo rola, com
`overflow-y: auto`. A faixa superior do painel usa `position: sticky`, então o selo do monitor continua
visível durante a leitura. Abaixo de 820 px de largura o layout volta a empilhar e a página rola inteira.

## Marca

`src-tauri/icons/app-icon.svg` — folha com o canto superior direito dobrado e fita de marcador oxblood com
ponta em V. Existe uma variante sem a placa escura em `app-icon-sem-placa.svg`; a versão com placa é a
padrão porque a folha creme desaparece sobre a barra de tarefas de um Windows em tema claro.

Para regerar todos os tamanhos depois de editar o desenho:

```powershell
npm run tauri icon src-tauri/icons/app-icon.svg
```

O mesmo desenho vive em `src/components/BrandMark.tsx`, usado na barra lateral, no onboarding e na tela de
abertura, para que ícone e interface não divirjam.
