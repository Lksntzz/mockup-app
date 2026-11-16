import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app, BrowserWindow, nativeImage } from 'electron';
import { pathToFileURL } from 'node:url';
import { htmlDaPagina, modeloPorId, nomeHtml, validarEntrada } from '../personalizar/modelo';
import { acharRecursos, estadoDasArtes, type EstadoDasArtes } from './personalizar';

export interface ImpressoraInfo { nome: string; padrao: boolean }
/** aviso: a fonte instalada neste computador parece ser outra versão da Cream Candy (acentos e ondas podem sair fora do lugar). */
/** png: na verdade JPEG (qualidade 90): codifica bem mais rápido que PNG e é menor; o nome do campo ficou por compatibilidade. */
export type ResultadoPrevia = { ok: true; png: Uint8Array; aviso?: string } | { ok: false; motivo: string };
/** preparoMs: montar a página; envioMs: do Chromium até o Windows aceitar o trabalho (mostrado na tela para achar a etapa lenta). */
export type ResultadoImpressao = { ok: true; preparoMs?: number; envioMs?: number } | { ok: false; motivo: string };

/** Uma página por vez: prévia e impressão nunca disputam a mesma janela escondida. */
let fila: Promise<unknown> = Promise.resolve();
function naFila<T>(tarefa: () => Promise<T>): Promise<T> {
  const t = fila.then(tarefa, tarefa);
  fila = t.catch(() => undefined);
  return t;
}

const ESPERA_MAX_MS = 20_000;
/** A4 a 96 dpi, o tamanho CSS da página. */
const LARG_PX = 794;
const ALT_PX = 1123;

/** Escala da janela na prévia: a página A4 inteira (1123 px) não cabe em telas de 1080 px, e a janela escondida também é limitada pela tela. A escala é feita na própria página (não pelo zoom do navegador). */
const ESCALA_PREVIA = 0.8;

/** Pasta das artes: dentro do programa instalado (resources/artes) ou assets/artes no desenvolvimento. */
export function pastaDasArtes(): string {
  return app.isPackaged ? join(process.resourcesPath, 'artes') : join(app.getAppPath(), 'assets', 'artes');
}

export function estadoDaPersonalizacao(): Promise<EstadoDasArtes> {
  return estadoDasArtes(pastaDasArtes());
}

interface Montada { win: BrowserWindow; arquivo: string; extras: string[] }

/** Largura da cópia reduzida da arte usada só na prévia: a tela mostra ~400 px, então redesenhar a arte de 2481 px a cada letra seria trabalho jogado fora (pesa em PC fraco). */
const LARGURA_ARTE_PREVIA = 1000;

