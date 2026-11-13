# Anúncios 2027 — organização da pasta, carregamento e imagem do código de barras — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar a pasta do anúncio (txt solto; subpastas `Arte`, `Codigo de barras`, `Corel`), gerar uma imagem SVG do código de barras por capa com prévia no app, e mostrar passos de carregamento com "Concluído".

**Architecture:** `criarAnuncio` passa a montar o novo layout e a gerar os SVG (função pura nova em `src/anuncios/ean-svg.ts`); `criarEMontar`/`montarPastaExistente` recebem um `aoProgredir` opcional; o `main` repassa os passos à tela por um evento IPC; a tela mostra a lista de passos e a prévia dos códigos. O manifesto continua sendo a única fonte de caminhos para a macro; só `AnuncioDaPasta` (plano B) muda no VBA.

**Tech Stack:** Electron + TypeScript, esbuild (`npm run build`), vitest (`tests/**`), tsc estrito com `noUncheckedIndexedAccess`.

**Spec:** `docs/superpowers/specs/2026-11-13-anuncios-organizacao-design.md` (complementa `2026-11-12-anuncios-2027-design.md`).

## Global Constraints

- Layout final: `<arte>/<arte>.txt` (único solto), `Arte/` (cópias da arte, mesmos nomes de hoje: `<arte>.pdf`, `<arte> (N).pdf`, `<arte> - capa N.<ext>`, `<arte> - contra N.<ext>`), `Codigo de barras/` (`Capa N - <EAN>.svg`, só capas com EAN), `Corel/` (`<arte>.cdr` criado pela macro e `montar.txt`).
- A pasta chama-se `Corel` (sem underline). `montar.txt` é apagado pelo app **somente** quando a etapa do Corel termina `feito`; em `erro`, `aguardando-clique` ou `pulado` permanece. Só se apaga esse arquivo; nunca outros.
- Pastas antigas (`_corel`, `.cdr` na raiz) continuam aceitas por `montarPastaExistente`.
- Manifesto e `montar.txt`: latin1, como hoje (`cabeEmLatin1`). O `.txt` do anúncio: UTF-8 com BOM e CRLF, como hoje. `tools/corel/MKP.bas` continua ASCII com CRLF puro.
- O SVG usa as medidas de `layoutEan13` (543×189), fundo branco, barras pretas, dígitos em `Arial`.
- Textos da tela em português simples (o usuário não é programador); qualquer texto vindo do disco ou do usuário entra na tela por `textContent`/atributo `src` de `<img>` com data URI, nunca `innerHTML`.
- Nada é enviado ao GitHub sem autorização explícita do usuário (a Task 6 termina com PARAR). Commits locais terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` e `Claude-Session: https://claude.ai/code/session_01BQFSvaeq6QY18EFfhzRHxb`.
- `npm ci` simples é bloqueado neste ambiente; as dependências já estão instaladas (`--ignore-scripts`). Não instalar nada.

## Review Focus

- **Pasta antiga:** `montarPastaExistente` numa pasta criada antes desta mudança (`_corel\montar.txt`, `.cdr` na raiz, e destino na raiz) continua montando.
- **Arquivo errado apagado:** o app só pode apagar `Corel\montar.txt` (ou `_corel\montar.txt` do layout antigo) e só depois de `feito`; nunca o `.cdr`, o `.txt` ou pastas.
- **Falha no meio:** se algo falha após criar a pasta, a limpeza continua removendo só a pasta criada por aquela chamada (incluindo as novas subpastas).
- **Evento de progresso após a janela fechar:** o `main` não pode lançar exceção se o `webContents` já foi destruído.
- **Capa sem EAN / EAN inválido:** nenhum SVG para ela, sem quebrar o resto; o SVG não pode ser gerado para EAN inválido.

---

### Task 1: Imagem SVG do código de barras

**Files:**
- Create: `src/anuncios/ean-svg.ts`
- Test: `tests/anuncios/ean-svg.test.ts`

**Interfaces:**
- Consumes: `layoutEan13`, `encodeEan13` de `src/anuncios/ean.ts`; `isValidGtin13`, `normalizarEan` de `src/anuncios/gtin.ts`
- Produces: `export function gerarSvgEan13(ean: string): string` — texto SVG completo; lança `Error('EAN inválido')` se `normalizarEan(ean)` não for GTIN-13 válido.

