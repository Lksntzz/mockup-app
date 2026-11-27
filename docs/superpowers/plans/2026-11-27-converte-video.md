# Converte (vídeo) e menu de duas ferramentas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Barra de cima com duas ferramentas (MKP e Converte) e, na Converte, um conversor de vídeo (qualquer formato de entrada → MP4/WebM/MOV/MP3) com níveis de tamanho e "máximo em MB".

**Architecture:** Lógica pura em `src/converte/` (ler `ffmpeg -i`, planejar a conversão, montar argumentos, nome livre, progresso), processo do ffmpeg em `src/main/converte.ts` (spawn com lista de argumentos, cancelar, apagar parcial), ponte por IPC/preload, e duas telas no renderer: a barra de ferramentas e a tela Converte. O ffmpeg vem do pacote `ffmpeg-static` (devDependency, baixado no `npm ci`, nunca commitado) e é copiado para `resources/ffmpeg/` no instalador.

**Tech Stack:** Electron 45, TypeScript, esbuild (`tools/build.mjs`), vitest, electron-builder (NSIS), `ffmpeg-static`.

**Spec:** `docs/superpowers/specs/2026-11-27-converte-video-design.md`

## Global Constraints

- Só planos gratuitos. Repositório **público**: nenhum binário do ffmpeg, chave ou dado de negócio commitado.
- JavaScript/TypeScript; `npm test` e `npx tsc --noEmit` passam antes de cada commit.
- Nunca sobrescrever nem apagar o vídeo original; cancelar ou falhar apaga só o arquivo parcial da saída; nome ocupado vira `nome (1).mp4`.
- Comandos do ffmpeg sempre por **lista de argumentos** (`spawn`), nunca texto montado (caminhos com acento, espaço, `&`).
- O atualizador não instala durante conversão (`ocupado` em `src/main/main.ts` ~linha 253).
- Aviso de licença GPL do ffmpeg + link do código-fonte visível na ferramenta Converte.
- Instalador hoje: 130 MB (v0.21.4). Medir o novo e informar o Lucas.
- Mensagens ao usuário em português, sem jargão.
- Só enviar ao GitHub com "pode enviar" do Lucas; versão sobe (hoje 0.21.4 → 0.22.0, via `sed` no `package.json` e nas duas linhas do `package-lock.json`; conferir `wc -c package-lock.json` ≈ 199689); conferir os dois processos `Publicar versão` e `Instalador Windows` e a release. Commits terminam com as duas linhas de atribuição (`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` e `Claude-Session: https://claude.ai/code/session_01BQFSvaeq6QY18EFfhzRHxb`).
- Se uma ação for bloqueada por permissão, parar e perguntar ao Lucas; não contornar.

## Review Focus

Entradas que o desenho implica e nenhuma tarefa exercita por si só (cada uma ganha teste na tarefa indicada):

1. Vídeo **sem áudio** converte sem erro e sem faixa de áudio na saída (Tasks 2, 3).
2. **Arquivo que não é vídeo** (texto renomeado `.mov`, 0 bytes, corrompido) mostra "não consegui ler este arquivo", sem travar e sem criar saída (Tasks 2, 5).
3. **Caminho com acento, espaço, `&` e colchetes** funciona de ponta a ponta (Tasks 4, 5).
4. **Vídeo gravado em pé (rotação 90° do iPhone)** sai com a mesma orientação (Tasks 2, 4).
5. **Saída que já existe, pasta somente leitura, disco sem espaço** nunca sobrescrevem nem deixam arquivo pela metade (Tasks 4, 5, 6).
6. **Duração desconhecida** (0) impede o "máximo em MB" com mensagem clara e esconde a estimativa (Task 3).

---

### Task 1: Dependência, caminho do ffmpeg e empacotamento

**Files:**
- Modify: `package.json` (devDependency `ffmpeg-static`), `package-lock.json`, `electron-builder.yml`, `tools/build.mjs`
- Create: `src/main/ffmpeg-caminho.ts`, `tools/conferir-ffmpeg.mjs`
- Test: `tests/main/ffmpeg-caminho.test.ts`

