import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createPreviewScheduler } from '../app/scheduler';
import { copyToAll, createState, select, setColor, type AppState, type CapaState } from '../app/state';
import { abasVisiveis, ROTULOS, vizinha, type Modo } from '../app/abas';
import { escolhasDoVerso, paraRazao } from '../app/verso';
import { compose, isAvailable } from '../engine/compose';
import { exportAll, type ExportCapa, type ExportExtra } from '../export/exporter';
import type { Accessory, Pack, Raster } from '../engine/types';
import { cropMargins, cropToBox, widthForArt } from '../pdf/crop';
import { coverCrop, reduzir } from '../pdf/fit';
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
let modoPrevia: Modo = 'frente';
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
  $('abas').hidden = e !== 'pronto';
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

// Pacotes grandes (especificação, verso) só são lidos quando alguém usa.
const pacotesCarregados = new Map<string, { pack: Pack; layers: Map<string, Raster> }>();
async function carregarPacoteNomeado(nome: 'especificacao' | 'verso'): Promise<{ pack: Pack; layers: Map<string, Raster> }> {
  const guardado = pacotesCarregados.get(nome);
  if (guardado) return guardado;
  const { json, camadas } = await api.carregarPacote(nome);
  const layers = new Map<string, Raster>();
  for (const [arquivo, c] of Object.entries(camadas)) {
    layers.set(arquivo, { width: c.width, height: c.height, data: new Uint8ClampedArray(c.data.buffer, c.data.byteOffset, c.data.length) });
  }
  const carregado = { pack: JSON.parse(json) as Pack, layers };
  pacotesCarregados.set(nome, carregado);
  return carregado;
}

const razaoDaFaixa = (p: Pack): number => (p.backArt ? p.backArt.size.width / p.backArt.size.height : p.artSize.width / p.artSize.height);
/** A página par é guardada na proporção da capa; a contra capa da frente pede a proporção dela. */
const versoDaFrente = (back: Raster | undefined): Raster | undefined =>
  back && pacote ? paraRazao(back, razaoDaFaixa(pacote.pack)) : back;

function abasAgora(): Modo[] {
  const capa = estado?.capas[estado.selecionada];
  return abasVisiveis({
    temVerso: !!capa?.back,
    vt: $<HTMLInputElement>('saida-vt').checked,
    semCanguru: $<HTMLInputElement>('saida-sem-canguru').checked,
  });
}

function atualizarAbas(): void {
  const abas = abasAgora();
  if (!abas.includes(modoPrevia)) modoPrevia = 'frente';
  const lista = $('abas-lista');
  lista.replaceChildren();
  for (const modo of abas) {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = `aba-${modo}`;
    b.textContent = ROTULOS[modo];
    b.setAttribute('aria-pressed', String(modo === modoPrevia));
    b.addEventListener('click', () => {
      modoPrevia = modo;
      pedirPrevia();
    });
    lista.append(b);
  }
  $<HTMLButtonElement>('aba-anterior').disabled = abas.length < 2;
  $<HTMLButtonElement>('aba-proxima').disabled = abas.length < 2;
  const algumVerso = !!estado?.capas.some((c) => c.back);
  const caixaVerso = $<HTMLInputElement>('saida-verso');
  caixaVerso.disabled = !algumVerso;
  if (!algumVerso) caixaVerso.checked = false;
  caixaVerso.title = algumVerso ? '' : 'Este PDF não tem páginas pares.';
}
for (const [id, passo] of [['aba-anterior', -1], ['aba-proxima', 1]] as const) {
  $(id).addEventListener('click', () => {
    modoPrevia = vizinha(abasAgora(), modoPrevia, passo);
    pedirPrevia();
  });
}

