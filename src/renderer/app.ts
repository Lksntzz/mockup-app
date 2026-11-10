import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createPreviewScheduler } from '../app/scheduler';
import { copyToAll, createState, select, setColor, type AppState } from '../app/state';
import { compose, isAvailable } from '../engine/compose';
import { exportAll } from '../export/exporter';
import type { Accessory, Pack, Raster } from '../engine/types';
import { cropMargins, cropToBox, widthForArt } from '../pdf/crop';
import { coverCrop } from '../pdf/fit';
import { capaPageNumbers } from '../pdf/pages';
import { openPdf, PdfError } from '../pdf/reader';
import type { ArquivoPdf, EstadoAtualizacao, MockupApi } from './global';
import { criarTrabalhos } from '../app/trabalhos';

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
let caminhoDoPdf = '';
const trabalhos = criarTrabalhos<AppState, InfoDaCapa[]>();

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
  $('voltar').hidden = e !== 'pronto';
  $('zona').toggleAttribute('aria-disabled', e !== 'vazio');
}

function textoDoErro(e: unknown): string {
  if (e instanceof PdfError) {
    if (e.code === 'not-pdf') return 'Esse arquivo não é um PDF.';
    if (e.code === 'password') return 'Esse PDF tem senha. Tire a senha e tente de novo.';
    return 'Não consegui ler esse PDF: ele parece corrompido ou incompleto.';
  }
  const msg = (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  if (msg === 'Esse arquivo não é um PDF.') return msg;
  return `Não consegui abrir o PDF: ${msg}`;
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
      b.className = opcao.id === 'nenhum' ? 'bolinha nenhum' : 'bolinha';
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

async function abrirPdf(arquivo: ArquivoPdf): Promise<void> {
  if (!pacote) return;
  const { nome, bytes, caminho } = arquivo;
  const salvo = trabalhos.buscar(caminho);
  if (salvo) {
    retomar(salvo.caminho);
    mensagem('Retomando de onde você parou.');
    return;
  }
  const antes = 'vazio';
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
      // a arte é a imagem de cima da página (em PDFs com fundo esticado + arte menor, é só a menor)
      const caixa = await doc.artBox(n);
      const pagina = await doc.renderPage(n, widthForArt(1200, caixa));
      const recortada = cropMargins(caixa ? cropToBox(pagina, caixa) : pagina);
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
    caminhoDoPdf = caminho;
    trabalhos.guardar({ caminho, nome, estado, info });
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

let timerDoSalvo: ReturnType<typeof setTimeout> | undefined;
/** Card de confirmação: diz que salvou e quantos, sem mostrar caminho de pasta. */
function mostrarSalvo(quantos: number): void {
  $('salvo-detalhe').textContent = quantos === 1 ? '1 mockup' : `${quantos} mockups`;
  $('salvo').hidden = false;
  clearTimeout(timerDoSalvo);
  timerDoSalvo = setTimeout(() => ($('salvo').hidden = true), 5000);
}
$('salvo-ok').addEventListener('click', () => {
  clearTimeout(timerDoSalvo);
  $('salvo').hidden = true;
});

function guardarAtual(): void {
  if (estado && caminhoDoPdf) trabalhos.guardar({ caminho: caminhoDoPdf, nome: nomeDoPdf, estado, info });
}

function desenharEmAndamento(): void {
  const lista = trabalhos.todos();
  $('em-andamento').hidden = lista.length === 0;
  const alvo = $('trabalhos');
  alvo.replaceChildren();
  for (const t of lista) {
    const linha = document.createElement('div');
    linha.className = 'trabalho';
    const nome = document.createElement('span');
    nome.className = 'nome';
    nome.textContent = t.nome;
    const qtd = document.createElement('span');
    qtd.className = 'qtd';
    qtd.textContent = t.estado.capas.length === 1 ? '1 capa' : `${t.estado.capas.length} capas`;
    const continuar = document.createElement('button');
    continuar.type = 'button';
    continuar.className = 'primario continuar';
    continuar.textContent = 'Continuar';
    continuar.addEventListener('click', () => retomar(t.caminho));
    const descartar = document.createElement('button');
    descartar.type = 'button';
    descartar.className = 'discreto descartar';
    descartar.textContent = 'Descartar';
    descartar.addEventListener('click', () => {
      if (!window.confirm(`Descartar "${t.nome}"? As cores escolhidas serão perdidas.`)) return;
      trabalhos.remover(t.caminho);
      desenharEmAndamento();
    });
    linha.append(nome, qtd, continuar, descartar);
    alvo.append(linha);
  }
}

function irParaInicio(): void {
  estado = null;
  info = [];
  nomeDoPdf = '';
  caminhoDoPdf = '';
  $('nome-pdf').textContent = '';
  definirEstado('vazio');
  desenharEmAndamento();
}

function retomar(caminho: string): void {
  const t = trabalhos.buscar(caminho);
  if (!t) return;
  estado = t.estado;
  info = t.info;
  nomeDoPdf = t.nome;
  caminhoDoPdf = t.caminho;
  $('nome-pdf').textContent = t.nome;
  mensagem('');
  definirEstado('pronto');
  desenharLista();
  desenharPainel();
  pedirPrevia();
}

async function iniciar(): Promise<void> {
  try {
    const { json, camadas } = await api.carregarPacote();
    const layers = new Map<string, Raster>();
    for (const [arquivo, c] of Object.entries(camadas)) {
      layers.set(arquivo, { width: c.width, height: c.height, data: new Uint8ClampedArray(c.data.buffer, c.data.byteOffset, c.data.length) });
    }
    pacote = { pack: JSON.parse(json) as Pack, layers };
    irParaInicio();
  } catch (e) {
    mensagem(`Não consegui carregar o pacote do mockup: ${e instanceof Error ? e.message : String(e)}`, true);
  }
}

async function escolherEAbrir(): Promise<void> {
  if (document.body.dataset.estado !== 'vazio') return;
  try {
    const arquivo = await api.escolherPdf();
    if (arquivo) await abrirPdf(arquivo);
  } catch (e) {
    mensagem(textoDoErro(e), true);
  }
}
$('zona').addEventListener('click', () => void escolherEAbrir());
$('zona').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    void escolherEAbrir();
  }
});
$('voltar').addEventListener('click', () => {
  guardarAtual();
  mensagem('');
  irParaInicio();
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
    const pasta = await api.prepararMkp(caminhoDoPdf);
    botao.disabled = true;
    mensagem('Salvando…');
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
        mensagem(`Salvando ${feito} de ${total}…`);
      },
    });
    progresso(null);
    if (r.written.length === 0) {
      mensagem('Nada foi gravado. Você continua trabalhando nesta arte.');
    } else {
      trabalhos.remover(caminhoDoPdf);
      irParaInicio();
      mensagem('');
      mostrarSalvo(r.written.length);
    }
  } catch (e) {
    progresso(null);
    mensagem(`Não consegui salvar os mockups. ${e instanceof Error ? e.message : String(e)}`, true);
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
  if (!arquivo) return;
  if (document.body.dataset.estado !== 'vazio') {
    mensagem('Volte ao início para abrir outro PDF.', true);
    return;
  }
  try {
    await abrirPdf(await api.lerPdf(api.caminhoDoArquivo(arquivo)));
  } catch (err) {
    mensagem(textoDoErro(err), true);
  }
});