- [ ] **Step 1: Testes que falham** (`tests/anuncios/ean-svg.test.ts`), com EAN válido `7898764983584`:
  - `começa com <svg`, contém `viewBox="0 0 543 189"` e um `<rect` de fundo branco (`fill="#fff"`);
  - número de `<rect` de barras pretas (`fill="#000"`) é igual a `layoutEan13(ean).barras.length`; para cada barra do layout existe um `<rect` com `x="<x>"`, `y="<y>"`, `width="<w>"`, `height="<h>"`;
  - contém três `<text` com os trechos `7`, `898764` e `983584` (dígitos do layout), `font-family="Arial"` e `font-size="24"`;
  - EAN com espaços e quebra de linha (`' 789 8764983584\n'`) gera o mesmo SVG que o limpo;
  - `gerarSvgEan13('7898764983585')` (dígito verificador errado) e `''` lançam erro.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/anuncios/ean-svg.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `gerarSvgEan13` concatenando texto; dígitos com `text-anchor="middle"` no `x` do layout e `y = yDigitos`.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS; `npx tsc --noEmit` limpo.
- [ ] **Step 5: Commit** — `feat(anuncios): imagem SVG do código de barras`.

---

### Task 2: Novo layout da pasta e imagens na criação

**Files:**
- Modify: `src/main/anuncios-criar.ts`
- Test: `tests/main/anuncios-criar.test.ts` (ajustar os testes que assumem o layout antigo e acrescentar os novos)

**Interfaces:**
- Consumes: `gerarSvgEan13` (Task 1); `ResultadoCriar` atual
- Produces:
```ts
export type EtapaProgresso = 'pasta' | 'arte' | 'barras' | 'corel';
export type EstadoProgresso = 'andamento' | 'feito' | 'pulado' | 'erro';
export type AoProgredir = (etapa: EtapaProgresso, estado: EstadoProgresso) => void;
export interface ImagemEan { n: number; nome: string; svg: string }
// ResultadoCriar ok:true ganha: imagensEan: ImagemEan[]
export async function criarAnuncio(e: EntradaDoAnuncio, aoProgredir?: AoProgredir): Promise<ResultadoCriar>
```
`cdr` passa a ser `<pasta>/Corel/<arte>.cdr`; frente/verso do manifesto apontam para `<pasta>/Arte/...`; `montar.txt` fica em `<pasta>/Corel/montar.txt`.

