import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { PNG } from 'pngjs';

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

ipcMain.handle('escolher-pdf', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Escolher o PDF das capas',
    properties: ['openFile'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  const caminho = r.filePaths[0];
  if (r.canceled || !caminho) return null;
  return { nome: basename(caminho), bytes: new Uint8Array(await readFile(caminho)) };
});

ipcMain.handle('escolher-pasta', async () => {
  const r = await dialog.showOpenDialog({ title: 'Escolher a pasta dos mockups', properties: ['openDirectory', 'createDirectory'] });
  const pasta = r.filePaths[0];
  return r.canceled || !pasta ? null : pasta;
});

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
  return win;
}

app.whenReady().then(() => {
  criarJanela();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});
app.on('window-all-closed', () => app.quit());
