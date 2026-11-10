import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { EventEmitter } from 'node:events';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { entradaValida } from '../app/historico';
import { criarHistorico, nomeSeguro } from './historico';
import { rascunhoValido } from '../app/rascunhos';
import { criarRascunhos } from './rascunhos';
import { criarConfigDesigner } from './config-designer';
import { listarPendentes, moverParaAprovar } from './pasta-fluxo';
import { caminhoPermitido, pastaMkp } from './paths';
import { criarAtualizador, type AtualizadorLike } from './updater';

export interface CamadaBruta {
  width: number;
  height: number;
  data: Uint8Array;
}

// dist/main/main.js → ../../pack, tanto em desenvolvimento quanto dentro do app instalado
const PACOTES = ['especificacao', 'verso'] as const;
const pastaDoPacote = (nome?: string) => {
  if (nome !== undefined && !(PACOTES as readonly string[]).includes(nome)) throw new Error('Pacote desconhecido.');
  return nome ? join(__dirname, '..', '..', 'pack', nome) : join(__dirname, '..', '..', 'pack');
};

async function lerPng(caminho: string): Promise<CamadaBruta> {
  const png = PNG.sync.read(await readFile(caminho));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

/** Lê mockup.json e todas as camadas PNG do pacote; as imagens já vão decodificadas (RGBA exato, sem perda). */
ipcMain.handle('carregar-pacote', async (_e, nome?: string) => {
  const pasta = pastaDoPacote(nome);
  const json = await readFile(join(pasta, 'mockup.json'), 'utf-8');
  const pack = JSON.parse(json) as { stack: { file?: string }[]; artMask: { file: string } };
  const arquivos = new Set<string>([pack.artMask.file]);
  for (const c of pack.stack) if (c.file) arquivos.add(c.file);
  const camadas: Record<string, CamadaBruta> = {};
  for (const f of arquivos) camadas[f] = await lerPng(join(pasta, 'layers', basename(f)));
  return { json, camadas };
});

async function lerPdf(caminho: string) {
  if (!['.pdf', '.png', '.jpg', '.jpeg'].includes(extname(caminho).toLowerCase())) throw new Error('Esse arquivo não é um PDF, PNG ou JPG.');
  return { nome: basename(caminho), caminho, bytes: new Uint8Array(await readFile(caminho)) };
}

ipcMain.handle('escolher-pdf', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Escolher o PDF das capas (ou uma imagem PNG/JPG)',
    properties: ['openFile'],
    filters: [{ name: 'PDF ou imagem', extensions: ['pdf', 'png', 'jpg', 'jpeg'] }],
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

/** Quem está usando: o usuário do Windows. Cada operador tem o seu histórico, numa pasta só dele. */
function operador(): string {
  try {
    return userInfo().username;
  } catch {
    return process.env.USERNAME ?? 'usuario';
  }
}
const historicoDoOperador = () => criarHistorico(join(app.getPath('userData'), 'usuarios', nomeSeguro(operador()), 'historico.json'));
const rascunhosDoOperador = () => criarRascunhos(join(app.getPath('userData'), 'usuarios', nomeSeguro(operador()), 'rascunhos.json'));
ipcMain.handle('rascunhos-listar', () => rascunhosDoOperador().listar());
ipcMain.handle('rascunhos-salvar', (_e, r: unknown) => {
  if (!rascunhoValido(r)) throw new Error('Rascunho inválido.');
  return rascunhosDoOperador().salvar(r);
});
ipcMain.handle('rascunhos-remover', (_e, caminho: unknown) => {
  if (typeof caminho !== 'string') throw new Error('Caminho inválido.');
  return rascunhosDoOperador().remover(caminho);
});
// ---- Modo designer: funções só de quem liga (desligado por padrão, guardado por usuário do Windows) ----
const configDoDesigner = () => criarConfigDesigner(join(app.getPath('userData'), 'usuarios', nomeSeguro(operador()), 'designer.json'));
async function exigirDesigner() {
  const c = await configDoDesigner().ler();
  if (!c.designer) throw new Error('Função disponível só no Modo designer.');
  return c;
}
const normalizar = (p: string) => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p));
ipcMain.handle('designer-estado', () => configDoDesigner().ler());
ipcMain.handle('designer-ligar', (_e, ligado: unknown) => {
  if (typeof ligado !== 'boolean') throw new Error('Valor inválido.');
  return configDoDesigner().salvar({ designer: ligado });
});
ipcMain.handle('designer-escolher-pasta', async (_e, qual: unknown) => {
  await exigirDesigner();
  if (qual !== 'pasta1' && qual !== 'pasta2') throw new Error('Pasta inválida.');
  const r = await dialog.showOpenDialog({
    title: qual === 'pasta1' ? 'Escolher a Pasta 1 (AGUARDA ARTE)' : 'Escolher a Pasta 2 (APROVAR)',
    properties: ['openDirectory'],
  });
  const caminho = r.filePaths[0];
  if (r.canceled || !caminho) return configDoDesigner().ler();
  return configDoDesigner().salvar({ [qual]: caminho });
});
ipcMain.handle('fluxo-listar', async () => {
  const c = await exigirDesigner();
  if (!c.pasta1) return [];
  return listarPendentes(c.pasta1);
});
ipcMain.handle('fluxo-mover', async (_e, caminhoCliente: unknown) => {
  const c = await exigirDesigner();
  if (typeof caminhoCliente !== 'string') throw new Error('Pasta inválida.');
  if (!c.pasta1 || !c.pasta2) return { ok: false, motivo: 'Escolha a Pasta 1 e a Pasta 2 antes.' };
  // só move pastas que estão direto dentro da Pasta 1 escolhida
  if (normalizar(dirname(caminhoCliente)) !== normalizar(c.pasta1)) return { ok: false, motivo: 'Essa pasta não está dentro da Pasta 1.' };
  return moverParaAprovar(caminhoCliente, c.pasta2);
});
ipcMain.handle('operador', () => operador());
ipcMain.handle('historico-listar', () => historicoDoOperador().listar());
ipcMain.handle('historico-salvar', (_e, entrada: unknown) => {
  if (!entradaValida(entrada)) throw new Error('Entrada de histórico inválida.');
  return historicoDoOperador().salvar(entrada);
});
ipcMain.handle('historico-remover', (_e, id: unknown) => {
  if (typeof id !== 'string') throw new Error('Identificador inválido.');
  return historicoDoOperador().remover(id);
});
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
