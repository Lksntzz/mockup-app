import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createPreviewScheduler } from '../app/scheduler';
import { copyToAll, createState, select, setColor, type AppState } from '../app/state';
import { compose, isAvailable } from '../engine/compose';
import { exportAll } from '../export/exporter';
import type { Accessory, Pack, Raster } from '../engine/types';
import { cropMargins } from '../pdf/crop';
import { coverCrop } from '../pdf/fit';
import { capaPageNumbers } from '../pdf/pages';
import { openPdf, PdfError } from '../pdf/reader';
import type { MockupApi } from './global';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.mjs', document.baseURI).href;

const api: MockupApi = (window as unknown as { mockupApi: MockupApi }).mockupApi;
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const NOMES: Record<Accessory, string> = { wireo: 'Wire-o', elastico: 'Elástico', tassel: 'Tassel' };
const ACESSORIOS: Accessory[] = ['wireo', 'elastico', 'tassel'];
/** Página cuja proporção difere mais que isso da capa do pacote ganha o aviso amarelo. */
const TOLERANCIA_DE_PROPORCAO = 0.1;

interface InfoDaCapa {
  pagina: number;
  semVerso: boolean;
  avisoProporcao: boolean;
}

let pacote: { pack: Pack; layers: Map<string, Raster> } | null = null;
let estado: AppState | null = null;
let info: InfoDaCapa[] = [];
let contadorDePrevias = 0;
let nomeDoPdf = '';

const proximoQuadro = () => new Promise<void>((r) => setTimeout(r, 0));

function pintar(canvas: HTMLCanvasElement, r: Raster): void {
  canvas.width = r.width;
  canvas.height = r.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
}

function mensagem(texto: string, erro = false): void {
  const el = $('mensagem');
  el.textContent = texto;
  el.classList.toggle('erro', erro);
}

function progresso(valor: number | null): void {
  const el = $<HTMLProgressElement>('progresso');
  el.hidden = valor === null;
  if (valor !== null) el.value = valor;
}

function definirEstado(e: 'carregando-pacote' | 'vazio' | 'carregando' | 'pronto'): void {
  document.body.dataset.estado = e;
  $('vazio').hidden = e === 'pronto';
  $('previa').hidden = e !== 'pronto';
  $('painel').hidden = e !== 'pronto';
  $<HTMLButtonElement>('abrir').disabled = e === 'carregando-pacote' || e === 'carregando';
}

function textoDoErro(e: unknown): string {
  if (e instanceof PdfError) {
    if (e.code === 'not-pdf') return 'Esse arquivo não é um PDF.';
    if (e.code === 'password') return 'Esse PDF tem senha. Tire a senha e tente de novo.';
    return 'Não consegui ler esse PDF: ele parece corrompido ou incompleto.';
  }
  return `Não consegui abrir o PDF: ${e instanceof Error ? e.message : String(e)}`;
}

const agendador = createPreviewScheduler(
  async (req) => {
    await proximoQuadro();
    const capa = estado?.capas[req.capa];
    if (!pacote || !capa) throw new Error('capa não encontrada');
    return compose(pacote.pack, pacote.layers, capa.art, req.choices);
  },
  (capa, resultado) => {
    if (!estado || capa !== estado.selecionada) return;
    pintar($<HTMLCanvasElement>('previa'), resultado);
    document.body.dataset.previa = String(++contadorDePrevias);
  },
  (e) => mensagem(`Erro ao montar a prévia: ${e instanceof Error ? e.message : String(e)}`, true),
);

function pedirPrevia(): void {
  if (!estado) return;
  const capa = estado.capas[estado.selecionada];
  if (capa) agendador.request({ capa: estado.selecionada, choices: { ...capa.choices } });
}

function desenharLista(): void {
  const lista = $('lista');
  lista.replaceChildren();
  if (!estado) return;
  estado.capas.forEach((capa, i) => {
    const dados = info[i]!;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'item';
    item.setAttribute('aria-current', String(i === estado!.selecionada));
    const miniatura = document.createElement('canvas');
    pintar(miniatura, capa.art);
    const rotulo = document.createElement('div');
    rotulo.className = 'rotulo';
    rotulo.innerHTML = `<strong>Capa ${i + 1}</strong><span>pág. ${dados.pagina}</span>`;
    item.append(miniatura, rotulo);
    for (const [ativo, texto] of [
      [dados.semVerso, 'sem verso'],
      [dados.avisoProporcao, 'proporção diferente do normal'],
    ] as const) {
      if (!ativo) continue;
      const aviso = document.createElement('div');
      aviso.className = 'aviso';
      aviso.textContent = texto;
      item.append(aviso);
    }
    item.addEventListener('click', () => {
      if (!estado) return;
      estado = select(estado, i);
      desenharLista();
      desenharPainel();
      pedirPrevia();
    });
    lista.append(item);
  });
}

function desenharPainel(): void {
  if (!estado || !pacote) return;
  const capa = estado.capas[estado.selecionada]!;
  $('titulo-capa').textContent = `Capa ${estado.selecionada + 1}`;
  const grupos = $('grupos');
  grupos.replaceChildren();
  for (const acc of ACESSORIOS) {
    const bloco = document.createElement('div');
    bloco.className = 'grupo';
    const titulo = document.createElement('h3');
    titulo.textContent = NOMES[acc];
    const bolinhas = document.createElement('div');
    bolinhas.className = 'bolinhas';
    for (const opcao of pacote.pack.options[acc]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bolinha';
      b.style.background = opcao.swatch;
      b.title = opcao.label;
      b.setAttribute('aria-label', `${NOMES[acc]} ${opcao.label}`);
      b.setAttribute('aria-pressed', String(capa.choices[acc] === opcao.id));
      b.dataset.acc = acc;
      b.dataset.id = opcao.id;
      b.disabled = !isAvailable(pacote.pack, { ...capa.choices, [acc]: opcao.id });
      b.addEventListener('click', () => {
        if (!estado) return;
        estado = setColor(estado, estado.selecionada, acc, opcao.id);
        if (estado.lastError) mensagem(estado.lastError, true);
        else mensagem('');
        desenharPainel();
        pedirPrevia();
      });
      bolinhas.append(b);
    }
    const escolhida = document.createElement('div');
    escolhida.className = 'escolhida';
    escolhida.textContent = pacote.pack.options[acc].find((o) => o.id === capa.choices[acc])?.label ?? '';
    bloco.append(titulo, bolinhas, escolhida);
    grupos.append(bloco);
  }
}

