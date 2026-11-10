import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { EventEmitter } from 'node:events';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { PNG } from 'pngjs';
import { caminhoPermitido, pastaMkp } from './paths';
import { criarAtualizador, type AtualizadorLike } from './updater';

export interface CamadaBruta {
  width: number;
  height: number;
  data: Uint8Array;
}

// dist/main/main.js → ../../pack, tanto em desenvolvimento quanto dentro do app instalado
const pastaDoPacote = () => join(__dirname, '..', '..', 'pack');

async function lerPng(caminho: string): Promise<CamadaBruta> {
  const png = PNG.sync.read(await readFile(caminho));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

/** Lê mockup.json e todas as camadas PNG do pacote; as imagens já vão decodificadas (RGBA exato, sem perda). */
ipcMain.handle('carregar-pacote', async () => {
  const pasta = pastaDoPacote();
  const json = await readFile(join(pasta, 'mockup.json'), 'utf-8');
  const pack = JSON.parse(json) as { stack: { file?: string }[]; artMask: { file: string } };
  const arquivos = new Set<string>([pack.artMask.file]);
  for (const c of pack.stack) if (c.file) arquivos.add(c.file);
  const camadas: Record<string, CamadaBruta> = {};
  for (const f of arquivos) camadas[f] = await lerPng(join(pasta, 'layers', basename(f)));
  return { json, camadas };
});

async function lerPdf(caminho: string) {
  if (extname(caminho).toLowerCase() !== '.pdf') throw new Error('Esse arquivo não é um PDF.');
  return { nome: basename(caminho), caminho, bytes: new Uint8Array(await readFile(caminho)) };
}

ipcMain.handle('escolher-pdf', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Escolher o PDF das capas',
    properties: ['openFile'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  const caminho = r.filePaths[0];
  if (r.canceled || !caminho) return null;
  return lerPdf(caminho);
});

/** Arrastar e soltar: o app só recebe o caminho do arquivo. */
ipcMain.handle('ler-pdf', (_e, caminho: string) => lerPdf(caminho));

/** Só a pasta MKP (criada ao lado do PDF) aceita gravação. */
let pastaEscolhida: string | null = null;

function exigirPermitido(caminho: string): void {
  if (!pastaEscolhida || !caminhoPermitido(pastaEscolhida, caminho)) {
    throw new Error('Caminho fora da pasta MKP.');
  }
}

ipcMain.handle('preparar-mkp', async (_e, caminhoDoPdf: string) => {
  const pasta = pastaMkp(caminhoDoPdf);
  await stat(caminhoDoPdf); // o PDF precisa existir; senão não há de onde tirar a pasta
  await mkdir(pasta, { recursive: true });
  pastaEscolhida = pasta;
  return pasta;
});

ipcMain.handle('existe', async (_e, caminho: string) => {
  exigirPermitido(caminho);
  return stat(caminho).then(() => true, () => false);
});
ipcMain.handle('gravar-arquivo', async (_e, caminho: string, bytes: Uint8Array) => {
  exigirPermitido(caminho);
  await writeFile(caminho, bytes);
});
ipcMain.handle('renomear-arquivo', async (_e, de: string, para: string) => {
  exigirPermitido(de);
  exigirPermitido(para);
  await rename(de, para);
});
ipcMain.handle('remover-arquivo', async (_e, caminho: string) => {
  exigirPermitido(caminho);
  await unlink(caminho);
});
ipcMain.handle('confirmar-sobrescrever', async (_e, arquivos: string[]) => {
  const lista = arquivos.slice(0, 8).map((a) => basename(a)).join('\n') + (arquivos.length > 8 ? `\n… e mais ${arquivos.length - 8}` : '');
  const r = await dialog.showMessageBox({
    type: 'question',
    title: 'Arquivos já existem',
    message: `${arquivos.length} ${arquivos.length === 1 ? 'arquivo já existe' : 'arquivos já existem'} nessa pasta. Substituir?`,
    detail: lista,
    buttons: ['Substituir', 'Cancelar'],
    defaultId: 1,
    cancelId: 1,
  });
  return r.response === 0;
});

/** No app instalado usa o electron-updater; no desenvolvimento um atualizador vazio (nunca é usado: `ativo` é falso). */
function obterAtualizador(): AtualizadorLike {
  if (!app.isPackaged) return new EventEmitter() as AtualizadorLike;
  // carregado só quando instalado; fica fora do pacote do esbuild (vai em node_modules dentro do app)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('electron-updater').autoUpdater as AtualizadorLike;
}

const atualizador = criarAtualizador({
  updater: obterAtualizador(),
  ativo: app.isPackaged,
  enviar: (estado) => BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('atualizacao', estado)),
});
ipcMain.handle('versao', () => app.getVersion());
ipcMain.handle('estado-atualizacao', () => atualizador.estado());
ipcMain.handle('verificar-atualizacao', () => atualizador.verificar(true));
ipcMain.handle('instalar-atualizacao', () => atualizador.instalar());

const QUATRO_HORAS = 4 * 60 * 60 * 1000;

function criarJanela(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 640,
    title: 'Mockup da Agenda',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  void win.loadFile(join(__dirname, '..', 'renderer', 'index.html'));
  // verifica ao abrir (em silêncio: sem internet não aparece nada) e de tempos em tempos enquanto o app fica aberto
  win.webContents.once('did-finish-load', () => void atualizador.verificar(false));
  const timer = setInterval(() => void atualizador.verificar(false), QUATRO_HORAS);
  win.on('closed', () => clearInterval(timer));
  return win;
}

app.whenReady().then(() => {
  criarJanela();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});
app.on('window-all-closed', () => app.quit());
