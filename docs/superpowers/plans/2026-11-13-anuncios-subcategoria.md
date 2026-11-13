# Anúncios 2027 — Subcategoria — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acrescentar a lista **Subcategoria** (pastas de dentro da categoria, com "Nova subcategoria…") e criar a arte em `Plataforma\Categoria\Subcategoria\<arte>`.

**Architecture:** `subcategoria` entra como campo opcional da entrada (`EntradaDoAnuncio`), do formulário e do `.txt`; `anuncios-pastas.ts` ganha a leitura/criação de subcategorias (reaproveitando o código das categorias); `criarAnuncio` resolve a pasta da subcategoria antes da arte; dois novos IPC alimentam a lista na tela, que espelha o que já existe para categoria.

**Tech Stack:** Electron + TypeScript, esbuild (`npm run build`), vitest (`tests/**`), tsc estrito com `noUncheckedIndexedAccess`.

**Spec:** `docs/superpowers/specs/2026-11-13-anuncios-subcategoria-design.md`

## Global Constraints

- Caminho: `<raiz>\<plataforma>\<categoria>\<subcategoria>\<arte>`; sem subcategoria (`''` ou ausente) o caminho continua `<raiz>\<plataforma>\<categoria>\<arte>`.
- `subcategoria` é opcional em `EntradaDoAnuncio` (`subcategoria?: string`) para não quebrar chamadas e testes existentes; a tela sempre a envia.
- A subcategoria precisa existir em disco (comparada pelo nome real, como plataforma e categoria: igual, senão `mesmoNome`); `criarAnuncio` nunca cria a subcategoria sozinho (só o botão "Nova subcategoria…" cria).
- Nomes de pasta passam por `nomeDePastaSeguro` (mesma regra de `criarCategoria`); a leitura ignora pastas que começam com `.`, `_` ou `$` (mesma função `subpastas`).
- `.txt`: a linha `Subcategoria: <nome>` vem logo depois de `Categoria: <nome>` e só existe quando há subcategoria; resto do formato (UTF-8 com BOM, CRLF) não muda.
- Subcategoria obrigatória na tela quando a lista dela tem pelo menos uma pasta; vazia = "a arte vai direto na categoria".
- Textos da tela em português simples; nada vindo do disco entra por `innerHTML` (opções de `<select>` via `preencher`, que já existe, e `textContent`).
- Nada é enviado ao GitHub sem autorização explícita (a Task 4 termina em PARAR). Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` e `Claude-Session: https://claude.ai/code/session_01BQFSvaeq6QY18EFfhzRHxb`. Não instalar pacotes.

## Review Focus

- **Pasta de arte antiga dentro da categoria** (ex.: um TOQUE ROSE de teste) aparece como subcategoria: comportamento aceito pelo spec, mas a criação não pode quebrar nem sobrescrever nada.
- **Corrida na tela:** trocar a categoria (ou a plataforma) enquanto a lista de subcategorias carrega não pode deixar a lista de outra categoria na tela (mesmo cuidado do `seqCategorias`).
- **Nome com caracteres inválidos / vazio / repetido** em "Nova subcategoria…": mensagem clara, nada criado.
- **Categoria sem pastas:** `Subcategoria` fica vazia/desabilitada e a criação funciona como hoje.
- **Subcategoria que sumiu do disco** entre a escolha e o clique em Criar: `criarAnuncio` recusa com mensagem, sem criar nada.

---

### Task 1: Modelo e partes puras (tipo, .txt, formulário, caminho previsto)

**Files:**
- Modify: `src/anuncios/tipos.ts`, `src/anuncios/txt.ts`, `src/app/anuncios-form.ts`, `src/app/anuncios-ui.ts`
- Test: `tests/anuncios/txt.test.ts` (ou o arquivo de teste do `.txt` que já existir — localizar com `ls tests/anuncios`), `tests/app/anuncios-form.test.ts`, `tests/app/anuncios-ui.test.ts`

**Interfaces:**
- Produces:
  - `EntradaDoAnuncio.subcategoria?: string`.
  - `montarTxt(a)` aceita `a.subcategoria?: string`; com valor não vazio emite `Subcategoria: ${a.subcategoria}` logo após a linha `Categoria:`.
  - `FormAnuncio` ganha `subcategoria: string` e `temSubcategorias: boolean` (`formVazio()` os inicia em `''` e `false`).
  - `validar(f)`: `podeCriar` e `podeCriarSoPasta` ficam falsos quando `f.temSubcategorias && !f.subcategoria`; `erros.geral` não muda.
  - `caminhoPrevisto(f, pastaAnuncios?)` inclui `f.subcategoria` entre categoria e arte (quando não vazia).
  - A entrada enviada ao main (a função em `anuncios-ui.ts` que monta `{ plataforma, categoria, ... }` a partir do form, em torno da linha 23) inclui `subcategoria: f.subcategoria`.
  - `limparArte(f)` (e o que preserva campos ao "Fazer outro anúncio") mantém `subcategoria` e `temSubcategorias`.