- [ ] **Step 1: Testes que falham** (pastas em `mkdtemp`, PDF de 4 páginas, 2 variações com EAN válidos `7898764983584` e `7898764983591`... use os EAN já usados no arquivo de teste):
  - estrutura: a raiz da pasta da arte contém **só** `<arte>.txt` e as pastas `Arte`, `Codigo de barras`, `Corel`; `Arte/<arte>.pdf` existe; `Corel/montar.txt` existe; `Corel/` não contém `.cdr`;
  - `r.cdr` é `<pasta>/Corel/<arte>.cdr` e `r.manifestoTexto` tem `destino=` terminando em `Corel\<arte>.cdr` (separador do sistema) e `frente=` apontando dentro de `Arte`;
  - imagens: `Codigo de barras/Capa 1 - <EAN1>.svg` e `Capa 2 - <EAN2>.svg` existem e o conteúdo é igual a `gerarSvgEan13(EAN)`; `r.imagensEan` tem 2 itens `{n, nome, svg}`;
  - variação sem EAN: nenhuma imagem para ela, `imagensEan` só com as demais, e o aviso "sem código de barras" continua;
  - imagens (não PDF): cópias vão para `Arte/` com os nomes `<arte> - capa N.<ext>` / `<arte> - contra N.<ext>`;
  - `aoProgredir` é chamado nesta ordem para uma criação ok: `pasta andamento`, `pasta feito`, `arte andamento`, `arte feito`, `barras andamento`, `barras feito`; numa falha no meio, a etapa em curso recebe `erro` e a pasta criada é removida (incluindo subpastas);
  - criação sem nenhum EAN preenchido: `barras` recebe `pulado`;
  - os testes antigos que esperavam `.pdf`/`_corel` na raiz são atualizados para o novo layout (não apagar a cobertura de EAN repetido, pasta existente, latin1, `|`, nome seguro vazio).
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/main/anuncios-criar.test.ts` → FAIL.
- [ ] **Step 3: Implementar** o novo layout: criar `Arte`, `Codigo de barras` (só se houver EAN), `Corel` com `mkdir` simples depois de `mkdir(pasta)`; o planejamento das cópias passa a usar `join(pasta, 'Arte', ...)`; `cdr = join(pasta, 'Corel', `${arte}.cdr`)`; gravar um SVG por capa com EAN válido (`Capa ${i + 1} - ${ean}.svg`, UTF-8); chamar `aoProgredir` nos pontos descritos (um `try/finally` que envia `erro` para a etapa em curso quando algo lança). Nada de `recursive` na pasta final (continua detectando corrida).
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS; `npx tsc --noEmit` limpo; `npx vitest run tests/main` sem regressão.
- [ ] **Step 5: Commit** — `feat(anuncios): novo layout da pasta e imagens SVG do código de barras`.

---

### Task 3: Orquestração com progresso, pastas antigas e limpeza do montar.txt

**Files:**
- Modify: `src/main/anuncios.ts`
- Test: `tests/main/anuncios.test.ts`

**Interfaces:**
- Consumes: `AoProgredir`, `ImagemEan`, `criarAnuncio` (Task 2); `montarNoCorel` atual
- Produces:
```ts
// ResultadoAnuncio ganha: imagensEan?: ImagemEan[]
export async function criarEMontar(e: EntradaDoAnuncio, usarCorel: boolean, deps?: DepsAnuncio, aoProgredir?: AoProgredir): Promise<ResultadoAnuncio>
export async function montarPastaExistente(raiz: string, pasta: unknown, deps?: DepsAnuncio, aoProgredir?: AoProgredir): Promise<ResultadoAnuncio>
```
`criarEMontar` repassa `aoProgredir` a `criarAnuncio` e emite `corel andamento` → `corel feito|erro|pulado` (`aguardando-clique` conta como `pulado`); com `usarCorel=false` emite `corel pulado`.

- [ ] **Step 1: Testes que falham** (macro e leitor falsos como nos testes atuais):
  - `criarEMontar` com tudo ok devolve `imagensEan` (copiado de `criarAnuncio`) e o `montar.txt` **não existe mais** em `Corel/` depois de `etapaCorel === 'feito'`; o `.cdr` falso criado pela macro falsa continua lá, assim como o `.txt`, `Arte/` e os SVG;
  - com a macro falsa devolvendo erro, ou `aberto`, ou com `usarCorel=false`: `Corel/montar.txt` continua existindo;
  - ordem dos eventos para criar+Corel ok: os 6 da Task 2 seguidos de `corel andamento`, `corel feito`;
  - `montarPastaExistente` no **layout novo** (pasta criada por `criarAnuncio` com `usarCorel=false`): monta, apaga `Corel/montar.txt` quando `feito`, e emite `corel andamento`/`corel feito`;
  - `montarPastaExistente` em **pasta antiga** (montar manualmente no teste: `_corel/montar.txt` com `destino=<pasta>\<arte>.cdr` na raiz): ainda monta, e ao terminar `feito` apaga `_corel/montar.txt`; nada mais é apagado (conferir que `.txt` e `.pdf` continuam);
  - `montarPastaExistente` recusa quando `destino` não está na raiz da pasta, nem em `Corel`, nem em `_corel` dela ("A lista do Corel aponta para outra pasta.");
  - recusa quando o `.cdr` já existe (mensagem atual), sem apagar nada.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/main/anuncios.test.ts` → FAIL.
- [ ] **Step 3: Implementar**: em `montarPastaExistente` procurar a lista em `Corel/montar.txt` e, se não existir, em `_corel/montar.txt` (mensagem de erro atualizada para citar `Corel\montar.txt`); aceitar `dirname(destino)` igual a `pasta`, `pasta/Corel` ou `pasta/_corel` (`mesmoCaminho`); após `etapaCorel === 'feito'`, apagar **só** o arquivo `montar.txt` de onde a lista foi lida (`rm(arquivo, { force: true })`, engolindo erro sem alterar o resultado). Fazer o mesmo em `criarEMontar` (arquivo `join(dirname(c.cdr), 'montar.txt')`).
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS; `npx tsc --noEmit`; `npx vitest run tests/main`.
- [ ] **Step 5: Commit** — `feat(anuncios): progresso, pastas antigas e limpeza do montar.txt`.