/** Monta a página numa janela escondida e espera arte, fontes e tamanho final. A janela e o arquivo temporário são de quem chamou. */
async function montar(modeloId: unknown, nome: string, inicial: string, escala: number): Promise<{ ok: true; m: Montada } | { ok: false; motivo: string }> {
  const rec = await acharRecursos(modeloId, pastaDasArtes());
  if (!rec.ok) return rec;
  const { recursos, arteArquivo, frenteArquivo } = rec.arte;
  const arquivo = join(tmpdir(), `mockup-personalizado-${randomUUID()}.html`);
  const extras: string[] = [arquivo];
  let win: BrowserWindow | undefined;
  try {
    if (escala < 1) {
      // cópias reduzidas (arte e camada da frente) só para a prévia
      const reduzir = async (origem: string, ext: 'jpg' | 'png'): Promise<string | undefined> => {
        const img = nativeImage.createFromPath(origem);
        if (img.getSize().width <= LARGURA_ARTE_PREVIA) return undefined;
        const destino = join(tmpdir(), `mockup-previa-arte-${randomUUID()}.${ext}`);
        const peq = img.resize({ width: LARGURA_ARTE_PREVIA, quality: 'good' });
        await writeFile(destino, ext === 'jpg' ? peq.toJPEG(92) : peq.toPNG());
        extras.push(destino);
        return destino;
      };
      const arteRed = await reduzir(arteArquivo, 'jpg');
      if (arteRed) recursos.arteUrl = pathToFileURL(arteRed).href;
      const frenteRed = frenteArquivo ? await reduzir(frenteArquivo, 'png') : undefined;
      if (frenteRed) recursos.frenteUrl = pathToFileURL(frenteRed).href;
    }
    await writeFile(arquivo, htmlDaPagina(recursos, nome, inicial, escala), 'utf8');
    win = new BrowserWindow({
      show: false,
      width: Math.round(LARG_PX * escala),
      height: Math.round(ALT_PX * escala),
      useContentSize: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    await win.loadFile(arquivo);
    const inicio = Date.now();
    for (;;) {
      const pronto = await win.webContents.executeJavaScript('window.__pronto === true');
      if (pronto) break;
      if (Date.now() - inicio > ESPERA_MAX_MS) throw new Error('A arte demorou demais para carregar. Tente de novo.');
      await new Promise((r) => setTimeout(r, 80));
    }
    const faltam = (await win.webContents.executeJavaScript('window.__fonteFaltando || []')) as unknown;
    if (Array.isArray(faltam) && faltam.length > 0) {
      throw new Error(`A fonte ${faltam.map(String).join(' e ')} não está instalada neste computador. Instale no Windows a mesma fonte que o Corel usa e tente de novo.`);
    }
    // a janela está escondida: espera a tela repintar com o tamanho final da letra antes de fotografar ou imprimir
    await esperarPintura(win);
    return { ok: true, m: { win, arquivo, extras } };
  } catch (e) {
    if (win && !win.isDestroyed()) win.destroy();
    await Promise.all(extras.map((f) => unlink(f).catch(() => undefined)));
    return { ok: false, motivo: e instanceof Error && /demorou|não está instalada/.test(e.message) ? e.message : `Não consegui montar a arte: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function esperarPintura(win: BrowserWindow, extraMs = 150): Promise<void> {
  await win.webContents.executeJavaScript('new Promise(function(r){var t=setTimeout(r,600);requestAnimationFrame(function(){requestAnimationFrame(function(){clearTimeout(t);r(true);});});})');
  win.webContents.invalidate();
  await new Promise((r) => setTimeout(r, extraMs));
}

async function descartar(m: Montada): Promise<void> {
  if (!m.win.isDestroyed()) m.win.destroy();
  await Promise.all(m.extras.map((f) => unlink(f).catch(() => undefined)));
}

async function comPagina<T>(modeloId: unknown, nome: string, inicial: string, escala: number, usar: (win: BrowserWindow) => Promise<T>): Promise<T | { ok: false; motivo: string }> {
  const r = await montar(modeloId, nome, inicial, escala);
  if (!r.ok) return r;
  try {
    return await usar(r.m.win);
  } catch (e) {
    return { ok: false, motivo: `Não consegui montar a arte: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    await descartar(r.m);
  }
}

/** Janela da prévia mantida aberta: arte e fontes carregam uma vez; a cada digitação só o nome muda. Fecha sozinha depois de um tempo parada. */
let previaViva: { chave: string; m: Montada; limpeza: ReturnType<typeof setTimeout> } | undefined;
const PREVIA_OCIOSA_MS = 3 * 60_000;

/** Fecha a janela escondida da prévia (ao sair do programa ou ao fechar a janela principal: ela não pode manter o app vivo). */
export function soltarPrevia(): void {
  if (!previaViva) return;
  clearTimeout(previaViva.limpeza);
  const m = previaViva.m;
  previaViva = undefined;
  void descartar(m);
}

async function janelaDaPrevia(modeloId: unknown, nome: string, inicial: string): Promise<{ ok: true; win: BrowserWindow; novo: boolean } | { ok: false; motivo: string }> {
  // uma janela por arte: trocar de arte na lista monta a nova (as artes ficam dentro do programa, então só o id importa)
  const chave = typeof modeloId === 'string' && modeloId !== '' ? modeloId : '(padrão)';
  if (previaViva && (previaViva.chave !== chave || previaViva.m.win.isDestroyed())) soltarPrevia();
  if (previaViva) {
    clearTimeout(previaViva.limpeza);
    previaViva.limpeza = setTimeout(soltarPrevia, PREVIA_OCIOSA_MS);
    return { ok: true, win: previaViva.m.win, novo: false };
  }
  const r = await montar(modeloId, nome, inicial, ESCALA_PREVIA);
  if (!r.ok) return r;
  const limpeza = setTimeout(soltarPrevia, PREVIA_OCIOSA_MS);
  limpeza.unref();
  previaViva = { chave, m: r.m, limpeza };
  return { ok: true, win: r.m.win, novo: true };
}

/** Abre a janela da prévia antes da primeira digitação (a aba acabou de abrir): a primeira prévia deixa de pagar o carregamento da arte e das fontes. */
export function aquecerPrevia(modeloId: unknown): void {
  void naFila(async () => {
    await janelaDaPrevia(modeloId, 'A', 'A').catch(() => undefined);
  }).catch(() => undefined);
}

export function previaDaPersonalizacao(entrada: { modelo: unknown; nome: unknown; inicial: unknown }): Promise<ResultadoPrevia> {
  const v = validarEntrada(entrada, false, modeloPorId(entrada.modelo)?.inicialComAcento === true);
  if (!v.ok) return Promise.resolve(v);
  return naFila(async () => {
    try {
      const j = await janelaDaPrevia(entrada.modelo, v.nome, v.inicial);
      if (!j.ok) return j;
      const win = j.win;
      if (!j.novo) {
        // janela já pronta: troca só o nome e a letra grande e espera repintar
        await win.webContents.executeJavaScript(`window.__atualizar(${JSON.stringify(nomeHtml(v.nome, modeloPorId(entrada.modelo)))}, ${JSON.stringify(v.inicial)})`);
        await esperarPintura(win, 40);
      }
      const img = await win.webContents.capturePage();
      const dif = (await win.webContents.executeJavaScript('window.__fonteDiferente || []')) as unknown;
      const larg = (await win.webContents.executeJavaScript('(window.__largurasFonte || "") + (window.__erroMedicao ? " erro: " + window.__erroMedicao : "")')) as unknown;
      const avisos: string[] = [];
      if (Array.isArray(dif) && dif.length > 0) {
        avisos.push(`Atenção: a fonte Cream Candy deste computador parece ser de outra versão (as letras têm larguras diferentes da fonte do designer). Acentos e ondas podem sair fora do lugar. Instale neste computador a mesma Cream Candy do designer. Diagnóstico (me mande este texto): larguras medidas/esperadas: ${String(larg)}.`);
      }
      const aviso = avisos.length > 0 ? avisos.join(' ') : undefined;
      return { ok: true as const, png: new Uint8Array(img.toJPEG(90)), ...(aviso ? { aviso } : {}) };
    } catch (e) {
      soltarPrevia(); // se a janela ficou num estado estranho, a próxima prévia começa do zero
      return { ok: false as const, motivo: `Não consegui montar a prévia: ${e instanceof Error ? e.message : String(e)}` };
    }
  });
}

export async function listarImpressoras(): Promise<ImpressoraInfo[]> {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    const lista = await win.webContents.getPrintersAsync();
    return lista.map((p) => ({ nome: p.name, padrao: (p as unknown as { isDefault?: boolean }).isDefault === true || (p.options as unknown as Record<string, string> | undefined)?.['printer-is-default'] === 'true' })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  } finally {
    win.destroy();
  }
}

export async function imprimirPersonalizacao(
  entrada: { modelo: unknown; nome: unknown; inicial: unknown; copias: unknown; impressora: unknown },
): Promise<ResultadoImpressao> {
  const v = validarEntrada(entrada, true, modeloPorId(entrada.modelo)?.inicialComAcento === true);
  if (!v.ok) return v;
  if (typeof entrada.impressora !== 'string' || entrada.impressora === '') return { ok: false, motivo: 'Escolha a impressora.' };
  const impressora = entrada.impressora;
  // sem listar as impressoras de novo aqui (abria uma janela e consultava o Windows a cada clique): se a impressora sumiu, o Windows recusa e a tela mostra o motivo
  return naFila(async () => {
    const t0 = Date.now();
    const r = await comPagina(entrada.modelo, v.nome, v.inicial, 1, (win) => {
      const preparoMs = Date.now() - t0;
      const t1 = Date.now();
      return new Promise<ResultadoImpressao>((resolver) => {
        win.webContents.print(
          // A4 exato, sem margens e sem redução: a arte (195 x 255 mm) sai em tamanho real, centralizada
          { silent: true, printBackground: true, deviceName: impressora, copies: v.copias, pageSize: 'A4', margins: { marginType: 'none' }, scaleFactor: 100 },
          (sucesso, motivo) => resolver(sucesso ? { ok: true, preparoMs, envioMs: Date.now() - t1 } : { ok: false, motivo: motivo ? `A impressora recusou: ${motivo}` : 'A impressora não aceitou o trabalho.' }),
        );
      });
    });
    return r;
  });
}

/** Abre a janela "Preferências de impressão" do Windows para a impressora (o operador escolhe o tipo de papel uma vez; o Windows guarda). */
export async function abrirPreferenciasDaImpressora(nome: unknown): Promise<ResultadoImpressao> {
  if (process.platform !== 'win32') return { ok: false, motivo: 'Isso só funciona no Windows.' };
  if (typeof nome !== 'string' || nome === '') return { ok: false, motivo: 'Escolha a impressora.' };
  const existentes = await listarImpressoras().catch(() => [] as ImpressoraInfo[]);
  if (!existentes.some((p) => p.nome === nome)) return { ok: false, motivo: 'Essa impressora não está mais disponível. Atualize a lista.' };
  try {
    const filho = execFile('rundll32.exe', ['printui.dll,PrintUIEntry', '/e', '/n', nome], { windowsHide: false }, () => undefined);
    filho.unref();
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: `Não consegui abrir as preferências: ${e instanceof Error ? e.message : String(e)}` };
  }
}
