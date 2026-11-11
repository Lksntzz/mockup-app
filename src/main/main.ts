import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, Notification, powerMonitor, shell, Tray } from 'electron';
import { EventEmitter } from 'node:events';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir, tmpdir, userInfo } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { entradaValida } from '../app/historico';
import { criarHistorico, nomeSeguro } from './historico';
import { rascunhoValido } from '../app/rascunhos';
import { criarRascunhos } from './rascunhos';
import { criarConfigDesigner, type ConfigDesigner } from './config-designer';
import { moverParaAprovar, moverParaEtapa, origemDoCliente } from './pasta-fluxo';
import { atualizarEtapas, descartarVolta } from './voltas';
import { atualizarVistos, buscarFinalizados, chaveDe, listarClientes, norm, ultimaAlteracao } from './clientes';
import { criarPortaoDePin } from './pin';
import { acharPastasDoFluxo } from './achar-pastas';
import { arquivoAbrivel } from './abrir-arquivo';
import { achouArquivoNovo, linhasDoMolde, rodarMacroDoCorel } from './corel';
import { atualizacaoPodeInstalarSozinha, deveEsconderAoFechar, iniciaOculto } from './segundo-plano';
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
  // instala sozinho no Modo designer: com a janela escondida perto do relógio, ou com a janela aberta mas ninguém mexendo no computador há 5 minutos
  ocioso: () =>
    atualizacaoPodeInstalarSozinha({
      designer: designerLigado,
      janelaEmUso: BrowserWindow.getAllWindows().some((w) => w.isVisible() && !w.isMinimized()),
      segundosParado: powerMonitor.getSystemIdleTime(),
    }),
});
setInterval(() => atualizador.instalarSeOcioso(), 2 * 60 * 1000);
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
// o fechar da janela não pode esperar uma leitura de arquivo: guarda o estado do Modo designer na memória
let designerLigado = false;
let saindo = false;
let bandeja: Tray | null = null;
let avisouBandeja = false;
app.on('before-quit', () => {
  saindo = true;
});

function mostrarJanela(): void {
  const w = BrowserWindow.getAllWindows()[0];
  if (!w) return;
  if (w.isMinimized()) w.restore();
  w.show();
  w.focus();
}

/** Ícone perto do relógio: com o Modo designer ligado o app continua rodando (e alertando) com a janela fechada. */
function garantirBandeja(): void {
  if (bandeja) return;
  try {
    const icone = nativeImage.createFromPath(join(__dirname, '..', '..', 'build', 'icon.png')).resize({ width: 16, height: 16 });
    bandeja = new Tray(icone);
    bandeja.setToolTip('Mockup da Agenda: vigiando a Pasta 1');
    bandeja.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Abrir o Mockup da Agenda', click: mostrarJanela },
        { label: 'Sair de vez', click: () => app.quit() },
      ]),
    );
    bandeja.on('click', mostrarJanela);
  } catch (e) {
    console.warn('não consegui criar o ícone da bandeja', e);
  }
}