function mostrarAtualizacao(e: EstadoAtualizacao): void {
  const faixa = $('atualizacao');
  const texto = $('texto-atualizacao');
  const reiniciar = $('reiniciar');
  const verificar = $<HTMLButtonElement>('verificar');
  faixa.classList.remove('erro');
  reiniciar.hidden = true;
  verificar.disabled = e.tipo === 'verificando' || e.tipo === 'baixando';
  switch (e.tipo) {
    case 'ocioso':
      faixa.hidden = true;
      break;
    case 'verificando':
      faixa.hidden = !e.manual;
      texto.textContent = 'Procurando atualizações…';
      break;
    case 'baixando':
      faixa.hidden = false;
      texto.textContent = `Baixando a versão ${e.versao}… ${Math.round(e.percent)}%`;
      break;
    case 'pronta':
      faixa.hidden = false;
      texto.textContent = `A versão ${e.versao} está pronta.`;
      reiniciar.hidden = false;
      break;
    case 'atualizado':
      faixa.hidden = !e.manual;
      texto.textContent = 'Você já está com a versão mais recente.';
      break;
    case 'erro':
      faixa.hidden = !e.manual; // erro automático (ex.: sem internet) fica em silêncio
      faixa.classList.add('erro');
      texto.textContent = e.mensagem;
      break;
  }
}

async function iniciarAtualizacoes(): Promise<void> {
  $('versao').textContent = `v${await api.versao()}`;
  api.aoMudarAtualizacao(mostrarAtualizacao);
  $('verificar').addEventListener('click', () => void api.verificarAtualizacao());
  $('reiniciar').addEventListener('click', () => void api.instalarAtualizacao());
  mostrarAtualizacao(await api.estadoAtualizacao());
}

void iniciarAtualizacoes();
void iniciar();