**Interfaces:**
- Produces: `caminhoDoFfmpeg(o: { empacotado: boolean; resourcesPath: string; modoDev: () => string | null }): string | null` (empacotado → `join(resourcesPath,'ffmpeg','ffmpeg.exe')`; senão `modoDev()`).

- [ ] **Step 1: Instalar e conferir os codificadores.** `npm i -D ffmpeg-static`, depois `node tools/conferir-ffmpeg.mjs`: lê `require('ffmpeg-static')`, roda `-hide_banner -encoders` e imprime SIM/NÃO para `libx264`, `libvpx-vp9`, `libopus`, `libmp3lame`, `aac`. **Se a instalação for bloqueada por permissão, parar e perguntar ao Lucas.** Se faltar um codificador, tirar essa saída da lista (WebM e/ou MP3) nas Tasks 3 e 8 e avisar o Lucas; não trocar de pacote sem perguntar.
- [ ] **Step 2: Test** `tests/main/ffmpeg-caminho.test.ts`: empacotado → `C:\\app\\resources\\ffmpeg\\ffmpeg.exe` (compare com `join` do SO); não empacotado devolve o que `modoDev` devolve; `modoDev` devolvendo `null` → `null`.
- [ ] **Step 3: Implement** `caminhoDoFfmpeg` em `src/main/ffmpeg-caminho.ts`.
- [ ] **Step 4: Empacotar.** Em `electron-builder.yml` incluir em `extraResources` `from: node_modules/ffmpeg-static/ffmpeg.exe` → `to: ffmpeg/ffmpeg.exe`; em `tools/build.mjs` não incluir `ffmpeg-static` no bundle (o `external` já deve listá-lo se for importado; o main só importa quando `!app.isPackaged`).
- [ ] **Step 5: Run** `npx vitest run tests/main/ffmpeg-caminho.test.ts` → PASS; `npx tsc --noEmit` → sem erro.
- [ ] **Step 6: Commit** `feat(converte): ffmpeg-static como dependência e caminho do ffmpeg no instalador`.

### Task 2: Ler as informações do vídeo (`ffmpeg -i`)

**Files:**
- Create: `src/converte/info.ts`
- Test: `tests/converte/info.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface InfoDoVideo {
    contenedor: string;            // 1º nome de "Input #0, mov,mp4,..." ex.: "mov"
    duracaoS: number;              // 0 quando "N/A"
    tamanhoBytes: number;          // preenchido pelo chamador (stat); o parser deixa 0
    video: { codec: string; largura: number; altura: number; fps: number; rotacao: number } | null;
    audio: { codec: string } | null;
  }
  export function lerInfoDoFfmpeg(texto: string): InfoDoVideo | null; // null = não é mídia legível
  ```

- [ ] **Step 1: Write failing tests** com saídas reais do ffmpeg como constantes:
  - `IMG_6040` (iPhone/HEVC): `Duration: 00:00:26.17`, `Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv, bt709), 1440x2560, 11257 kb/s, 30 fps`, `Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo` → `{contenedor:'mov', duracaoS:26.17, video:{codec:'hevc',largura:1440,altura:2560,fps:30,rotacao:0}, audio:{codec:'aac'}}`.
  - sem áudio (`Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 320x240 [SAR 1:1 DAR 4:3], 53 kb/s, 25 fps`, sem linha `Audio`) → `audio: null`, `fps: 25`.
  - rotação: linha `displaymatrix: rotation of -90.00 degrees` depois do stream de vídeo → `rotacao: 90` (valor absoluto normalizado a 0/90/180/270).
  - só áudio (`Input #0, mp3` + `Audio: mp3`) → `video: null`.
  - `Error opening input file falso.mov.` / `Invalid data found when processing input` → `null`.
  - `Duration: N/A` → `duracaoS: 0`.
  - `fps` ausente mas com `tbr` (ex.: `, 29.97 tbr,`) → usa o `tbr`.
