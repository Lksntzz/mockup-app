# App de Mockup da Agenda — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicativo Windows (Electron) que lê um PDF de capas, deixa escolher as cores de wire-o, elástico e tassel por capa e exporta um mockup PNG por capa, idêntico ao do `MKP_2025.psd`.

**Architecture:** Um script Python gera uma vez o "pacote do mockup" (camadas PNG + `mockup.json`) a partir do PSD. O app tem um motor de composição em TypeScript puro (CPU, sem GPU, sem DOM), que recebe `Raster` (RGBA) e devolve `Raster`; por isso a prévia, a exportação e os testes usam o mesmo código e dão o mesmo resultado. PDF, tela e exportador são módulos separados que conversam só por `Raster` e pelos tipos de `src/engine/types.ts`.

**Tech Stack:** Electron, TypeScript, Vitest, pdfjs-dist (PDF), @napi-rs/canvas (render de PDF nos testes em Node), pngjs + pixelmatch (PNG e comparação), electron-builder (instalador NSIS), Python 3 + psd-tools + pytest (só no desenvolvimento, fora do app instalado).

**Spec:** `docs/superpowers/specs/2026-11-10-mockup-agenda-design.md`

## Global Constraints

- Plataforma: Windows 10/11 64 bits, instalador único; o app funciona offline e não envia PDFs nem mockups para servidor.
- Só páginas ímpares do PDF viram capa: `ceil(N/2)` capas; páginas pares são ignoradas.
- Cores escolhidas por capa (wire-o, elástico, tassel); botão "Copiar estas cores para todas as capas".
- Cores iniciais de cada capa: wire-o `preto`, elástico `preto`, tassel `branco`.
- Saída: um PNG 1200×1200 por capa, com o fundo do PSD; nome `NOMEDOPDF_capa-01.png`, `NOMEDOPDF_capa-02.png`, ...
- Cantos da capa (x, y no mockup): TL (214.8, 75.7), TR (934.7, 16.1), BR (952.2, 1180.0), BL (221.8, 1131.8).
- Modos de mistura usados: normal, multiply, color-burn. Sombra do PSD: multiply 50%; brilho: normal 31%; camada do elástico preto: color-burn 97%.
- Opções: wire-o 3 (rose-gold, branco, preto), elástico 6 (branco, rosa, azul, verde, laranja, preto), tassel 4 (verde, azul, rosa, branco).
- Fora do escopo: contra capa, vários modelos, vista de trás, marca d'água automática, editar a arte, lembrar escolhas entre sessões, saída maior que 1200 px.
- Commits são locais. Nada vai para o GitHub sem autorização explícita do usuário. Nenhuma tarefa é dada como pronta sem os testes dela passando.
- Dependências no mínimo; cada uma nova precisa de justificativa na mensagem do commit.
- Arquivos de teste grandes (`MKP_2025.psd`, `CAPAS.pdf`, gabaritos) ficam em `fixtures/` e não entram no git (`.gitignore`).

## Review Focus