const portaoDePin = criarPortaoDePin();
ipcMain.handle('designer-ligar', async (_e, ligado: unknown, pin?: unknown) => {
  if (typeof ligado !== 'boolean') throw new Error('Valor inválido.');
  if (ligado) {
    const r = portaoDePin.tentar(pin);
    if (!r.ok) throw new Error(r.bloqueado ? 'Muitas tentativas. Espere 30 segundos.' : 'PIN incorreto.');
  }
  const c = await configDoDesigner().salvar({ designer: ligado });
  designerLigado = c.designer;
  if (designerLigado) garantirBandeja();
  else {
    bandeja?.destroy();
    bandeja = null;
    app.setLoginItemSettings({ openAtLogin: false });
  }
  return c;
});
ipcMain.handle('iniciar-windows-estado', async () => {
  await exigirDesigner();
  return app.getLoginItemSettings().openAtLogin;
});
ipcMain.handle('iniciar-windows-definir', async (_e, ligado: unknown) => {
  await exigirDesigner();
  if (typeof ligado !== 'boolean') throw new Error('Valor inválido.');
  app.setLoginItemSettings({ openAtLogin: ligado, args: ['--oculto'] });
  return app.getLoginItemSettings().openAtLogin;
});
ipcMain.handle('abrir-arquivo-cliente', async (_e, caminho: unknown) => {
  const c = await exigirDesigner();
  if (typeof caminho !== 'string') throw new Error('Arquivo inválido.');
  if (!arquivoAbrivel([c.pasta1 ?? '', c.pasta2 ?? '', c.pasta3 ?? ''], caminho)) {
    return { ok: false, motivo: 'Esse arquivo não está numa pasta de cliente (Pastas 1, 2 ou 3) ou não é um tipo que o app abre.' };
  }
  const erro = await shell.openPath(caminho);
  return erro ? { ok: false, motivo: `O Windows não conseguiu abrir o arquivo: ${erro}` } : { ok: true };
});
ipcMain.handle('designer-escolher-pasta', async (_e, qual: unknown) => {
  await exigirDesigner();
  const titulos = { pasta1: 'Escolher a Pasta 1 (AGUARDA ARTE)', pasta2: 'Escolher a Pasta 2 (APROVAR)', pasta3: 'Escolher a Pasta 3 (AGUARDA IMPRESSÃO)', pasta4: 'Escolher a Pasta 4 (FINALIZADOS)' } as const;
  if (typeof qual !== 'string' || !(qual in titulos)) throw new Error('Pasta inválida.');
  const r = await dialog.showOpenDialog({
    title: titulos[qual as keyof typeof titulos],
    properties: ['openDirectory'],
  });
  const caminho = r.filePaths[0];
  if (r.canceled || !caminho) return configDoDesigner().ler();
  return configDoDesigner().salvar({ [qual]: caminho });
});
/** Onde procurar as pastas do fluxo: as unidades D: a Z: (o Drive costuma ser G:) e a pasta do usuário. */
function raizesDeBusca(): string[] {
  if (process.env.MOCKUP_RAIZES_BUSCA) return process.env.MOCKUP_RAIZES_BUSCA.split(';').filter(Boolean);
  if (process.platform !== 'win32') return [];
  const unidades = 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `${l}:\\`).filter((r) => existsSync(r));
  return [...unidades, homedir()];
}
ipcMain.handle('designer-procurar-pastas', async (_e, substituir: unknown) => {
  const c = await exigirDesigner();
  const r = await acharPastasDoFluxo(raizesDeBusca());
  const novas: Partial<ConfigDesigner> = {};
  for (const k of ['pasta1', 'pasta2', 'pasta3', 'pasta4'] as const) {
    const achada = r.pastas[k];
    if (achada && (substituir === true || !c[k])) novas[k] = achada;
  }
  const config = Object.keys(novas).length > 0 ? await configDoDesigner().salvar(novas) : c;
  return { config, achou: Object.keys(novas).length, avisos: r.avisos };
});
ipcMain.handle('clientes-listar', async () => {
  const c = await exigirDesigner();
  const r = await listarClientes(c, Date.now(), 30_000, c.enviados);
  // aviso "voltou da Pasta X para a Pasta Y": compara com onde cada cliente foi visto da última vez
  const antes = { etapas: c.etapas ?? {}, voltas: c.voltas ?? {} };
  const depois = atualizarEtapas(antes, r.clientes, Date.now());
  if (JSON.stringify(depois) !== JSON.stringify(antes)) await configDoDesigner().salvar(depois);
  for (const cli of r.clientes) {
    const v = depois.voltas[norm(chaveDe(cli))];
    if (v && !cli.duplicado) cli.voltou = v;
  }
  return r;
});
ipcMain.handle('fluxo-voltou-visto', async (_e, caminhoCliente: unknown) => {
  const c = await exigirDesigner();
  if (typeof caminhoCliente !== 'string') throw new Error('Pasta inválida.');
  for (const raiz of [c.pasta1, c.pasta2, c.pasta3]) {
    const origem = raiz ? origemDoCliente(raiz, caminhoCliente) : null;
    if (origem) {
      const novo = descartarVolta({ etapas: c.etapas ?? {}, voltas: c.voltas ?? {} }, chaveDe({ nome: basename(caminhoCliente), ...(origem.grupo ? { grupo: origem.grupo } : {}) }));
      await configDoDesigner().salvar(novo);
      return true;
    }
  }
  throw new Error('Essa pasta não está nas pastas do fluxo.');
});
ipcMain.handle('clientes-buscar', async (_e, termo: unknown) => {
  const c = await exigirDesigner();
  if (typeof termo !== 'string') throw new Error('Busca inválida.');
  if (!c.pasta4) throw new Error('Escolha a Pasta 4 (Finalizados) para buscar.');
  return buscarFinalizados(c.pasta4, termo);
});
/** Anota quando o cliente foi enviado (ou conferido de novo); guarda só os 300 mais recentes. */
async function registrarEnvio(chave: string, minimo = 0): Promise<void> {
  const c = await configDoDesigner().ler();
  const todos = Object.entries({ ...c.enviados, [chave]: Math.max(Date.now(), minimo) }).sort((a, b) => b[1] - a[1]).slice(0, 300);
  await configDoDesigner().salvar({ enviados: Object.fromEntries(todos) });
}
ipcMain.handle('fluxo-conferido', async (_e, caminhoCliente: unknown) => {
  const c = await exigirDesigner();
  if (typeof caminhoCliente !== 'string') throw new Error('Pasta inválida.');
  for (const raiz of [c.pasta2, c.pasta3]) {
    const origem = raiz ? origemDoCliente(raiz, caminhoCliente) : null;
    if (origem) {
      // a base nunca fica antes do arquivo mais novo (relógio de outro PC no Drive não pode manter o aviso para sempre)
      await registrarEnvio(chaveDe({ nome: basename(caminhoCliente), ...(origem.grupo ? { grupo: origem.grupo } : {}) }), await ultimaAlteracao(caminhoCliente));
      return true;
    }
  }
  throw new Error('Essa pasta não está na Pasta 2 nem na Pasta 3.');
});
ipcMain.handle('fluxo-mover', async (_e, caminhoCliente: unknown) => {
  const c = await exigirDesigner();
  if (typeof caminhoCliente !== 'string') throw new Error('Pasta inválida.');
  if (!c.pasta1 || !c.pasta2) return { ok: false, motivo: 'Escolha a Pasta 1 e a Pasta 2 antes.' };
  // só move pastas que estão direto na Pasta 1 escolhida ou dentro de uma pasta de grupo (SHOPEE)
  const origem = origemDoCliente(c.pasta1, caminhoCliente);
  if (!origem) return { ok: false, motivo: 'Essa pasta não está dentro da Pasta 1.' };
  const r = await moverParaAprovar(caminhoCliente, c.pasta2, origem.grupo);
  if (r.ok) await registrarEnvio(chaveDe({ nome: basename(caminhoCliente), ...(origem.grupo ? { grupo: origem.grupo } : {}) }));
  return r;
});
/** Pasta onde o app deixa, por pouco tempo, as páginas de PDF viradas em PNG para o Corel importar. */
const PASTA_TEMPORARIA_DO_COREL = join(tmpdir(), 'mockup-agenda');
const dentroDaTemporaria = (caminho: string) => {
  const rel = relative(PASTA_TEMPORARIA_DO_COREL, resolve(caminho));
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
};
ipcMain.handle('salvar-temporario', async (_e, nome: unknown, bytes: unknown) => {
  await exigirDesigner();
  if (typeof nome !== 'string' || !(bytes instanceof Uint8Array)) throw new Error('Arquivo temporário inválido.');
  const ehPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (!ehPng || bytes.length > 120 * 1024 * 1024) throw new Error('Imagem temporária inválida.');
  await mkdir(PASTA_TEMPORARIA_DO_COREL, { recursive: true });
  const caminho = join(PASTA_TEMPORARIA_DO_COREL, `${Date.now()}-${nomeSeguro(nome).replace(/\.png$/i, '')}.png`);
  await writeFile(caminho, bytes);
  return caminho;
});
ipcMain.handle('corel-arte-no-molde', async (_e, entrada: unknown) => {
  const c = await exigirDesigner();
  const e = entrada as { frente?: unknown; verso?: unknown; destino?: unknown; copiar?: unknown } | null;
  const texto = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  const frente = texto(e?.frente);
  const verso = texto(e?.verso);
  const destino = texto(e?.destino);
  const copiar = texto(e?.copiar);
  if (!destino || (!frente && !verso)) throw new Error('Escolha pelo menos uma arte (frente ou verso).');
  const raizes = [c.pasta1 ?? '', c.pasta2 ?? '', c.pasta3 ?? ''];
  const temporarios = [frente, verso].filter((x): x is string => !!x && dentroDaTemporaria(x));
  try {
    for (const a of [frente, verso]) {
      if (a && !dentroDaTemporaria(a) && !arquivoAbrivel(raizes, a)) return { ok: false as const, motivo: 'Essa arte não está nas pastas do fluxo.' };
    }
    const pastaDoCliente = dirname(destino);
    const nasPastas = [c.pasta1, c.pasta2, c.pasta3].some((raiz) => raiz && origemDoCliente(raiz, pastaDoCliente));
    if (!nasPastas || !/ - MOLDE\.cdr$/i.test(destino)) return { ok: false as const, motivo: 'O destino do molde precisa ser a pasta do cliente.' };
    const r = await rodarMacroDoCorel('ArteDoClienteNoMolde', linhasDoMolde({ destino, ...(frente ? { frente } : {}), ...(verso ? { verso } : {}) }));
    if (r.ok) {
      // o Corel diz "rodou" até quando o macro mostrou um aviso de erro: confere se o .cdr do molde existe na pasta
      const base = basename(destino).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (await achouArquivoNovo(pastaDoCliente, 0, new RegExp(`^${base}$`, 'i'))) return r;
      if (copiar && arquivoAbrivel(raizes, copiar)) clipboard.writeText(copiar);
      return { ok: false as const, motivo: 'O Corel rodou o macro, mas o arquivo do molde não apareceu na pasta. Veja se ficou algum aviso na tela do Corel' };
    }
    // plano B: com o caminho copiado, o macro do Corel aceita colar quando rodado à mão
    if (copiar && arquivoAbrivel(raizes, copiar)) clipboard.writeText(copiar);
    return r;
  } finally {
    for (const t of temporarios) await unlink(t).catch(() => undefined);
  }
});
ipcMain.handle('corel-gerar-pdf', async (_e, caminhoCliente: unknown) => {
  const c = await exigirDesigner();
  if (typeof caminhoCliente !== 'string') throw new Error('Pasta inválida.');
  const dentro = [c.pasta1, c.pasta2, c.pasta3, c.pasta4].some((raiz) => raiz && origemDoCliente(raiz, caminhoCliente));
  if (!dentro) return { ok: false, motivo: 'Essa pasta não está nas pastas do fluxo.' };
  const inicio = Date.now();
  const r = await rodarMacroDoCorel('ExportarPDFparaMKP', caminhoCliente);
  if (!r.ok) return r;
  if (!(await achouArquivoNovo(caminhoCliente, inicio, /\.pdf$/i))) {
    return { ok: false, motivo: 'O Corel rodou o macro, mas não apareceu PDF novo na pasta. Veja se ficou algum aviso na tela do Corel.' };
  }
  return r;
});
ipcMain.handle('notificacao-testar', async () => {
  await exigirDesigner();
  avisar('Teste de notificação', 'Se você está vendo isto, o Windows está deixando o Mockup da Agenda avisar.', mostrarJanela);
  return { suportada: Notification.isSupported() };
});
ipcMain.handle('fluxo-avancar', async (_e, caminhoCliente: unknown) => {
  const c = await exigirDesigner();
  if (typeof caminhoCliente !== 'string') throw new Error('Pasta inválida.');
  // Pasta 2 → Pasta 3 e Pasta 3 → Pasta 4; mantém a pasta de grupo (SHOPEE)
  const passos: [string | undefined, string | undefined, string][] = [
    [c.pasta2, c.pasta3, 'Pasta 3'],
    [c.pasta3, c.pasta4, 'Pasta 4'],
  ];
  for (const [de, para, rotulo] of passos) {
    const origem = de ? origemDoCliente(de, caminhoCliente) : null;
    if (!origem) continue;
    if (!para) return { ok: false, motivo: `Escolha a ${rotulo} antes.` };
    const r = await moverParaEtapa(caminhoCliente, para, origem.grupo, rotulo);
    if (r.ok) await registrarEnvio(chaveDe({ nome: basename(caminhoCliente), ...(origem.grupo ? { grupo: origem.grupo } : {}) }));
    return r;
  }
  return { ok: false, motivo: 'Essa pasta não está na Pasta 2 nem na Pasta 3.' };
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

// procura versão nova no GitHub a cada 15 minutos (era 4 horas: uma versão publicada de manhã só era notada à tarde)
const QUINZE_MINUTOS = 15 * 60 * 1000;

/** Notificação do Windows (canto da tela). Se o sistema recusar, tenta o balão do ícone perto do relógio e pisca o app na barra de tarefas. */
function avisar(titulo: string, corpo: string, aoClicar?: () => void): void {
  const reserva = () => {
    try {
      bandeja?.displayBalloon({ title: titulo, content: corpo });
    } catch {
      // sem balão: o piscar na barra de tarefas abaixo ainda avisa
    }
  };
  try {
    if (Notification.isSupported()) {
      const n = new Notification({ title: titulo, body: corpo });
      if (aoClicar) n.on('click', aoClicar);
      n.on('failed', reserva);
      n.show();
    } else {
      reserva();
    }
  } catch {
    reserva();
  }
  const w = BrowserWindow.getAllWindows()[0];
  if (w && !w.isDestroyed() && (!w.isVisible() || w.isMinimized())) w.flashFrame(true);
}

/** Confere a Pasta 1 de tempos em tempos e avisa "arte para fazer" (só com o Modo designer ligado e o app aberto). */
async function vigiarPasta1(): Promise<void> {
  try {
    const c = await configDoDesigner().ler();
    if (!c.designer || !c.pasta1) return;
    const { clientes } = await listarClientes(c);
    const r = atualizarVistos(clientes, c.vistos);
    if (JSON.stringify(r.vistos) !== JSON.stringify(c.vistos)) await configDoDesigner().salvar({ vistos: r.vistos });
    if (r.alertar.length === 0) return;
    avisar('Arte para fazer', r.alertar.join(', '), () => {
      mostrarJanela();
      BrowserWindow.getAllWindows()[0]?.webContents.send('abrir-cliente');
    });
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('arte-para-fazer', r.alertar));
  } catch (e) {
    console.warn('vigia da Pasta 1', e);
  }
}

function criarJanela(oculta = false): BrowserWindow {
  const win = new BrowserWindow({
    show: !oculta,
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
  const timer = setInterval(() => void atualizador.verificar(false), QUINZE_MINUTOS);
  win.on('closed', () => clearInterval(timer));
  win.on('close', (e) => {
    if (!deveEsconderAoFechar({ designer: designerLigado }, saindo)) return;
    e.preventDefault();
    win.hide();
    garantirBandeja();
    if (!avisouBandeja) {
      avisouBandeja = true;
      try {
        if (Notification.isSupported()) {
          new Notification({ title: 'Mockup da Agenda continua aberto', body: 'Ele segue vigiando a Pasta 1. Para fechar de vez: botão direito no ícone perto do relógio > Sair de vez.' }).show();
        }
      } catch {
        // sem notificação do sistema: tudo bem
      }
    }
  });
  return win;
}

// uma instância só: dois apps abertos (ex.: iniciado com o Windows + aberto à mão) alertariam em dobro
const primeiraInstancia = app.requestSingleInstanceLock();
if (!primeiraInstancia) {
  app.quit();
} else {
  app.on('second-instance', () => mostrarJanela());
}
if (process.platform === 'win32') app.setAppUserModelId('br.com.agenda.mockup'); // notificações do Windows precisam disso

app.whenReady().then(async () => {
  if (!primeiraInstancia) return;
  designerLigado = (await configDoDesigner().ler()).designer;
  const oculta = iniciaOculto(process.argv, { designer: designerLigado });
  if (designerLigado) garantirBandeja();
  criarJanela(oculta);
  const periodo = Number(process.env.MOCKUP_VIGIA_MS) || 60_000;
  setTimeout(() => void vigiarPasta1(), Math.min(periodo, 8000));
  setInterval(() => void vigiarPasta1(), periodo);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});
app.on('window-all-closed', () => {
  if (saindo || !designerLigado) app.quit();
});