- [ ] **Step 1: Testes que falham**
  - txt: com `subcategoria: 'MANICURE'` o texto tem `Categoria: AGENDAMENTO` e, na linha seguinte, `Subcategoria: MANICURE`; sem subcategoria (ausente e `''`) não existe nenhuma linha `Subcategoria:`.
  - form: `formVazio()` tem `subcategoria === ''` e `temSubcategorias === false`; um form válido com `temSubcategorias: true` e `subcategoria: ''` dá `podeCriar === false` e `podeCriarSoPasta === false`; com `subcategoria: 'MANICURE'` volta a valer; com `temSubcategorias: false` e `subcategoria: ''` vale como hoje.
  - ui: `caminhoPrevisto({ plataforma: 'ML', categoria: 'AGENDAMENTO', subcategoria: 'MANICURE', arte: 'TOQUE ROSE', ...}, 'I:\\ANUNCIOS')` termina em `AGENDAMENTO\\MANICURE\\TOQUE ROSE`; sem subcategoria, como antes; `limparArte` preserva os dois campos novos; a entrada montada do form leva `subcategoria`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/anuncios tests/app` → FAIL.
- [ ] **Step 3: Implementar** as assinaturas acima; os testes existentes que constroem `FormAnuncio` à mão passam a receber os dois campos novos (ajustar só o necessário para o tsc).
- [ ] **Step 4: Rodar e ver passar** — mesmo comando; `npx tsc --noEmit` limpo (o renderer ainda não usa os campos novos; se o tsc reclamar do renderer por causa do tipo, acrescentar só os valores iniciais mínimos lá).
- [ ] **Step 5: Commit** — `feat(anuncios): subcategoria no modelo, no .txt e no formulário`.

---

### Task 2: Pastas e criação (main)

**Files:**
- Modify: `src/main/anuncios-pastas.ts`, `src/main/anuncios-criar.ts`, `src/main/anuncios.ts` (só `validarFormaDaEntrada`)
- Test: `tests/main/anuncios-pastas.test.ts`, `tests/main/anuncios-criar.test.ts`, `tests/main/anuncios.test.ts`

**Interfaces:**
- Consumes: `EntradaDoAnuncio.subcategoria?` (Task 1)
- Produces:
```ts
export const listarSubcategorias = (pastaCategoria: string): Promise<string[]>; // mesma regra de subpastas
export async function criarSubcategoria(pastaCategoria: string, nome: string): Promise<ResultadoCategoria>;
```
`criarSubcategoria` e `criarCategoria` compartilham um helper interno (`criarPastaFilha(pastaPai, nome, rotulo: 'categoria' | 'subcategoria', onde: string)`); as mensagens ficam: vazio → `Digite um nome para a subcategoria.`; pai inexistente → `Não encontrei a pasta da categoria. Escolha de novo.`; repetida → `Já existe a subcategoria "X" nesta categoria.`; EEXIST → `Já existe uma pasta "X" nesta categoria.`; as de `criarCategoria` continuam idênticas.
`criarAnuncio`: com `e.subcategoria` não vazio, resolve a subcategoria (igual ou `mesmoNome`) dentro de `pastaCategoria`, recusa com `A subcategoria "X" não existe em <categoria>.` se não achar, e passa a usar `join(pastaCategoria, subcategoria)` como pasta pai da arte (checagem de pasta irmã, `pasta`, `cdr`, limpeza); passa `subcategoria` ao `montarTxt`. Sem subcategoria, tudo igual a hoje.
`validarFormaDaEntrada`: se `subcategoria` existir, precisa ser string (`Dados do anúncio inválidos.` senão); ausente é aceito.

- [ ] **Step 1: Testes que falham**
  - pastas (usar `mkdtemp`): `listarSubcategorias` lista só pastas, ordenadas pt-BR, ignora `.x`, `_x`, `$x` e arquivos; `criarSubcategoria` cria a pasta, recusa nome vazio, nome repetido (com outra caixa), pai inexistente e nome com caractere inválido vira o nome seguro; `criarCategoria` continua passando nos testes atuais.
  - criar: com `subcategoria: 'MANICURE'` (pasta existente) a arte nasce em `<categoria>/MANICURE/<arte>`, o `.txt` tem a linha `Subcategoria: MANICURE` e `r.pasta`/`r.cdr` estão sob essa pasta; subcategoria inexistente → `ok:false` com a mensagem acima e nenhuma pasta criada; pasta de arte já existente dentro da subcategoria → recusa com `existente` apontando para ela; arte com o mesmo nome na categoria (fora da subcategoria) NÃO bloqueia; sem subcategoria (ausente e `''`) o comportamento atual se mantém.
  - anuncios.test: `validarFormaDaEntrada` aceita sem subcategoria, aceita com string e recusa `subcategoria: 5`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/main` → FAIL.
