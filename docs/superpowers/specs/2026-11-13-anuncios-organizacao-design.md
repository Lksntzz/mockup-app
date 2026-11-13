# Anúncios 2027 — organização da pasta, carregamento e imagem do código de barras (desenho curto)

Data: 2026-11-13. Complementa `2026-11-12-anuncios-2027-design.md`. Pedido do usuário depois do primeiro teste real (a pasta e o `.txt` foram criados; a montagem no Corel funcionou).

## Pedido (nas palavras do usuário)
1. Dentro da pasta da arte, os arquivos ficam organizados em subpastas, **menos o `.txt`**. A pasta `_corel` guarda o arquivo do Corel.
2. O app precisa de **tela de carregamento** e de um **"Concluído"**.
3. O app **não está gerando a imagem do código de barras**.

Escolhas confirmadas: txt solto; subpastas `Arte` e `_corel`; imagem do código na pasta **e** prévia no app; carregamento em passos com status e "Concluído" no fim.

## Como fica a pasta
```
<Plataforma>/<Categoria>/<arte>/
  <arte>.txt                      (único arquivo solto)
  Arte/                           (PDF ou imagens copiadas)
  Codigo de barras/               (uma imagem .svg por capa que tem EAN)
  _corel/
    <arte>.cdr                    (criado pela macro)
    montar.txt                    (lista que o app entrega ao Corel)
```
- O manifesto passa a apontar para `Arte/...` (frente/verso) e `_corel/<arte>.cdr` (destino). A macro (`MKP.bas`) não muda: ela lê os caminhos do manifesto.
- "Montar no Corel agora" (`montarPastaExistente`): aceita o `.cdr` em `_corel` (layout novo) e também na raiz (pastas criadas antes desta mudança, como a TOQUE ROSE).
- Nomes das imagens: `Capa N - <EAN>.svg`.

## Código de barras (imagem)
- Nova função pura `gerarSvgEan13(ean)` em `src/anuncios/ean-svg.ts`, usando `layoutEan13` (mesmas medidas 543×189 da macro): barras pretas, barras de guarda mais compridas, dígitos em texto (Arial) abaixo, fundo branco.
- `criarAnuncio` grava um `.svg` por capa com EAN válido em `Codigo de barras/` (também em "Só criar a pasta e o .txt"). Capa sem EAN: sem imagem, com o aviso que já existe.
- O resultado devolve a lista `{ n, nome, svg }` e a tela mostra uma prévia pequena de cada código (via `<img>` com o SVG em data URI; nada de `innerHTML`).
- Fora do escopo: PNG. Se precisar de PNG depois, entra como outra etapa.

## Carregamento e "Concluído"
- `criarEMontar` e `montarPastaExistente` aceitam um `aoProgredir(etapa, estado)` opcional. O `main` repassa cada passo para a tela por um evento (`anuncios-progresso`), exposto no `preload`.
- Passos mostrados, na ordem: Criando a pasta e o .txt · Copiando a arte · Gerando os códigos de barras · Abrindo o Corel (só quando o Corel está fechado) · Montando o arquivo no Corel. Cada um mostra "em andamento" (girando), "✓ feito", "pulado" ou "✗ erro".
- No fim, um título: **"Concluído"** (tudo certo), **"Concluído com avisos"** (pasta pronta, mas algo para ver) ou **"Não concluído"** (pasta já existia ou erro antes de criar).
- Botões ficam travados enquanto o painel de passos estiver em andamento (já existe a trava `rodando`).

## Não-objetivos
- Mover ou reorganizar pastas já criadas no layout antigo.
- Mudar como o código de barras é desenhado dentro do Corel.
- PNG, impressão ou gerar o código em lote.

## Riscos e o que muda no teste
- Mais arquivos no Drive (sincronização um pouco mais lenta): aceitável.
- O `.cdr` agora fica dentro de `_corel`: o roteiro `docs/teste-manual-anuncios.md` precisa dizer isso.
- A macro grava o `.cdr` com `SaveAs` na pasta `_corel`, que o app cria **antes** de chamar a macro (já é assim hoje).
- Pré-visualização em SVG depende do navegador embutido do Electron (suporta SVG sem problema).

## Abordagens consideradas
- Carregamento: (A) eventos do `main` para a tela a cada passo — escolhida, mostra o passo real; (B) a tela adivinha por tempo — descartada, mostraria passos que não aconteceram.
- Imagem: (A) SVG gerado em texto, sem dependências — escolhida; (B) PNG — exigiria biblioteca de imagem ou fonte embutida, aumenta o app sem ganho agora.
