# Anúncios 2027 — Especificação de Design

Data: 2026-11-12
Status: perguntas em aberto respondidas; aguardando aprovação final do usuário (nada foi programado)

## 1. Intenção e porquê

O designer faz as artes dos produtos que a empresa vende nos marketplaces (agenda, planner, agendamento). Hoje cada arte nova exige criar a pasta no lugar certo, preencher título/SKU/EAN em algum lugar, abrir o molde no CorelDRAW, colocar frente e contra capa, gerar o código de barras do EAN e encaixar na contra capa. São passos repetidos, com risco de erro (pasta no lugar errado, EAN digitado errado, código de barras fora do tamanho).

Objetivo: um painel novo no app do MKP em que o designer solta a arte, escolhe plataforma e categoria, digita título/capa/SKU/EAN, e o app cria a pasta, o `.txt`, a cópia da arte e o arquivo do Corel já com o molde, as artes e o código de barras na contra capa de cada capa.

## 2. Objetivos, não objetivos e anti-objetivos

Objetivos
- Reconhecer a pasta `Anúncio 2027` e listar plataformas e categorias que já existem no Google Drive.
- Criar categoria nova dentro de uma plataforma.
- Contar sozinho as capas do PDF/imagens e montar uma linha de variação (capa, SKU, EAN) por capa.
- Validar o EAN (13 dígitos, dígito verificador) antes de criar qualquer coisa.
- Criar: pasta com o nome da arte, `.txt` único, cópia da arte, `.cdr` com molde + artes + EAN.
- Funcionar quando o Corel está aberto (um clique) e ter um plano B manual (botão/macro dentro do Corel) com o mesmo resultado.

Não objetivos (por ora)
- Logo da empresa no molde (o quadrado do molde fica intocado; entra numa versão futura).
- Buscar SKU/EAN no catálogo do NISTI ou enviar o registro para lá. Hoje o designer digita.
- Cadastro na GS1 (o designer faz fora do app, antes).
- Publicar anúncio nos marketplaces.
- Mockup do produto (o gerador de MKP atual continua como está).

Anti-objetivos (seria fracasso mesmo funcionando)
- Imprimir um código de barras inválido ou fora do tamanho permitido.
- Sobrescrever uma pasta de arte existente.
- Colocar o EAN de uma capa na contra capa de outra.
- Perder um trabalho porque o Corel travou: o app salva a pasta, o `.txt` e os códigos antes de chamar o Corel.

## 3. Como o painel se comporta

Painel novo, aba "Anúncios", visível no Modo designer (decisão minha: o painel é do designer; os operadores continuam só com o MKP).

Campos, na ordem: área de soltar arte (PDF, PNG ou JPG), plataforma, categoria (com "Nova categoria…"), nome da arte (vira o nome da pasta), título do anúncio, linhas de variação (capa, SKU, EAN), quadro "Será criado" com o caminho completo, botões "Criar pasta e arquivos" e "Só criar a pasta e o .txt".

Regras
- PDF: páginas ímpares = capas, pares = contra capas (mesma regra do gerador de MKP). Uma linha de variação por capa. Não dá para adicionar nem remover linhas.
- Imagens soltas (resposta do usuário): a primeira imagem escolhida é a capa e a segunda é a contra capa. O botão "Adicionar mais" abre outro par (capa + contra capa) para o usuário escolher o restante, e cada par cria uma linha de variação. O botão só aparece com imagens, não com PDF. Imagem de contra capa ausente: a linha fica com a contra capa só com o código de barras, igual ao caso do PDF ímpar.
- PDF com número ímpar de páginas: a última capa não tem contra capa; o app cria a página da contra capa só com o código de barras (decisão minha, para o EAN não ficar sem página).
- EAN inválido deixa o campo vermelho e impede "Criar pasta e arquivos". "Só criar a pasta e o .txt" também exige EAN válido nas linhas preenchidas; linhas vazias são aceitas e ficam marcadas como pendentes no `.txt`.
- Se a pasta com esse nome já existir, o app não escreve nada e pergunta o que fazer (abrir a existente ou escolher outro nome).
- Nome da arte com caracteres que o Windows não aceita é corrigido na tela, mostrando o nome final antes de criar.

## 4. Arquivos criados

```
Anúncio 2027 / <Plataforma> / <Categoria> / <Nome da arte> /
    <Nome da arte>.txt
    <Nome da arte>.pdf      (cópia da arte; se foi imagem, cópia da imagem)
    <Nome da arte>.cdr      (molde + artes + códigos de barras)
    _corel/                 (códigos de barras e lista para o macro; o app pode refazer)
```

Formato do `.txt` (UTF-8, uma coisa por linha, legível no Bloco de Notas):

```
Plataforma: Shopee
Categoria: Agenda
Arte: Tulipa gel
Título: Agenda Escolar 2027 Tulipa Gel Capa Dura Wire-o

Variações:
1 | Capa: Tulipa rosa | SKU: AG27-TUL-01 | EAN: 7891234567895
2 | Capa: Tulipa azul | SKU: AG27-TUL-02 | EAN: 7891234567896
```

Os exemplos de EAN acima são inventados.

## 5. Código de barras

