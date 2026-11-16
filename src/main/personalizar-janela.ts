import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserWindow } from 'electron';
import { htmlDaPagina, validarEntrada } from '../personalizar/modelo';
import { acharRecursos } from './personalizar';

export interface ImpressoraInfo { nome: string; padrao: boolean }
export type ResultadoPrevia = { ok: true; png: Uint8Array } | { ok: false; motivo: string };
export type ResultadoImpressao = { ok: true } | { ok: false; motivo: string };

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

async function comPagina<T>(pasta: string | undefined, nome: string, inicial: string, escala: number, usar: (win: BrowserWindow) => Promise<T>): Promise<T | { ok: false; motivo: string }> {
  const rec = await acharRecursos(pasta);
  if (!rec.ok) return rec;
  const arquivo = join(tmpdir(), `mockup-personalizado-${randomUUID()}.html`);
  let win: BrowserWindow | undefined;
  try {
    await writeFile(arquivo, htmlDaPagina(rec.recursos, nome, inicial, escala), 'utf8');
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
      if (Date.now() - inicio > ESPERA_MAX_MS) return { ok: false, motivo: 'A arte demorou demais para carregar. Tente de novo.' };
      await new Promise((r) => setTimeout(r, 80));
    }
    // a janela está escondida: espera a tela repintar com o tamanho final da letra antes de fotografar ou imprimir
    await win.webContents.executeJavaScript('new Promise(function(r){var t=setTimeout(r,600);requestAnimationFrame(function(){requestAnimationFrame(function(){clearTimeout(t);r(true);});});})');
    win.webContents.invalidate();
    await new Promise((r) => setTimeout(r, 150));
    return await usar(win);
  } catch (e) {
    return { ok: false, motivo: `Não consegui montar a arte: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    await unlink(arquivo).catch(() => undefined);
  }
}

export function previaDaPersonalizacao(pasta: string | undefined, entrada: { nome: unknown; inicial: unknown }): Promise<ResultadoPrevia> {
  const v = validarEntrada(entrada);
  if (!v.ok) return Promise.resolve(v);
  return naFila(async () => {
    const r = await comPagina(pasta, v.nome, v.inicial, ESCALA_PREVIA, async (win) => {
      const img = await win.webContents.capturePage();
      return { ok: true as const, png: new Uint8Array(img.toPNG()) };
    });
    return r;
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
  pasta: string | undefined,
  entrada: { nome: unknown; inicial: unknown; copias: unknown; impressora: unknown },
): Promise<ResultadoImpressao> {
  const v = validarEntrada(entrada, true);
  if (!v.ok) return v;
  if (typeof entrada.impressora !== 'string' || entrada.impressora === '') return { ok: false, motivo: 'Escolha a impressora.' };
  const impressora = entrada.impressora;
  const existentes = await listarImpressoras().catch(() => [] as ImpressoraInfo[]);
  if (!existentes.some((p) => p.nome === impressora)) return { ok: false, motivo: 'Essa impressora não está mais disponível. Atualize a lista e escolha de novo.' };
  return naFila(async () => {
    const r = await comPagina(pasta, v.nome, v.inicial, 1, (win) =>
      new Promise<ResultadoImpressao>((resolver) => {
        win.webContents.print(
          { silent: true, printBackground: true, deviceName: impressora, copies: v.copias, pageSize: 'A4', margins: { marginType: 'none' } },
          (sucesso, motivo) => resolver(sucesso ? { ok: true } : { ok: false, motivo: motivo ? `A impressora recusou: ${motivo}` : 'A impressora não aceitou o trabalho.' }),
        );
      }),
    );
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