- [ ] **Step 2: Run** `npx vitest run tests/converte/info.test.ts` → FAIL.
- [ ] **Step 3: Implement** `lerInfoDoFfmpeg` com expressões regulares sobre o texto; ignorar a seção `Metadata` e streams de imagem de capa (`Video: mjpeg`/`png` com `attached pic`).
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(converte): ler formato, codec, tamanho e duração do vídeo`.

### Task 3: Planejar a conversão (copiar ou reconverter, níveis, máximo em MB)

**Files:**
- Create: `src/converte/plano.ts`
- Test: `tests/converte/plano.test.ts`

**Interfaces:**
- Consumes: `InfoDoVideo` (Task 2).
- Produces:
  ```ts
  export type Formato = 'mp4' | 'webm' | 'mov' | 'mp3';
  export type Nivel = 'original' | 'medio' | 'pequeno';
  export type Tamanho = { tipo: 'nivel'; nivel: Nivel } | { tipo: 'maximo'; mb: number };
  export interface Pedido { formato: Formato; tamanho: Tamanho }
  export interface Plano {
    ok: true;
    modo: 'copiar' | 'reconverter';
    formato: Formato;
    video: { codec: 'libx264' | 'libvpx-vp9'; crf?: number; kbps?: number; ladoMenorMax?: number } | null;
    audio: { codec: 'aac' | 'libopus' | 'libmp3lame'; kbps: number } | null;
    estimativaBytes: number | null; // null quando a duração é desconhecida
    aviso?: string;
  }
  export type ResultadoDoPlano = Plano | { ok: false; motivo: string };
  export function planejar(info: InfoDoVideo, pedido: Pedido): ResultadoDoPlano;
  export function formatosPossiveis(info: InfoDoVideo): Formato[]; // sem vídeo → só 'mp3'; com vídeo → os 4
  ```
- Regras: **Original** = CRF 23, sem reduzir a imagem, áudio 160 kbps; **Médio** = CRF 28, `ladoMenorMax` 1080, áudio 128; **Pequeno** = CRF 32, `ladoMenorMax` 720, áudio 96. `copiar` só se formato `mp4`/`mov`, nível `original`, vídeo `h264` e áudio `aac` ou ausente. **Máximo em MB:** `kbps` de vídeo = `(mb × 1048576 × 8 × 0.95 − kbpsAudio×1000×duracao) ÷ duracao ÷ 1000`; **aviso** quando `kbps×1000 ÷ (largura×altura×fps)` < 0,04; **recusa** quando `kbps` < 80, quando `mb` ≤ 0 ou não é número, ou quando `duracaoS` = 0. Vídeo sem áudio: `audio: null`. Estimativa: por nível, `duracao × pixels/s × fator(crf)` com fatores calibrados para o vídeo de teste; no máximo em MB, `mb × 1048576 × 0.95`.

- [ ] **Step 1: Write failing tests** (amostra `IMG_6040`: hevc 1440×2560 30 fps, 26,17 s, 37 254 613 bytes, aac):
  - `planejar(amostra,{mp4, nivel original}).modo === 'reconverter'` (HEVC) e `video.crf === 23`; `estimativaBytes` entre 15 e 35 MB.
  - Estimativas: original > médio > pequeno; `medio.video.ladoMenorMax === 1080`, `pequeno… === 720`.
  - H.264 + AAC, `mp4` + original → `modo 'copiar'`, `video` e `audio` `null`/inalterados; o mesmo em `mov`; em `webm` → `reconverter`.
  - Sem áudio (H.264, `audio:null`) → plano com `audio === null`.
  - Máximo 20 MB → `ok`, sem `aviso`, `kbps` ≈ 5 300–5 900; máximo 8 MB → `ok` **com** `aviso`; máximo 0,2 MB → `{ok:false}` com motivo que cita "pequeno"; `mb: 0`, `mb: NaN` → recusa.
  - `duracaoS: 0` + máximo → recusa citando a duração; + nível → `ok` com `estimativaBytes === null`.
  - `formatosPossiveis`: com vídeo → `['mp4','webm','mov','mp3']`; só áudio → `['mp3']`; pedido de `mp4` para só áudio → `{ok:false}`.
  - `mp3` → `video: null`, `audio.codec 'libmp3lame'` (192/128/96 kbps por nível).
- [ ] **Step 2: Run** `npx vitest run tests/converte/plano.test.ts` → FAIL. **Step 3: Implement** `planejar` e `formatosPossiveis` com as regras acima. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(converte): plano de conversão (copiar ou reconverter, níveis e máximo em MB)`.

