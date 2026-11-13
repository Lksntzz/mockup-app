# Anúncios pendentes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a arte (pasta, .txt, .cdr) sem EAN, listar cards "Pendente" e concluir depois colocando o código de barras no .cdr existente.

**Architecture:** `pendente.json` dentro da pasta da arte guarda o que falta; main varre as pastas e expõe lista/concluir por IPC; renderer mostra os cards; macro nova do Corel desenha só o EAN no .cdr aberto lendo `Corel\ean.txt`.

**Tech Stack:** Electron + TypeScript (esbuild), vitest, macro VBA `tools/corel/MKP.bas` (ASCII puro, CRLF).

**Spec:** docs/superpowers/specs/2026-11-13-anuncios-pendentes-design.md

## Global Constraints
- `npx tsc --noEmit` limpo, `npx vitest run` verde, `npm run build` → "build ok"; não instalar dependências; sem push sem o usuário dizer "pode enviar"; versão 0.12.0 só na Task 5.
- Textos da interface em português; nada vindo do disco entra em innerHTML (usar textContent/preencher).
- MKP.bas: ASCII puro e CRLF; manifestos/ean.txt em latin1.
- Caminhos recebidos por IPC só valem dentro da raiz dos Anúncios (`dentroDaRaiz`).
- O fluxo de quem informa todos os EANs não muda.

## Review Focus
- Concluir duas vezes (ou com `pendente.json` estragado) não pode corromper `.txt` nem apagar arquivos.
- Pasta apagada/movida no Drive depois de listar: card mostra erro, não quebra.
- Capa com EAN parcial (algumas já tinham, outras faltam): só as faltantes mudam.
- EAN repetido entre capas ou igual a um já gravado é recusado.
- A macro não duplica o código se rodada duas vezes e não toca em nada além do EAN.

---
### Task 1: Modelo da pendência
**Files:** Create `src/anuncios/pendencia.ts`; Test `tests/anuncios/pendencia.test.ts`
**Interfaces:** Produces:
`interface CapaPendente { n: number; capa: string; faltaEan: boolean; faltaSku: boolean }`
`interface Pendencia { versao: 1; arte: string; capas: CapaPendente[] }`
`montarPendencia(arte: string, variacoes: Variacao[]): Pendencia | undefined` (undefined se nenhuma capa sem EAN)
`serializarPendencia(p: Pendencia): string` / `lerPendencia(texto: string): Pendencia` (lança erro claro se estragado/versão ≠ 1)
`aposConcluir(p: Pendencia, preenchidos: number[]): Pendencia | undefined` (remove faltaEan das capas preenchidas; undefined quando nenhuma falta EAN)
- [ ] Testes: tudo com EAN → undefined; EAN parcial marca só as vazias; SKU vazio marca faltaSku; ida e volta serializar/ler; texto inválido e `versao: 2` lançam; `aposConcluir` parcial e total.
- [ ] Implementar; rodar vitest; commit.

### Task 2: Criar como pendente
**Files:** Modify `src/main/anuncios-criar.ts`, `src/app/anuncios-form.ts`, `src/renderer/anuncios.ts`, `src/renderer/index.html`; Tests `tests/main/anuncios-criar.test.ts`, `tests/app/anuncios-form.test.ts`
**Interfaces:** Consumes Task 1 `montarPendencia`/`serializarPendencia`. Produces: `criarAnuncio` grava `pendente.json` (UTF-8) na pasta da arte quando `montarPendencia` ≠ undefined; `validar().podeCriar` passa a valer também com EAN vazio (não com EAN inválido/repetido); o aviso "sem EAN: serão montadas SEM código de barras" permanece.
- [ ] Testes: criar com EAN vazio → `pendente.json` existe com as capas certas; criar com todos os EAN → não existe; rollback (falha no meio) remove a pasta inclusive `pendente.json`; `validar` com EAN vazio → `podeCriar` true, EAN inválido → false.
- [ ] Implementar. Botão principal vira "Criar como pendente" quando há EAN vazio (texto do botão e dica; "Só criar a pasta e o .txt" continua).
- [ ] tsc/vitest/build; commit.