1. PDF cuja página é toda branca ou sem borda: o recorte não pode devolver imagem vazia; cai para a página inteira. (Task 5)
2. Nome de PDF com acentos, espaços ou caracteres inválidos no Windows (`: * ? " < > |`): o nome exportado é sanitizado. (Task 7)
3. Pasta de saída sem permissão ou disco cheio: erro claro para o usuário, app continua aberto, nenhum arquivo pela metade. (Task 7)
4. Arquivo que não é PDF, PDF corrompido ou PDF com senha: mensagem clara e o app continua aberto. (Task 5)
5. Trocar cores várias vezes seguidas enquanto a prévia calcula: a prévia final sempre mostra a última escolha. (Task 6)

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `tools/export_pack.py` | Lê o PSD e gera `pack/layers/*.png` e `pack/mockup.json` |
| `tools/render_reference.py` | Renderiza combinações do PSD com psd-tools (referência de desenvolvimento) |
| `pack/` | Pacote do mockup (gerado, versionado) |
| `src/engine/types.ts` | Tipos compartilhados (`Raster`, `Pack`, `Choices`, ...) |
| `src/engine/blend.ts` | Mistura de camadas (normal, multiply, color-burn) |
| `src/engine/warp.ts` | Perspectiva de 4 cantos |
| `src/engine/compose.ts` | Empilhamento completo e regras de disponibilidade |
| `src/pdf/pages.ts`, `crop.ts`, `reader.ts` | Escolha das páginas, recorte de margens, leitura do PDF |
| `src/app/state.ts`, `scheduler.ts` | Estado das capas/cores e agendador da prévia |
| `src/export/exporter.ts` | Nome de arquivo, gravação dos PNGs |
| `src/main/main.ts`, `preload.ts`, `src/renderer/*` | Janela Electron e tela |
| `docs/gabaritos.md`, `docs/teste-manual.md`, `docs/pack-notes.md` | Instruções ao usuário e anotações do pacote |

---

### Task 1: Pacote do mockup (script Python)

**Files:**
- Create: `tools/export_pack.py`, `tools/render_reference.py`, `tests/tools/test_export_pack.py`, `docs/pack-notes.md`, `.gitignore`
- Output: `pack/mockup.json`, `pack/layers/*.png`

**Interfaces:**
- Produces: `pack/mockup.json` com este formato (consumido por Tasks 2–4 e 6):
  - `canvas: {width, height}` (1200×1200)
  - `artCorners: [[x,y] ×4]` na ordem TL, TR, BR, BL
  - `stack: [{id, role: "fixed"|"art", file?, opacity (0–1), blend, offset: [x,y], when?: {wireo?, elastico?, tassel?}}]`, de baixo para cima
  - `options: {wireo|elastico|tassel: [{id, label, swatch}]}`
  - `unavailable: [{wireo?, elastico?, tassel?}]`
  - `defaults: {wireo: "preto", elastico: "preto", tassel: "branco"}`

- [ ] **Step 1: Iniciar o repositório local e escrever os testes que falham**
  `git init` em `/home/claude/mockup-agenda` (sem remoto). Em `tests/tools/test_export_pack.py`, com o PSD em `fixtures/MKP_2025.psd`:
  - `test_opcoes_por_acessorio`: wireo = {rose-gold, branco, preto}, elastico = 6 ids da spec, tassel = 4 ids da spec.
  - `test_cantos_da_capa`: `artCorners` bate com os 4 cantos da spec, tolerância 0.1.
  - `test_todo_arquivo_do_stack_existe`: cada `file` do stack existe em `pack/layers/` e tem o tamanho esperado.
  - `test_sombra_e_brilho`: camada `shadow` com blend `multiply` e opacidade 0.5 (±0.01); `light` com `normal` e 0.31 (±0.01).
  - `test_nao_inclui_contra_capa_nem_marca_dagua`: nenhum id do stack contém `contra` nem `marca`.

- [ ] **Step 2: Rodar e ver falhar** — `pytest tests/tools -v` → FAIL (script não existe).

- [ ] **Step 3: Implementar `export_pack.py`** (`python tools/export_pack.py fixtures/MKP_2025.psd pack/`). Percorre os grupos do PSD de baixo para cima, exporta cada camada de pixel não vazia como PNG recortado (com `offset` = canto superior esquerdo), converte opacidade (0–255 → 0–1) e modo de mistura, e usa o grupo de cor (nome do grupo) para preencher `when`. A camada da arte vira `role: "art"` sem arquivo. Ignora grupos `CONTRA CAPA` e `MARCA D'ÁGUA`.