- [ ] **Step 3: Implementar** as assinaturas acima; manter `criarCategoria` exportada com o mesmo contrato.
- [ ] **Step 4: Rodar e ver passar** — `npx vitest run tests/main`; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(anuncios): subcategoria nas pastas e na criação da arte`.

---

### Task 3: IPC e tela

**Files:**
- Modify: `src/main/main.ts`, `src/main/preload.ts`, `src/renderer/global.d.ts`, `src/renderer/index.html`, `src/renderer/anuncios.ts`, `src/renderer/styles.css` (só se faltar estilo)
- Test: sem teste de unidade novo (Electron/DOM); verificar por `npx tsc --noEmit`, `npx vitest run` e `npm run build` (`build ok`)

**Interfaces:**
- Consumes: `listarSubcategorias`, `criarSubcategoria` (Task 2); `FormAnuncio.subcategoria/temSubcategorias` (Task 1)
- Produces:
  - IPC `anuncios-subcategorias(plataforma: unknown, categoria: unknown) → string[]` e `anuncios-criar-subcategoria(plataforma, categoria, nome) → ResultadoCategoria`; ambos resolvem plataforma como o `resolverPlataforma` já faz e a categoria pelo nome real em disco (igual ou `mesmoNome`, via `listarCategorias`), devolvendo `[]`/erro amigável se não acharem.
  - preload `anunciosSubcategorias(plataforma, categoria)` e `anunciosCriarSubcategoria(plataforma, categoria, nome)`; tipos em `MockupApi`.
  - HTML: `<label>Subcategoria <select id="an-subcategoria"></select></label>` na linha de Plataforma/Categoria e o bloco "Nova subcategoria…" (`an-nova-sub`, `an-nova-sub-nome`, `an-nova-sub-ok`, `an-nova-sub-cancelar`, `an-nova-sub-erro`) espelhando o da categoria.

- [ ] **Step 1: Implementar** os dois handlers, o preload e os tipos.
- [ ] **Step 2: Implementar a tela** espelhando `carregarCategorias`/`an-categoria`/`an-nova-cat`: `carregarSubcategorias(escolhida)` com contador de corrida próprio (`seqSubcategorias`), `form.temSubcategorias = lista.length > 0`, `form.subcategoria = sel.value`; o `<select>` fica desabilitado sem categoria ou sem pastas, e quando a lista tem pastas começa com o texto "Escolha a subcategoria…" sem valor (obriga a escolher); trocar plataforma ou categoria zera `subcategoria` e recarrega; `NOVA` ("Nova subcategoria…") abre o bloco e, ao dar OK com sucesso, recarrega a lista já selecionando o nome novo; "Fazer outro anúncio" (`novoAnuncio`) preserva plataforma, categoria e subcategoria; `an-subcategoria` entra na lista de campos desabilitados quando falta a pasta de anúncios (`semPasta`).
- [ ] **Step 3: Verificar** — `npx tsc --noEmit` limpo, `npx vitest run` verde, `npm run build` termina com `build ok`. No relatório, listar os passos de conferência visual no Windows (escolher categoria com e sem subpastas; criar nova subcategoria; trocar de categoria rápido; ver o caminho em "Será criado").
- [ ] **Step 4: Commit** — `feat(anuncios): lista de subcategorias e Nova subcategoria na tela`.

---

### Task 4: Roteiro de teste e versão

**Files:**
- Modify: `docs/teste-manual-anuncios.md`, `package.json` (+ as duas versões raiz de `package-lock.json`)

**Interfaces:**
- Consumes: comportamento das Tasks 1–3

- [ ] **Step 1: Atualizar o roteiro**: novo teste "Subcategoria" (categoria com subpastas obriga escolher; "Nova subcategoria…" cria a pasta; o quadro "Será criado" mostra `…\Categoria\Subcategoria\<arte>`; a arte nasce nessa pasta e o `.txt` traz a linha `Subcategoria:`; categoria sem subpastas cria direto nela); e nos testes já existentes, ajustar os caminhos esperados quando houver subcategoria. Avisar no roteiro que uma pasta de arte solta dentro da categoria aparece na lista de subcategorias.
- [ ] **Step 2: Versão** `0.11.0` em `package.json` e nas duas entradas raiz do `package-lock.json` (sem mexer em dependências).
- [ ] **Step 3: Rodar tudo** — `npx tsc --noEmit`; `npx vitest run`; `npm run build` → `build ok`.
- [ ] **Step 4: Commit** — `feat(anuncios): roteiro de teste da subcategoria e versão 0.11.0`.
- [ ] **Step 5: PARAR.** Sem `git push`; avisar o usuário e esperar a autorização para publicar.