### Task 3: Listar e concluir (main + IPC)
**Files:** Create `src/main/anuncios-pendentes.ts`; Modify `src/main/main.ts`, `src/main/preload.ts`, `src/renderer/global.d.ts`; Test `tests/main/anuncios-pendentes.test.ts`
**Interfaces:** Consumes Task 1; `listarPlataformas/listarCategorias/listarSubcategorias`, `dentroDaRaiz`, `normalizarEan`, `isValidGtin13`, `gerarSvgEan13`, `encodeEan13`. Produces:
`interface CardPendente { pasta: string; arte: string; plataforma: string; categoria: string; subcategoria?: string; capas: CapaPendente[]; erro?: string }`
`listarPendentes(raiz: string): Promise<CardPendente[]>` (varre Plataforma›Categoria›[Subcategoria]›Arte; `pendente.json` estragado → card com `erro`; leituras em paralelo, no máximo ~8 por vez; ordem: pasta mais recente primeiro por mtime)
`concluirPendente(raiz: string, pasta: unknown, eans: Record<number, string>): Promise<{ ok: true; faltam: number; avisos: string[] } | { ok: false; motivo: string }>` — valida (dentro da raiz, `pendente.json` legível, cada n pedido existe e faltava, GTIN-13 válido, sem repetir entre si e com EANs já gravados), grava `Codigo de barras\Capa N - EAN.svg`, troca `EAN: (pendente)` só na linha `N | …` do `.txt` (linha não achada → aviso, sem mexer), grava `Corel\ean.txt` (linhas `n|ean|mod`, latin1, CRLF; acumula as capas feitas desde a última colocação no Corel), regrava `pendente.json` por ÚLTIMO e o apaga quando nada mais falta.
IPC: `anuncios-pendentes()` e `anuncios-concluir-pendente(pasta, eans)`.
- [ ] Testes: lista acha pendentes em 2 e 3 níveis; ignora pastas sem `pendente.json`; `pendente.json` estragado → card com erro; concluir total apaga `pendente.json` e atualiza só a linha do `.txt`; concluir parcial mantém as outras; EAN inválido/repetido/já usado recusado sem gravar nada; pasta fora da raiz recusada; rodar duas vezes a mesma capa → recusa; `.txt` sem a linha → aviso.
- [ ] Implementar; tsc/vitest/build; commit.

### Task 4: Macro AdicionarEanNoCdr
**Files:** Modify `tools/corel/MKP.bas`; Test `tests/tools/macro-anuncio.test.ts` (testes de texto)
**Interfaces:** Consumes `Corel\ean.txt` (Task 3). Produces `Sub AdicionarEanNoCdr()`: usa `ActiveDocument`, deduz `<pasta>\Corel\ean.txt` a partir do caminho do .cdr (pergunta a pasta se o documento não foi salvo), para cada linha `n|ean|mod` desenha o EAN na página par `2n` com o mesmo `DesenharEan` (fundo branco arredondado) dentro do retângulo EAN achado por `AcharRetanguloDoEan`; nomeia o grupo `MKP-EAN-n` e pula se já existir; mensagem final com o que foi feito/pulado; apaga `ean.txt` só se todas as linhas foram desenhadas.
- [ ] Testes de texto: a sub existe; usa `ean.txt`; reaproveita `DesenharEan` e `AcharRetanguloDoEan`; checa o nome `MKP-EAN-`; ASCII puro e CRLF; `DesenharEan` passa a nomear o grupo (também no fluxo normal).
- [ ] Implementar; vitest; commit. (Não há Corel aqui: o roteiro da Task 5 cobre o teste manual.)

### Task 5: Cards na tela, concluir, roteiro e versão
**Files:** Modify `src/renderer/index.html`, `src/renderer/anuncios.ts`, `src/renderer/styles.css`, `docs/teste-manual-anuncios.md`, `package.json`, `package-lock.json` (0.12.0, só as duas entradas raiz)
**Interfaces:** Consumes IPC da Task 3 e a macro da Task 4.
- [ ] Seção "Pendentes" na aba Anúncios: cards com nome da arte, caminho, selo "Pendente" e o que falta; atualiza ao abrir a aba e após criar/concluir; vazio → "Nenhuma arte pendente."; card com erro mostra a mensagem e fica sem botão Concluir.
- [ ] "Concluir" abre o formulário só com as capas que faltam (campo EAN por capa, validação igual à do app); ao salvar mostra "Código de barras gerado" e orientação: abrir o .cdr no Corel e rodar `AdicionarEanNoCdr` (e botão "Abrir a pasta" se já existir no app); card some quando nada mais falta.
- [ ] Roteiro "Teste P" em docs/teste-manual-anuncios.md (criar pendente → card → concluir parcial → concluir total → macro no Corel → card some → rodar a macro de novo não duplica), em linguagem de leigo; versão 0.12.0; tsc/vitest/build; commit.