- [ ] **Step 4: Resolver os 3 pontos da seção 7 da spec e anotar em `docs/pack-notes.md`:** (a) quando o grupo "ATIVAR COM WIREO ROSE" liga e o `when` correspondente; combinações sem camada pronta entram em `unavailable`; (b) se a contra capa aparece no resultado final, exportar a parte visível como camada fixa; (c) ordem real de empilhamento, conferida contra a composição do psd-tools.

- [ ] **Step 5: Implementar `render_reference.py`** (`python tools/render_reference.py fixtures/MKP_2025.psd fixtures/ref/ --capa fixtures/capa01.png`): para as 3 combinações da spec (preto/preto/branco, rose-gold/rosa/rosa, branco/azul/verde) liga só as camadas da combinação e salva `ref_<combo>.png`. É referência de desenvolvimento; o gabarito de aceitação é o feito no Photoshop.

- [ ] **Step 6: Rodar** — `pytest tests/tools -v` → PASS. Gerar `pack/` e conferir `mockup.json` à vista.

- [ ] **Step 7: Commit** — `git add tools tests pack docs .gitignore && git commit -m "feat: pacote do mockup gerado do PSD"`

---

### Task 2: Tipos e mistura de camadas

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/engine/types.ts`, `src/engine/blend.ts`, `tests/engine/blend.test.ts`

**Interfaces:**
- Produces (em `types.ts`): `Raster {width:number; height:number; data:Uint8ClampedArray}` (RGBA, não pré-multiplicado); `Pt = [number, number]`; `Blend = 'normal'|'multiply'|'color-burn'`; `Accessory = 'wireo'|'elastico'|'tassel'`; `Choices = Record<Accessory, string>`; `StackLayer`, `Pack` espelhando o `mockup.json` da Task 1.
- Produces (em `blend.ts`): `newRaster(w:number, h:number): Raster`; `blendOver(dst:Raster, src:Raster, offset:Pt, opacity:number, blend:Blend): void` — compõe `src` sobre `dst` no lugar, cortando o que sai da tela.

- [ ] **Step 1: Configurar o projeto** (TypeScript estrito, Vitest, pngjs, pixelmatch). Tudo o que for configuração entra neste commit.
- [ ] **Step 2: Testes que falham em `blend.test.ts`:**
  - `normal com opacidade 1 cobre o destino`: pixel opaco vermelho sobre branco → vermelho.
  - `normal com opacidade 0.5 mistura`: vermelho (255,0,0) a 50% sobre branco → (255,128,128) ±1.
  - `multiply com cinza 128 escurece`: branco × (128,128,128) → ~128.
  - `color-burn com branco não muda o destino`.
  - `alfa zero não altera o destino`.
  - `offset fora da tela é cortado sem erro`.
- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run tests/engine/blend.test.ts` → FAIL.
- [ ] **Step 4: Implementar `blend.ts`** com as fórmulas padrão de compositing (alfa do `src` × `opacity`; multiply e color-burn por canal).
- [ ] **Step 5: Rodar** → PASS. **Step 6: Commit** — `feat: tipos e mistura de camadas`.

---

### Task 3: Perspectiva de 4 cantos

**Files:**
- Create: `src/engine/warp.ts`, `tests/engine/warp.test.ts`

**Interfaces:**
- Consumes: `Raster`, `Pt` (Task 2); `newRaster`.
- Produces: `solveHomography(src:[Pt,Pt,Pt,Pt], dst:[Pt,Pt,Pt,Pt]): number[]` (9 números, matriz 3×3); `warpToQuad(art:Raster, corners:[Pt,Pt,Pt,Pt], size:{width:number;height:number}): Raster` — devolve um raster do tamanho do mockup com a arte deformada e alfa 0 fora do quadrilátero.