### Task 4: Argumentos do ffmpeg, nome livre e progresso

**Files:**
- Create: `src/converte/argumentos.ts`
- Test: `tests/converte/argumentos.test.ts`

**Interfaces:**
- Consumes: `Plano` (Task 3).
- Produces:
  ```ts
  export function montarArgumentos(plano: Plano, entrada: string, saida: string): string[];
  export function nomeLivre(entrada: string, formato: Formato, existe: (caminho: string) => boolean): string; // mesma pasta; "nome.mp4", "nome (1).mp4", …
  export type Progresso = { tipo: 'tempo'; segundos: number } | { tipo: 'fim' };
  export function lerProgresso(linha: string): Progresso | null;
  ```
- Argumentos sempre começam com `-hide_banner -nostdin -n -v error -nostats -progress pipe:1 -i <entrada>`; `copiar` → `-c copy -movflags +faststart`; reconverter → `-c:v libx264 -crf N -preset veryfast -pix_fmt yuv420p` (ou `-b:v Nk -maxrate Nk -bufsize 2N k` no máximo em MB), `-vf scale=-2:'min(ih,L)'`… ajustado para **lado menor** ≤ L (em vídeo em pé o lado menor é a largura), `-c:a aac -b:a Nk` / `-c:a libopus` / `-c:a libmp3lame`, `-vn` no MP3, `-an` quando `audio === null`, `-movflags +faststart` em MP4/MOV, saída por último. O ffmpeg endireita sozinho o vídeo girado ao reconverter.

- [ ] **Step 1: Write failing tests:** (a) para a amostra HEVC `mp4/original`, o resultado contém, nesta ordem, `-i`, a entrada, `-c:v`, `libx264`, `-crf`, `23` e termina na saída; (b) `copiar` contém `-c` `copy` e não contém `-crf`; (c) `audio === null` → contém `-an` e não contém `-c:a`; (d) mp3 → contém `-vn`; (e) entrada `C:\Vídeos\Meu & Filme [final].mov` aparece **inteira como um único item** da lista; (f) máximo em MB → contém `-b:v` e `-maxrate`; (g) `nomeLivre('/v/a.mov','mp4', c => false)` → `/v/a.mp4`; com `a.mp4` e `a (1).mp4` existentes → `/v/a (2).mp4`; entrada sem extensão e caminho com ponto na pasta (`/v.x/a`) → `/v.x/a.mp4`; (h) `lerProgresso('out_time_us=1880000')` → `{tempo, 1.88}`; `'out_time_us=-80000'` e `'out_time_us=N/A'` → `null`; `'progress=end'` → `{fim}`; `'speed=N/A'` → `null`.
- [ ] **Step 2: Run** `npx vitest run tests/converte/argumentos.test.ts` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(converte): argumentos do ffmpeg, nome sem colisão e leitura de progresso`.

### Task 5: Processo do ffmpeg (ler, converter, cancelar, limpar)

**Files:**
- Create: `src/main/converte.ts`
- Test: `tests/main/converte.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  ```ts
  export type Spawn = typeof import('node:child_process').spawn;
  export interface Conversor {
    ler(caminho: string): Promise<{ ok: true; info: InfoDoVideo } | { ok: false; motivo: string }>;
    converter(
      caminho: string, pedido: Pedido, aoProgredir: (p: { fracao: number; restanteS: number | null }) => void,
    ): { cancelar(): void; fim: Promise<{ ok: true; saida: string; bytes: number } | { ok: false; motivo: string; cancelado?: boolean; pastaSemPermissao?: boolean }> };
    ocupado(): boolean;
  }
  export function criarConversor(o: { ffmpeg: string; spawn?: Spawn; existe?: (c: string) => boolean; tamanhoDoArquivo?: (c: string) => Promise<number>; espacoLivre?: (pasta: string) => Promise<number>; apagar?: (c: string) => Promise<void> }): Conversor;
  ```