const agendador = createPreviewScheduler(
  async (req) => {
    await proximoQuadro();
    const capa = estado?.capas[req.capa];
    if (!pacote || !capa) throw new Error('capa não encontrada');
    if (req.modo === 'vt' || req.modo === 'sem-canguru') {
      const e = await carregarPacoteNomeado('especificacao');
      return compose(e.pack, e.layers, capa.art, req.choices, versoDaFrente(capa.back), req.modo);
    }
    if (req.modo === 'verso' && capa.back) {
      const v = await carregarPacoteNomeado('verso');
      return compose(v.pack, v.layers, capa.back, escolhasDoVerso(v.pack, req.choices), paraRazao(capa.art, razaoDaFaixa(v.pack)));
    }
    return compose(pacote.pack, pacote.layers, capa.art, req.choices, versoDaFrente(capa.back));
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
  if (!capa) return;
  atualizarAbas();
  agendador.request({ capa: estado.selecionada, choices: { ...capa.choices }, modo: modoPrevia });
}

// A lista só precisa de miniaturas: guardar a capa inteira em cada uma gasta memória à toa.
const miniaturas = new WeakMap<Raster, Raster>();
function miniaturaDe(art: Raster): Raster {
  let m = miniaturas.get(art);
  if (!m) miniaturas.set(art, (m = reduzir(art, 240)));
  return m;
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
    pintar(miniatura, miniaturaDe(capa.art));
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
      if (b.disabled) b.title = `${opcao.label}: não combina com as outras escolhas desta capa`;
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

type PdfAberto = Awaited<ReturnType<typeof openPdf>>;

/** Renderiza a página e fica só com a arte (sem margens nem o fundo esticado de alguns PDFs). */
async function lerArteDaPagina(doc: PdfAberto, n: number): Promise<Raster> {
  const caixa = await doc.artBox(n);
  const pagina = await doc.renderPage(n, widthForArt(1200, caixa));
  return cropMargins(caixa ? cropToBox(pagina, caixa) : pagina);
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
    const versos: (Raster | null)[] = [];
    const temContraCapa = !!pacote.pack.backArt;
    const novaInfo: InfoDaCapa[] = [];
    for (const [i, n] of paginas.entries()) {
      mensagem(`Lendo a capa ${i + 1} de ${paginas.length}…`);
      progresso(i / paginas.length);
      await proximoQuadro();
      // a arte é a imagem de cima da página (em PDFs com fundo esticado + arte menor, é só a menor)
      const recortada = await lerArteDaPagina(doc, n);
      const proporcao = recortada.width / recortada.height;
      novaInfo.push({
        pagina: n,
        semVerso: n + 1 > doc.pageCount,
        avisoProporcao: Math.abs(proporcao / razaoDaCapa - 1) > TOLERANCIA_DE_PROPORCAO,
      });
      artes.push(coverCrop(recortada, razaoDaCapa));
      // a página par seguinte é o verso: vai para a contra capa
      // (guardada na proporção da capa: serve de face grande no mockup do verso e é recortada para a contra capa na frente)
      if (temContraCapa && n + 1 <= doc.pageCount) {
        versos.push(coverCrop(await lerArteDaPagina(doc, n + 1), razaoDaCapa));
      } else {
        versos.push(null);
      }
    }
    await doc.close();
    estado = createState(pacote.pack, artes, versos);
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

/** Card de confirmação: diz que salvou e quantos, sem mostrar caminho de pasta, e deixa escolher entre continuar ou terminar. */
function mostrarSalvo(quantos: number): void {
  $('salvo-detalhe').textContent = quantos === 1 ? '1 mockup' : `${quantos} mockups`;
  $('salvo').hidden = false;
  $('cortina').hidden = false;
  $('salvo-continuar').focus();
}
function fecharSalvo(): void {
  $('salvo').hidden = true;
  $('cortina').hidden = true;
}
// Continuar: fica na mesma arte, com as cores como estão (dá para salvar de novo, por exemplo outras imagens).
$('salvo-continuar').addEventListener('click', () => {
  fecharSalvo();
  mensagem('Você continua trabalhando nesta arte.');
});
// Terminar: o trabalho sai de "Em andamento" e volta para o início.
$('salvo-ok').addEventListener('click', () => {
  fecharSalvo();
  trabalhos.remover(caminhoDoPdf);
  irParaInicio();
  mensagem('');
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

const caixa = (id: string) => $<HTMLInputElement>(id);
// Sempre fica ao menos uma imagem marcada: desmarcar a última não faz nada.
const IDS_SAIDAS = ['saida-frente', 'saida-vt', 'saida-sem-canguru', 'saida-verso'];
const nenhumaMarcada = () => IDS_SAIDAS.every((id) => !caixa(id).checked);
for (const id of IDS_SAIDAS) {
  caixa(id).addEventListener('change', () => {
    if (nenhumaMarcada()) {
      caixa(id).checked = true;
      mensagem('Deixe ao menos uma imagem marcada.', true);
    } else {
      mensagem('');
      // marcou uma especificação: já mostra ela na prévia; desmarcou a que estava aparecendo: volta para a frente
      if (id === 'saida-vt' || id === 'saida-sem-canguru') {
        const modo: Modo = id === 'saida-vt' ? 'vt' : 'sem-canguru';
        if (caixa(id).checked) modoPrevia = modo;
        else if (modoPrevia === modo) modoPrevia = 'frente';
        pedirPrevia();
      }
    }
  });
}

$('exportar').addEventListener('click', async () => {
  if (!estado || !pacote) return;
  const botao = $<HTMLButtonElement>('exportar');
  try {
    const pasta = await api.prepararMkp(caminhoDoPdf);
    const variantes = [
      { marcada: caixa('saida-vt').checked, suffix: 'especificacao-vt', variant: 'vt' },
      { marcada: caixa('saida-sem-canguru').checked, suffix: 'especificacao-sem-canguru', variant: 'sem-canguru' },
    ].filter((v) => v.marcada);
    const querVerso = caixa('saida-verso').checked;
    const extras: ExportExtra[] = [];
    if (variantes.length > 0 || querVerso) {
      botao.disabled = true;
      mensagem('Preparando as imagens extras…');
    }
    if (variantes.length > 0) {
      const espec = await carregarPacoteNomeado('especificacao');
      for (const v of variantes) extras.push({ suffix: v.suffix, variant: v.variant, pack: espec.pack, layers: espec.layers });
    }
    // a contra capa da frente e da especificação usa a proporção dela; o verso usa a página par inteira como face grande
    const originais = new Map<ExportCapa, CapaState>();
    const capasParaFrente = estado.capas.map((c) => {
      const pronta: ExportCapa = { art: c.art, ...(c.back ? { back: versoDaFrente(c.back) as Raster } : {}), choices: c.choices };
      originais.set(pronta, c);
      return pronta;
    });
    if (querVerso) {
      const v = await carregarPacoteNomeado('verso');
      extras.push({
        suffix: 'verso',
        pack: v.pack,
        layers: v.layers,
        montar: (pronta) => {
          const c = originais.get(pronta);
          if (!c?.back) return null;
          return { art: c.back, back: paraRazao(c.art, razaoDaFaixa(v.pack)), choices: escolhasDoVerso(v.pack, c.choices) };
        },
      });
    }
    botao.disabled = true;
    mensagem('Salvando…');
    progresso(0);
    const r = await exportAll({
      pdfName: nomeDoPdf,
      pasta,
      pack: pacote.pack,
      layers: pacote.layers,
      capas: capasParaFrente,
      extras,
      semFrente: !caixa('saida-frente').checked,
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
      guardarAtual();
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