- [ ] **Step 1: Testes que falham:**
  - `homografia leva cada canto da arte ao canto de destino`: com os 4 cantos da spec, (0,0)→TL, (w,0)→TR, (w,h)→BR, (0,h)→BL, erro < 0.01 px.
  - `quadrilátero igual ao retângulo é identidade`.
  - `warp com os cantos da spec: pixel dentro do quadrilátero tem a cor da arte e pixel fora tem alfa 0` (arte sólida de cor conhecida).
  - `arte com listras verticais continua com listras verticais no centro` (sanidade da direção).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** resolvendo o sistema 8×8 da homografia e mapeando por pixel de destino para origem (mapeamento inverso) com interpolação bilinear e borda suavizada de 1 px.
- [ ] **Step 4: Rodar** → PASS. **Step 5: Commit** — `feat: perspectiva de 4 cantos`.

---

### Task 4: Motor de composição e fidelidade

**Files:**
- Create: `src/engine/compose.ts`, `tests/engine/compose.test.ts`, `tests/engine/fidelity.test.ts`, `tests/support/loadPackNode.ts`, `docs/gabaritos.md`

**Interfaces:**
- Consumes: `Pack`, `Raster`, `Choices`, `blendOver`, `warpToQuad`.
- Produces: `isAvailable(pack:Pack, choices:Choices): boolean`; `compose(pack:Pack, layers:Map<string,Raster>, art:Raster, choices:Choices): Raster` — 1200×1200; lança `Error('combinação indisponível')` se `isAvailable` for falso. `loadPackNode(dir:string): Promise<{pack:Pack; layers:Map<string,Raster>}>` (só para testes).

- [ ] **Step 1: Testes que falham em `compose.test.ts`:**
  - `usa só as camadas do stack cujo when bate com as escolhas`.
  - `a arte entra na posição do role "art" do stack` (a ordem de empilhamento vem do pack).
  - `isAvailable respeita a lista unavailable`.
  - `compose recusa combinação indisponível`.
  - `todas as 72 combinações de options compõem sem erro` (as marcadas como indisponíveis são puladas e contadas).
  - `compose de 1200×1200 leva menos de 400 ms` com o pack real (medição, limite inicial; só muda com aprovação do usuário).
- [ ] **Step 2: Teste de fidelidade `fidelity.test.ts`:** para cada uma das 3 combinações da spec, compara `compose(...)` com `fixtures/gabaritos/<combo>.png` via `pixelmatch` (`threshold: 0.1`); falha se mais de 0.5% dos pixels (7.200) diferirem. Se `fixtures/gabaritos/` não existir, o teste usa `fixtures/ref/` (referência do psd-tools da Task 1) e imprime `AVISO: usando referência de desenvolvimento, não o gabarito do Photoshop`.
- [ ] **Step 3: Escrever `docs/gabaritos.md`** com o passo a passo para o usuário exportar no Photoshop as 3 combinações, usando a mesma capa de `fixtures/capa01.png`, em PNG 1200×1200, nomeadas `preto-preto-branco.png`, `rose-gold-rosa-rosa.png` e `branco-azul-verde.png`.
- [ ] **Step 4: Rodar tudo e ver falhar. Step 5: Implementar `compose.ts`:** warp da arte uma vez, depois percorrer `pack.stack` em ordem, ignorando camadas cujo `when` não bate, e aplicando `blendOver`.
- [ ] **Step 6: Rodar** → PASS (fidelidade com a referência de desenvolvimento). Ajustar o pack/ordem (voltando à Task 1 se preciso) até passar.
- [ ] **Step 7: Pedir ao usuário os 3 gabaritos do Photoshop** e rodar o teste de fidelidade contra eles; esta tarefa só termina com isso passando. **Step 8: Commit** — `feat: motor de composição e teste de fidelidade`.

---

### Task 5: Leitor de PDF

**Files:**
- Create: `src/pdf/pages.ts`, `src/pdf/crop.ts`, `src/pdf/reader.ts`, `tests/pdf/pages.test.ts`, `tests/pdf/crop.test.ts`, `tests/pdf/reader.test.ts`