async function abrirPdfDeBytes(nome: string, bytes: Uint8Array): Promise<void> {
  if (!pacote) return;
  const antes = estado ? 'pronto' : 'vazio';
  definirEstado('carregando');
  mensagem('Lendo o PDF…');
  progresso(0);
  try {
    const razaoDaCapa = pacote.pack.artSize.width / pacote.pack.artSize.height;
    const doc = await openPdf(bytes);
    const paginas = capaPageNumbers(doc.pageCount);
    if (paginas.length === 0) throw new PdfError('corrupt', 'O PDF não tem páginas.');
    const artes: Raster[] = [];
    const novaInfo: InfoDaCapa[] = [];
    for (const [i, n] of paginas.entries()) {
      mensagem(`Lendo a capa ${i + 1} de ${paginas.length}…`);
      progresso(i / paginas.length);
      await proximoQuadro();
      const recortada = cropMargins(await doc.renderPage(n, 1200));
      const proporcao = recortada.width / recortada.height;
      novaInfo.push({
        pagina: n,
        semVerso: n + 1 > doc.pageCount,
        avisoProporcao: Math.abs(proporcao / razaoDaCapa - 1) > TOLERANCIA_DE_PROPORCAO,
      });
      artes.push(coverCrop(recortada, razaoDaCapa));
    }
    await doc.close();
    estado = createState(pacote.pack, artes);
    info = novaInfo;
    nomeDoPdf = nome;
    $('nome-pdf').textContent = nome;
    progresso(null);
    mensagem(artes.length === 1 ? '1 capa carregada.' : `${artes.length} capas carregadas.`);
    definirEstado('pronto');
    desenharLista();
    desenharPainel();
    pedirPrevia();
  } catch (e) {
    progresso(null);
    mensagem(textoDoErro(e), true);
    definirEstado(antes);
  }
}

async function iniciar(): Promise<void> {
  try {
    const { json, camadas } = await api.carregarPacote();
    const layers = new Map<string, Raster>();
    for (const [arquivo, c] of Object.entries(camadas)) {
      layers.set(arquivo, { width: c.width, height: c.height, data: new Uint8ClampedArray(c.data.buffer, c.data.byteOffset, c.data.length) });
    }
    pacote = { pack: JSON.parse(json) as Pack, layers };
    definirEstado('vazio');
  } catch (e) {
    mensagem(`Não consegui carregar o pacote do mockup: ${e instanceof Error ? e.message : String(e)}`, true);
  }
}

$('abrir').addEventListener('click', async () => {
  const arquivo = await api.escolherPdf();
  if (arquivo) await abrirPdfDeBytes(arquivo.nome, arquivo.bytes);
});
$('copiar').addEventListener('click', () => {
  if (!estado) return;
  estado = copyToAll(estado, estado.selecionada);
  mensagem('Cores copiadas para todas as capas.');
  desenharLista();
});

async function codificarPng(r: Raster): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  pintar(canvas, r);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('não consegui gerar o PNG');
  return new Uint8Array(await blob.arrayBuffer());
}

$('exportar').addEventListener('click', async () => {
  if (!estado || !pacote) return;
  const botao = $<HTMLButtonElement>('exportar');
  try {
    const pasta = await api.escolherPasta();
    if (!pasta) return;
    botao.disabled = true;
    mensagem('Exportando…');
    progresso(0);
    const r = await exportAll({
      pdfName: nomeDoPdf,
      pasta,
      pack: pacote.pack,
      layers: pacote.layers,
      capas: estado.capas,
      encodePng: codificarPng,
      write: (c, b) => api.gravarArquivo(c, b),
      rename: (de, para) => api.renomearArquivo(de, para),
      remove: (c) => api.removerArquivo(c),
      exists: (c) => api.existe(c),
      confirmOverwrite: (a) => api.confirmarSobrescrever(a),
      onProgress: (feito, total) => {
        progresso(feito / total);
        mensagem(`Exportando ${feito} de ${total}…`);
      },
    });
    progresso(null);
    mensagem(r.written.length === 0 ? 'Exportação cancelada. Nada foi gravado.' : `${r.written.length} ${r.written.length === 1 ? 'mockup exportado' : 'mockups exportados'} em ${pasta}.`);
  } catch (e) {
    progresso(null);
    mensagem(`A exportação falhou. ${e instanceof Error ? e.message : String(e)}`, true);
  } finally {
    botao.disabled = false;
  }
});

for (const tipo of ['dragenter', 'dragover']) {
  document.addEventListener(tipo, (e) => {
    e.preventDefault();
    document.body.classList.add('arrastando');
  });
}
for (const tipo of ['dragleave', 'drop']) {
  document.addEventListener(tipo, () => document.body.classList.remove('arrastando'));
}
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  const arquivo = e.dataTransfer?.files[0];
  if (arquivo) await abrirPdfDeBytes(arquivo.name, new Uint8Array(await arquivo.arrayBuffer()));
});

void iniciar();