- Reaproveitar do repositório `Lksntzz/nisti-identificacao`: `src/scanner/gtin.js` (validação e dígito verificador) e `src/scanner/ean-barcode.js` (`encodeEan13`, `createEan13Svg`, desenho oficial 543×189 px). São JavaScript puro, sem dependências. Copiar para o app (TypeScript) com o comentário de origem e portar os testes (`test/ean-barcode.test.js`, `test/gtin.test.js`).
- Na contra capa o código entra como vetor, nunca como imagem raster.
- Tamanho: encaixar no retângulo da contra capa sem distorcer. Se o retângulo obrigar a reduzir o código abaixo de 80% do tamanho nominal do EAN-13 (limite de ampliação que a GS1 admite), o app avisa e não segue em silêncio. Ampliar acima de 200% também avisa.
- Cuidado conhecido: o SVG do NISTI escreve os dígitos com a fonte "DejaVu Sans", que o Windows e o Corel não têm. O código de barras (as barras) é o que importa; os dígitos precisam sair legíveis e numa fonte que exista no Windows. Como fazer isso (importar SVG com texto convertido, ou desenhar as barras e o texto pelo próprio macro) fica para quem implementa, com a condição: testar no Corel real.

## 6. Molde e Corel

Dados do usuário
- O molde (`C:\MOLDE\MOLDE.cdr`) já tem, na contra capa (página par), duas caixas centrais na parte de baixo: um quadrado (logo da empresa, uso futuro) e um retângulo (onde vai o código de barras). Página ímpar = capa, página par = contra capa.

Como o macro encontra o retângulo (decisão minha): na página par, o retângulo mais largo que alto, na parte de baixo e no centro; o quadrado é ignorado. Se o usuário der o nome `EAN` ao retângulo, o macro usa o nome e dispensa a busca por forma.

Abordagem escolhida pelo usuário: o app chama o macro quando o Corel está aberto, com a base de um plano B manual.
1. O app grava a pasta, o `.txt`, a cópia da arte e a pasta `_corel/` (códigos de barras e a lista de páginas e EANs) antes de falar com o Corel.
2. O app chama o macro, estendendo `ArteDoClienteNoMolde` de `tools/corel/MKP.bas` (hoje faz só 1 frente e 1 verso): duplica o par de páginas do molde uma vez por capa, coloca cada arte e o código de barras do EAN daquela capa.
3. Corel fechado: o app abre o molde e pede o segundo clique, como hoje (o app já trata assim porque mandar comando a um Corel recém-aberto travava).
4. Plano B: um macro separado dentro do Corel que monta o `.cdr` lendo a pasta `_corel/`, com o mesmo resultado, sem precisar do app.

## 7. Onde fica no código (para quem for implementar)

- `src/anuncios/` novo: leitura da pasta `Anúncio 2027`, regras de nome, `.txt`, EAN/código de barras (portado do NISTI).
- Novo campo de configuração para a pasta `Anúncio 2027` na aba Configuração (mesma ideia das Pastas 1 a 4); o caminho no PC do designer é do Google Drive para computador.
- `src/main/corel.ts` e `tools/corel/MKP.bas`: macro novo/estendido e o script que o chama.
- `src/renderer/`: aba nova; em vez de crescer o `app.ts` (já com 2.132 linhas), o painel entra em arquivo próprio.
- Testes: unitários para EAN, nome de pasta, `.txt`, contagem de capas; de integração para a leitura da pasta com estrutura de teste. O macro do Corel só se confirma no Corel real.

## 8. Critérios de aceitação

1. A pasta `Anúncio 2027` é achada e as plataformas e categorias existentes aparecem; criar categoria nova cria a pasta certa.
2. PDF de 1, 3 e 4 páginas gera 1, 2 e 2 capas (a de 3 páginas: a última capa sem contra capa).
3. EAN inválido bloqueia a criação; EAN válido passa. Os mesmos casos dos testes do NISTI passam no app.
4. Pasta existente nunca é sobrescrita.
5. `.txt` correto e legível no Bloco de Notas, com acentos.
6. `.cdr` de 1 capa e depois de 3 capas, aberto no Corel 2025 real: artes nas páginas certas, código de barras no retângulo da contra capa certa, quadrado intocado, nada distorcido.
7. Código de barras lido por um leitor ou app de celular com o EAN esperado.
8. Corel fechado e Corel travado: o app diz o que aconteceu e a pasta, o `.txt` e os códigos continuam salvos.
9. O plano B manual gera o mesmo `.cdr`.

## 9. Em aberto

- Resolvido pelo usuário: caixa do EAN na página par; quadrado = logo (futuro); abordagem A com base da C.
- A resolver no teste com Corel real: como importar uma página específica de um PDF de várias páginas por macro (o diálogo de importação pode abrir). Plano de reserva: o app separa cada página em PDF próprio dentro de `_corel/` (exige uma biblioteca nova; só entra se for preciso e com a sua autorização).
- Resolvido pelo usuário (2026-11-12): (a) o molde é um só (`C:\MOLDE\MOLDE.cdr`) para todas as categorias; (b) imagens soltas: primeira = capa, segunda = contra capa, e o botão "Adicionar mais" acrescenta outro par.

## 10. Abordagens consideradas

- A: o app chama o macro do Corel (como o MKP). Prós: `.cdr` de verdade em um clique. Contras: depende do Corel responder.
- B: o app monta um PDF e o usuário importa no Corel. Prós: o mais estável. Contras: sem `.cdr`, importação manual toda vez.
- C: botão dentro do Corel que lê a pasta. Prós: independe do app falar com o Corel. Contras: um clique a mais.
- Escolhida pelo usuário: A com a base da C (recomendação do Smith).

## 11. Riscos

- Macro do Corel não pode ser testado fora do Corel real; todo o resto pode.
- Atualização do Corel pode mudar o comportamento do macro.
- Google Drive pode atrasar a sincronização da pasta nova; o app confere a criação antes de chamar o Corel.
- Mudanças só chegam à equipe quando o usuário autorizar a publicação no GitHub.