**Interfaces:**
- Consumes: `Raster`.
- Produces: `capaPageNumbers(total:number): number[]` (1, 3, 5, ... até `total`); `cropMargins(page:Raster): Raster`; `class PdfError extends Error { code: 'not-pdf'|'password'|'corrupt' }`; `openPdf(data:Uint8Array): Promise<{pageCount:number; renderPage(n:number, widthPx:number): Promise<Raster>}>`.

- [ ] **Step 1: Testes que falham:**
  - `pages`: `capaPageNumbers(10)` = [1,3,5,7,9]; `(9)` = [1,3,5,7,9]; `(1)` = [1]; `(0)` = [].
  - `crop`: imagem branca com moldura preta de 2 px e conteúdo colorido no meio → devolve só o conteúdo; **página toda branca ou sem moldura devolve a página inteira, nunca uma imagem vazia** (Review Focus 1).
  - `reader` com `fixtures/CAPAS.pdf`: `pageCount` = 10; `renderPage(1, 1055)` devolve raster de 1055 px de largura; abrir os bytes de um `.txt` lança `PdfError` com `code: 'not-pdf'`; PDF truncado → `'corrupt'`; PDF com senha → `'password'` (Review Focus 4; fixture pequeno gerado no próprio teste).
  - Desempenho: abrir `CAPAS.pdf` e renderizar a página 1 leva menos de 5 s (limite inicial).
- [ ] **Step 2: Rodar e ver falhar. Step 3: Implementar** `crop.ts` (detecta a moldura escura e a margem clara por linha/coluna), `reader.ts` com pdfjs-dist; mapear as exceções do pdfjs para `PdfError`.
- [ ] **Step 4: Rodar** → PASS. **Step 5: Commit** — `feat: leitor de PDF com recorte de margens`.

---

### Task 6: Estado, agendador da prévia e tela

**Files:**
- Create: `src/app/state.ts`, `src/app/scheduler.ts`, `tests/app/state.test.ts`, `tests/app/scheduler.test.ts`, `src/main/main.ts`, `src/main/preload.ts`, `src/renderer/index.html`, `src/renderer/app.ts`, `src/renderer/styles.css`, `src/renderer/loadPackBrowser.ts`

**Interfaces:**
- Consumes: `Pack`, `Choices`, `Raster`, `compose`, `capaPageNumbers`, `openPdf`, `PdfError`.
- Produces: `createState(pack:Pack, capas:Raster[]): AppState` com `capas[i].choices` iniciando em `pack.defaults`; `setColor(s:AppState, i:number, acc:Accessory, id:string): AppState` (recusa combinação indisponível, devolvendo o estado sem mudança e `lastError`); `copyToAll(s:AppState, i:number): AppState`; `createPreviewScheduler(render:(req:{capa:number; choices:Choices})=>Promise<Raster>, onResult:(capa:number, r:Raster)=>void): {request(req): void}` — só entrega o resultado do último pedido.

- [ ] **Step 1: Testes que falham:**
  - `state`: cores iniciais = wire-o preto, elástico preto, tassel branco; `setColor` muda só a capa pedida; `copyToAll` copia as 3 cores da capa i para todas; combinação indisponível é recusada.
  - `scheduler`: três `request` seguidos com renders de durações diferentes (o primeiro mais lento) → `onResult` recebe só o resultado do último pedido (Review Focus 5).