- `ler` roda `ffmpeg -hide_banner -i <caminho>` (código de saída 1 é normal), junta o `stderr`, usa `lerInfoDoFfmpeg` e preenche `tamanhoBytes`; `null` → `motivo: 'Não consegui ler este arquivo como vídeo.'`. `converter` escolhe `nomeLivre`, checa espaço livre (recusa se `< estimativa × 1,1`), monta argumentos, lê `stdout` linha a linha, calcula `fracao = segundos ÷ duracao` (máx. 1), `restanteS` pela velocidade; ao sair com código ≠ 0 ou por `cancelar()` apaga a saída parcial e devolve `motivo`; saída ilegível/pasta sem permissão (`EACCES`/`EROFS`) → `motivo` "Não consigo gravar nesta pasta" com `pastaSemPermissao: true` para a Task 6 perguntar onde salvar.

- [ ] **Step 1: Write failing tests** com `spawn` falso (EventEmitter com `stdout`/`stderr`): (a) `ler` com o texto real da amostra → `info.video.codec 'hevc'`; (b) `ler` com `Invalid data found` → `ok:false` com a mensagem acima; (c) `converter` emite progresso 0,5 quando `out_time_us` = metade da duração e `fim` ok com `bytes` do `tamanhoDoArquivo`; (d) código de saída 1 → `ok:false` e `apagar` chamado com a saída; (e) `cancelar()` → `kill` chamado, `apagar` chamado, `cancelado:true`; (f) `espacoLivre` menor que a estimativa → `ok:false` sem chamar `spawn`; (g) `ocupado()` é `true` durante a conversão e `false` depois (inclusive depois de erro e de cancelamento); (h) argumento de entrada com `&` e acento chega ao `spawn` como item único; (i) teste real opcional `it.skipIf(!process.env.FFMPEG_PATH)`: gera 1 s com `-f lavfi -i testsrc`, converte para MP4 e confere que a saída existe e o original continua intacto.
- [ ] **Step 2: Run** `npx vitest run tests/main/converte.test.ts` → FAIL. **Step 3: Implement** `criarConversor`. **Step 4: Run** → PASS (e, localmente, com `FFMPEG_PATH` apontando para o ffmpeg do pacote, o teste real).
- [ ] **Step 5: Commit** `feat(converte): processo do ffmpeg com progresso, cancelamento e limpeza`.

### Task 6: IPC, preload e ligação no main

**Files:**
- Modify: `src/main/main.ts`, `src/main/preload.ts`, `src/renderer/global.d.ts`, `src/main/config-designer.ts`
- Test: `tests/main/config-designer.test.ts` (campo novo), `tests/main/converte-ipc.test.ts` (funções puras de validação)

**Interfaces:**
- Consumes: `criarConversor` (Task 5), `caminhoDoFfmpeg` (Task 1).
- Produces (ponte do renderer): `converteEscolher(): Promise<string | null>` (diálogo com filtro de vídeos e "Todos os arquivos"); `converteLer(caminho)`, `converteIniciar(caminho, pedido): Promise<{ ok: true; saida: string; bytes: number } | { ok: false; motivo: string; cancelado?: boolean }>`, `converteCancelar()`, `converteAbrirPasta(saida)` (`shell.showItemInFolder`), evento `converte-progresso` → `{ fracao, restanteS }`; `ferramentaLer(): Promise<'mkp' | 'converte'>`, `ferramentaGravar(f)`. `ConfigDesigner` ganha `ferramenta?: 'mkp' | 'converte'`.
- Regras: um vídeo por vez (segunda chamada de `converteIniciar` enquanto ocupado → `ok:false` "Já existe uma conversão em andamento"); validar `pedido` vindo do renderer (formato e nível conhecidos, `mb` finito e > 0); no `ocupado` do atualizador somar `conversor.ocupado()`; quando `pastaSemPermissao`, abrir `dialog.showSaveDialog` com o nome sugerido e refazer a conversão nesse destino.