---

### Task 4: Evento de progresso até a tela (main + preload + tipos)

**Files:**
- Modify: `src/main/main.ts` (handlers `anuncios-criar` e `anuncios-montar-no-corel`), `src/main/preload.ts`, `src/renderer/global.d.ts`
- Test: nenhum teste de unidade novo (o handler usa Electron); verificar por `npx tsc --noEmit` e `npm run build` (`build ok`)

**Interfaces:**
- Consumes: `criarEMontar`/`montarPastaExistente` com `aoProgredir` (Task 3); `EtapaProgresso`, `EstadoProgresso`, `ImagemEan`
- Produces: evento `anuncios-progresso` com `{ etapa, estado }`; preload `aoProgredirAnuncio(cb: (p: { etapa: string; estado: string }) => void): () => void` (devolve a função que remove o ouvinte); tipos em `MockupApi` e `ResultadoAnuncio` com `imagensEan?: { n: number; nome: string; svg: string }[]`.

- [ ] **Step 1: Implementar** nos dois handlers um `aoProgredir` que faz `e.sender.send('anuncios-progresso', { etapa, estado })` dentro de `try/catch` e só se `!e.sender.isDestroyed()`; o handler passa o callback para as funções da Task 3; manter `marcarCorel`/`exigirDesigner` como estão. No preload, `aoProgredirAnuncio` registra `ipcRenderer.on('anuncios-progresso', ...)` e devolve a função que chama `removeListener`.
- [ ] **Step 2: Verificar** — `npx tsc --noEmit` limpo e `npm run build` termina com `build ok`.
- [ ] **Step 3: Commit** — `feat(anuncios): evento de progresso entre o app e a tela`.

---

### Task 5: Tela — passos, "Concluído" e prévia do código de barras

**Files:**
- Create: `src/app/anuncios-passos.ts` (parte pura)
- Modify: `src/renderer/anuncios.ts`, `src/renderer/index.html` (`#an-resultado` e novo `#an-passos`), `src/renderer/styles.css`
- Test: `tests/app/anuncios-passos.test.ts`

**Interfaces:**
- Consumes: `aoProgredirAnuncio`, `ResultadoAnuncio.imagensEan` (Task 4); `textoDaEtapaCorel` de `src/app/anuncios-ui.ts`
- Produces (puro, em `src/app/anuncios-passos.ts`):
```ts
export type EstadoDoPasso = 'espera' | 'andamento' | 'feito' | 'pulado' | 'erro';
export interface Passo { etapa: 'pasta' | 'arte' | 'barras' | 'corel'; rotulo: string; estado: EstadoDoPasso }
export function passosIniciais(usarCorel: boolean): Passo[]   // 4 passos; sem 'corel' quando usarCorel=false? NÃO: sempre 4, o do Corel nasce como 'espera' e vira 'pulado'
export function aplicarProgresso(passos: Passo[], etapa: string, estado: string): Passo[] // imutável; etapa/estado desconhecidos devolvem a mesma lista
export function tituloFinal(passos: Passo[], r: { ok: boolean; existente?: string; avisos: string[]; etapaCorel?: string }): 'Concluído' | 'Concluído com avisos' | 'Não concluído'
export function svgParaDataUri(svg: string): string // 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
```
Rótulos: `pasta` "Criando a pasta e o arquivo .txt", `arte` "Copiando a arte", `barras` "Gerando os códigos de barras", `corel` "Abrindo o Corel e montando o arquivo".
`tituloFinal`: `Não concluído` se `!r.ok`; senão `Concluído com avisos` se `r.avisos` tem itens, ou algum passo está em `erro`, ou `etapaCorel` é `aguardando-clique`/`erro`; senão `Concluído`.