- [ ] **Step 2: Rodar e ver falhar. Step 3: Implementar `state.ts` e `scheduler.ts`.**
- [ ] **Step 4: Janela Electron:** `main.ts` abre a janela e expõe por `preload.ts` apenas `escolherPdf(): Promise<{nome:string; bytes:Uint8Array}|null>`, `escolherPasta(): Promise<string|null>` e `gravarArquivo(caminho, bytes)`. A tela (`app.ts`) tem as 3 áreas da spec: lista de miniaturas, prévia grande, painel com 3 seletores de bolinhas coloridas ("swatch" do pack), botão "Copiar estas cores para todas as capas" e "Exportar"; arrastar-e-soltar de PDF; barra de progresso na abertura; erros de `PdfError` mostrados em mensagem clara; aviso amarelo na miniatura de página com proporção fora de 0,71 ± 0,03; "sem verso" na última capa de PDF com páginas ímpares. Opções indisponíveis ficam desabilitadas.
- [ ] **Step 5: Verificação manual:** `npm start`, abrir `CAPAS.pdf`, conferir 5 capas, trocar cores e ver a prévia mudar sem travar. **Step 6: Commit** — `feat: tela, estado e agendador de prévia`.

---

### Task 7: Exportador

**Files:**
- Create: `src/export/exporter.ts`, `tests/export/exporter.test.ts`; modify `src/renderer/app.ts` (botão Exportar)

**Interfaces:**
- Consumes: `compose`, `Raster`, `gravarArquivo` do preload.
- Produces: `exportName(pdfName:string, index:number): string` (índice começa em 1, dois dígitos, ex.: `agenda_capa-01.png`); `exportAll(opts:{pdfName:string; pasta:string; capas:{art:Raster; choices:Choices}[]; write:(path:string, bytes:Uint8Array)=>Promise<void>; exists:(path:string)=>Promise<boolean>; confirmOverwrite:(files:string[])=>Promise<boolean>; onProgress:(done:number,total:number)=>void}): Promise<{written:string[]}>`.

- [ ] **Step 1: Testes que falham:**
  - `exportName("CAPAS.pdf", 1)` = `CAPAS_capa-01.png`; com acentos e espaços mantém os acentos e troca espaços por `_`; caracteres inválidos do Windows (`: * ? " < > |` e `/ \`) são removidos (Review Focus 2).
  - `exportAll` grava um PNG 1200×1200 por capa e chama `onProgress` com 1/5 ... 5/5.
  - Arquivo existente: pergunta antes; se o usuário recusa, não grava nada e devolve `written: []`.
  - Falha de gravação no meio (o `write` simulado lança erro): **nenhum arquivo pela metade** (gravar em `.tmp` e renomear) e o erro é propagado com mensagem clara (Review Focus 3).
- [ ] **Step 2: Rodar e ver falhar. Step 3: Implementar** com `pngjs` para codificar e gravação por arquivo temporário seguida de renomeação.
- [ ] **Step 4: Ligar o botão Exportar na tela;** erros viram mensagem na janela e o app continua aberto. **Step 5: Rodar** → PASS. **Step 6: Commit** — `feat: exportação dos mockups`.

---

### Task 8: Instalador e teste em máquina limpa

**Files:**
- Create: `electron-builder.yml`, `docs/teste-manual.md`; modify `package.json` (script `npm run dist`)

- [ ] **Step 1: Configurar o electron-builder** para gerar instalador NSIS x64 que inclui `pack/` no app e não inclui nada de `tools/`, `fixtures/` nem de Python.
- [ ] **Step 2: Rodar `npm run dist`** e conferir que o instalador (`.exe`) é gerado em `release/`.
- [ ] **Step 3: Escrever `docs/teste-manual.md`** com a lista do usuário, passo a passo e com o resultado esperado em cada passo: instalar; abrir `CAPAS.pdf`; ver 5 capas; escolher cores diferentes em 2 capas; usar "Copiar estas cores para todas"; exportar; abrir os PNGs e comparar com o Photoshop; tentar abrir um arquivo que não é PDF e ver a mensagem.
- [ ] **Step 4: Rodar a suíte completa** (`npx vitest run` e `pytest tests/tools`) → tudo PASS.
- [ ] **Step 5: O usuário executa `docs/teste-manual.md` num Windows sem pré-requisitos** e aprova. A tarefa só termina com essa aprovação. **Step 6: Commit** — `chore: instalador e lista de teste manual`.