- [ ] **Step 1: Write failing tests:** `ferramenta` sobrevive a gravar/ler em `config-designer`, valor inválido no arquivo → `'mkp'`; `pedidoValido(x: unknown): Pedido | null` (aceita `{formato:'mp4',tamanho:{tipo:'nivel',nivel:'medio'}}`, `{formato:'webm',tamanho:{tipo:'maximo',mb:16}}`; rejeita formato `'avi'`, `mb: -1`, `mb: '16'`, objeto vazio, `null`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** os handlers `ipcMain.handle('converte-…')`, `converteLer` (faz `stat` e usa `conversor.ler`), o evento de progresso por `webContents.send`, o `ocupado` do atualizador, e as chaves no preload e no `global.d.ts`. **Step 4: Run** `npx vitest run` e `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(converte): ponte IPC do conversor e ferramenta ativa na configuração`.

### Task 7: Barra de duas ferramentas

**Files:**
- Create: `src/app/ferramentas.ts`
- Modify: `src/renderer/index.html`, `src/renderer/styles.css`, `src/renderer/app.ts`
- Test: `tests/app/ferramentas.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Ferramenta = 'mkp' | 'converte';
  export function ferramentaValida(v: unknown): Ferramenta;                // padrão 'mkp'
  export function visibilidade(f: Ferramenta): { abasDoMkp: boolean; conteudoDoMkp: boolean; converte: boolean };
  ```
- Consumes: `ferramentaLer/Gravar` (Task 6). HTML: `<nav id="ferramentas" aria-label="Ferramentas">` com `#ferr-mkp` e `#ferr-converte` (`aria-pressed`) logo depois da marca; o `<nav class="nav">` atual (abas) e o conteúdo (`.area`, `#paginas`) só aparecem na ferramenta MKP; `<main id="converte" hidden>` novo para a Task 8.

- [ ] **Step 1: Write failing tests:** `ferramentaValida('converte') === 'converte'`, `'xyz'`, `undefined`, `null`, `42` → `'mkp'`; `visibilidade('mkp')` → `{abasDoMkp:true, conteudoDoMkp:true, converte:false}`; `visibilidade('converte')` → `{false,false,true}`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `ferramentas.ts`, o HTML, o CSS (segmentado, mesmo visual das abas, com aria-pressed), e em `app.ts` `mostrarFerramenta(f)`: esconde/mostra os blocos, grava com `ferramentaGravar`, e ao iniciar o app lê `ferramentaLer()`. As abas do MKP e `mostrarAba` não mudam; `mostrarAba` só é chamado dentro da ferramenta MKP. O `drop` global (`app.ts` ~2215) não faz nada quando `#converte` está visível. Quando o Modo designer liga/desliga, as regras atuais das abas continuam valendo.
- [ ] **Step 4: Run** `npx vitest run` e `npx tsc --noEmit` → PASS. Conferir no navegador de teste (Chrome headless com um `window.api` falso, como nas telas anteriores) que MKP ↔ Converte troca sem sobrar aba nem conteúdo do outro lado, nas larguras 700 e 1100 px.
- [ ] **Step 5: Commit** `feat(menu): barra com as ferramentas MKP e Converte`.

### Task 8: Tela Converte

**Files:**
- Create: `src/app/converte-ui.ts`, `src/renderer/converte.ts`
- Modify: `src/renderer/index.html` (conteúdo de `#converte`), `src/renderer/styles.css`, `src/renderer/app.ts` (importar e iniciar)
- Test: `tests/app/converte-ui.test.ts`

**Interfaces:**
- Consumes: `formatosPossiveis`, `planejar` (Task 3), ponte da Task 6.
- Produces (puras, em `converte-ui.ts`): `rotuloDoVideo(info: InfoDoVideo): string` → `"IMG_6040.MOV · HEVC + AAC · 1440×2560 · 26 s · 35,5 MB"` (nome vem de fora: `rotuloDoVideo(nome, info)`); `formatarBytes(n: number): string` (`1 048 576` → `"1 MB"`, `37 254 613` → `"35,5 MB"`, `900` → `"900 B"`); `formatarTempo(segundos: number | null): string` (`null` → `"calculando…"`, `75` → `"1 min 15 s"`); `rotuloDoFormato(f: Formato, info): string` (`mp4` → `"MP4 (H.264) — o mais aceito"`).
- Tela: zona de soltar + botão "Escolher vídeo"; cartão com o rótulo do vídeo; opções de formato (só as de `formatosPossiveis`, MP4 marcado); tamanho: Original / Médio / Pequeno **ou** "Máximo de [N] MB" (escolher um desmarca o outro); estimativa (ou "sem estimativa" quando `null`); avisos/recusas do plano em texto visível antes de converter e botão Converter desativado na recusa; Converter → barra de progresso com % e tempo restante + Cancelar; no fim "Pronto: nome (tamanho)" + "Abrir a pasta"; rodapé com link "Licenças". Vários arquivos soltos: usa o primeiro e mostra "Converto um vídeo por vez; usei o primeiro." Arquivo que não é vídeo: mostra a mensagem da Task 5 e não oferece opções.

- [ ] **Step 1: Write failing tests** dos quatro formatadores com os exemplos acima, mais `rotuloDoVideo` para vídeo sem áudio (`"… · H.264 · sem áudio · …"`) e só áudio (`"MP3 · 3 min 2 s · …"`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `converte-ui.ts`, `converte.ts` (liga a tela à ponte; refaz o plano a cada mudança de opção) e o HTML/CSS. **Step 4: Run** `npx vitest run` e `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Verificar a tela** no Chrome headless com `window.api` falso: soltar arquivo, trocar formato (MP3 esconde os níveis de imagem), máximo 8 MB mostra o aviso, máximo 0,2 MB desativa Converter, progresso 0 → 100 %, Cancelar volta ao estado inicial, nada passa da borda nas larguras 700 e 1100 px. Anexar a captura ao relato final.
- [ ] **Step 6: Commit** `feat(converte): tela da ferramenta Converte`.

### Task 9: Licenças, roteiro de teste, versão e fechamento

**Files:**
- Create: `src/renderer/licencas.ts` (ou trecho em `converte.ts`), `docs/teste-manual-converte.md`
- Modify: `package.json`, `package-lock.json`; `docs/teste-manual-anuncios.md` só se citar a barra

- [ ] **Step 1:** O link "Licenças" abre um painel com: ffmpeg é software livre sob GPL, o app o executa como programa separado, links para `https://ffmpeg.org/` (código-fonte em `https://ffmpeg.org/download.html`) e para `https://github.com/eugeneware/ffmpeg-static`, e a versão do pacote lida do `package.json`.
- [ ] **Step 2:** Escrever `docs/teste-manual-converte.md` (passo a passo para o Lucas, com resultado esperado em cada passo): trocar de ferramenta e voltar; soltar `IMG_6040.MOV`; converter para MP4 (conferir que abre e toca com o som); máximo 8 MB (aviso) e 0,2 MB (recusa); cancelar no meio (não sobra arquivo); converter duas vezes (aparece `(1)`); arquivo de texto renomeado `.mov`; nome com acento e `&`; mensagem do SmartScreen/antivírus no primeiro uso; tamanho do instalador novo.
- [ ] **Step 3:** Subir versão para 0.22.0 (regras em Global Constraints). Rodar `npx vitest run`, `npx tsc --noEmit`, `node tools/build.mjs`. Medir o instalador novo se o build do Windows estiver disponível (senão informar a estimativa e medir na release).
- [ ] **Step 4: Commit** `feat(converte): licenças, roteiro de teste e versão 0.22.0`. **Não enviar**: pedir "pode enviar" ao Lucas.