- [ ] **Step 1: Testes que falham** (`tests/app/anuncios-passos.test.ts`): `passosIniciais` devolve os 4 passos em ordem, todos `espera`; `aplicarProgresso` troca só o passo pedido, não muta a lista original e ignora etapa desconhecida; `tituloFinal` nos 3 casos (ok sem avisos; ok com avisos; `ok:false`; `etapaCorel:'aguardando-clique'`); `svgParaDataUri('<svg a="1"/>')` começa com `data:image/svg+xml;charset=utf-8,` e não contém `<` nem `"`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/app/anuncios-passos.test.ts` → FAIL.
- [ ] **Step 3: Implementar** o módulo puro; depois a tela: ao clicar em Criar/"Só criar"/"Montar no Corel agora", mostrar `#an-passos` (lista com ícone girando em `andamento`, ✓ em `feito`, "pulado", ✗ em `erro`), ouvir `aoProgredirAnuncio` só durante a chamada (remover o ouvinte no `finally`), e ao receber o resultado mostrar o título (`tituloFinal`) em destaque acima da lista, os avisos como hoje e, para cada item de `imagensEan`, uma miniatura `<img>` (`src = svgParaDataUri(svg)`, `alt = nome`) com a legenda `nome` via `textContent`. "Montar no Corel agora" usa só o passo `corel`. Reaproveitar classes e variáveis de cor do `styles.css`; manter as travas `rodando`/`lendo` e o `finally` que reativa os botões.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS; `npx tsc --noEmit`; `npm run build` → `build ok`. A conferência visual no Windows fica para o usuário (listar no relatório os passos exatos).
- [ ] **Step 5: Commit** — `feat(anuncios): tela de passos, Concluído e prévia do código de barras`.

---

### Task 6: Plano B do Corel, roteiro de teste e versão

**Files:**
- Modify: `tools/corel/MKP.bas` (só `AnuncioDaPasta` e seu texto de ajuda), `docs/teste-manual-anuncios.md`, `package.json` (+ as duas versões raiz de `package-lock.json`), `tests/tools/macro-anuncio.test.ts`

**Interfaces:**
- Consumes: layout novo (Tasks 2–3)
- Produces: `AnuncioDaPasta` aceita `montar.txt` em `Corel\` ou, se não achar, em `_corel\`; aceita escolher o `montar.txt`, a pasta `Corel`/`_corel`, a pasta do anúncio ou qualquer arquivo dentro dela.

- [ ] **Step 1: Teste que falha** — em `tests/tools/macro-anuncio.test.ts`: o `.bas` (lido como latin1) contém `\Corel\montar.txt` e `\_corel\montar.txt`, continua sem bytes acima de 127 e sem LF solto (todo `\n` precedido de `\r`).
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/tools/macro-anuncio.test.ts` → FAIL.
- [ ] **Step 3: Implementar** a mudança no VBA (só ASCII, CRLF): tentar `<pasta>\Corel\montar.txt` e depois `<pasta>\_corel\montar.txt`; tratar nome de pasta `corel` e `_corel` (sem diferenciar maiúsculas) como "pasta da lista"; mensagens e filtros do `GetFileBox` falando da pasta `Corel`. Não alterar nenhuma outra rotina. Atualizar `docs/teste-manual-anuncios.md`: nova estrutura da pasta (txt solto; `Arte`, `Codigo de barras`, `Corel`; `.cdr` e `montar.txt` em `Corel`; `montar.txt` some quando o Corel termina bem), a prévia e os SVG, a tela de passos e o "Concluído", e que para repetir um teste é preciso apagar o `.cdr` da pasta `Corel`; Teste 7/7b leem o `montar.txt` na pasta `Corel`.
- [ ] **Step 4: Aumentar a versão** para `0.10.1` em `package.json` e nas duas entradas raiz do `package-lock.json` (sem tocar dependências).
- [ ] **Step 5: Rodar tudo** — `npx tsc --noEmit`; `npx vitest run`; `npm run build` → `build ok`.
- [ ] **Step 6: Commit** — `feat(anuncios): plano B na pasta Corel, roteiro de teste e versão 0.10.1`.
- [ ] **Step 7: PARAR.** Não fazer `git push`. Avisar o usuário que o código está pronto e esperar a autorização para publicar (o push em `feature/mockup-app` dispara a release).
