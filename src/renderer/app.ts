import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createPreviewScheduler } from '../app/scheduler';
import { aplicarAjustes, ajustesDoEstado, aplicarEscolhas, contarIgnoradas, descreverSaidas, formatarData, situacaoDoTrabalho, type EntradaHistorico, type Saidas } from '../app/historico';
import { copyToAll, createState, select, setAjuste, setColor, type AppState, type CapaState } from '../app/state';
import { abasVisiveis, ROTULOS, vizinha, type Modo } from '../app/abas';
import { escolhasDoVerso, paraRazao } from '../app/verso';
import { fontesDaArte, frenteEVersoPadrao, rotuloDaFonte, type Fonte } from '../app/frente-verso';
import { compose, isAvailable } from '../engine/compose';
import { pacoteDeRascunho } from '../engine/rascunho';
import { arrastarCanto, arrastarCorpo, cantoPerto, cantosDoAjuste, criarMapa, pontoDentro, zoomDaRoda } from '../app/guia';
import { AJUSTE_NULO, ajusteValido } from '../engine/ajuste';
import { exportAll, type ExportCapa, type ExportExtra } from '../export/exporter';
import type { Accessory, Choices, Pack, Raster } from '../engine/types';
import { cropMargins, cropToBox, widthForArt } from '../pdf/crop';
import { caixaDoMolde, ehArteDoMoldeDoCorel, ehPaginaA4 } from '../pdf/molde';
import { coverCrop, reduzir } from '../pdf/fit';
import { capaPageNumbers } from '../pdf/pages';
import { openPdf, PdfError } from '../pdf/reader';
import { iniciarAnuncios, mostrarAnuncios } from './anuncios';
import type { ArquivoPdf, EstadoAtualizacao, MockupApi } from './global';
import { criarTrabalhos } from '../app/trabalhos';
import type { Rascunho } from '../app/rascunhos';
import { avaliarQualidade, AREA_PADRAO_MM, LIMITES_PADRAO, pedidoDeNovaArte, pixelsNativosDaArte } from '../app/qualidade';
import type { ConfigDesigner } from '../main/config-designer';
import type { Cliente } from '../main/clientes';
import type { FaceDoMolde, ResultadoDoMolde } from '../main/corel';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.mjs', document.baseURI).href;

const api: MockupApi = (window as unknown as { mockupApi: MockupApi }).mockupApi;
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const NOMES: Record<Accessory, string> = { wireo: 'Wire-o', elastico: 'Elástico', tassel: 'Tassel' };
const ACESSORIOS: Accessory[] = ['wireo', 'elastico', 'tassel'];
/** Página cuja proporção difere mais que isso da capa do pacote ganha o aviso amarelo. */
const TOLERANCIA_DE_PROPORCAO = 0.1;

interface InfoDaCapa {
  pagina: number;
  /** Tamanho real da arte em pixels: da imagem (PNG/JPG) ou, em PDF, estimado pela imagem da página. */
  pixels?: { largura: number; altura: number };
  /** Em PDF: a medida é uma estimativa (a imagem da página, já recortada na arte). */
  pixelsEstimados?: boolean;
  /** Por que não há medida: PDF do Corel (arte já em outro formato) ou PDF sem imagem grande (vetorial). */
  semMedida?: 'corel' | 'sem-imagem';
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

// Prévias de rascunho (metade do tamanho) são esticadas para o tamanho cheio dentro do próprio canvas: o cartão mantém as mesmas
// proporções e o mesmo tamanho na tela (mexer na largura por CSS achatava a imagem quando a janela é baixa).
const rascunhos = new WeakSet<Raster>();

/** `escala` > 1 estica a imagem (rascunho = 2); o canvas fica sempre com o tamanho da prévia completa. */
function pintar(canvas: HTMLCanvasElement, r: Raster, escala = 1): void {
  const imagem = new ImageData(new Uint8ClampedArray(r.data), r.width, r.height);
  if (escala === 1) {
    canvas.width = r.width;
    canvas.height = r.height;
    canvas.getContext('2d')!.putImageData(imagem, 0, 0);
    return;
  }
  const pequeno = document.createElement('canvas');
  pequeno.width = r.width;
  pequeno.height = r.height;
  pequeno.getContext('2d')!.putImageData(imagem, 0, 0);
  canvas.width = Math.round(r.width * escala);
  canvas.height = Math.round(r.height * escala);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(pequeno, 0, 0, canvas.width, canvas.height);
}

function mensagem(texto: string, erro = false): void {
  const el = $('mensagem');
  el.textContent = texto;
  el.classList.toggle('erro', erro);
}

/** Nome do PDF aberto e quantas capas ele tem, na faixa do arquivo. */
function mostrarNomeDoPdf(nome: string, capas: number): void {
  $('nome-pdf').textContent = nome;
  $('capas-pdf').textContent = nome && capas > 0 ? `· ${capas === 1 ? '1 capa' : `${capas} capas`}` : '';
}

function progresso(valor: number | null): void {
  const el = $<HTMLProgressElement>('progresso');
  el.hidden = valor === null;
  if (valor !== null) el.value = valor;
  // avisa o app principal: com barra de progresso na tela, a atualização automática espera
  void window.mockupApi.ocupado(valor !== null);
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

// ---- Arrastar a arte direto na prévia (mover pelo corpo, redimensionar pelos cantos, roda do mouse para o tamanho) ----
let ultimaPrevia: Raster | null = null;
let mouseNaPrevia = false;
let arrasto: { tipo: 'corpo' | 'canto'; de: [number, number]; inicial: import('../engine/ajuste').Ajuste } | null = null;
let mapaDaArte: { pack: Pack; mapa: ReturnType<typeof criarMapa> } | null = null;
let temporizadorDoPainel = 0;

/** O pacote da prévia que a guia está editando: o da frente ou o do verso (já carregado), conforme a aba. */
function pacoteDaGuia(): { pack: Pack; layers: Map<string, Raster> } | null {
  if (modoPrevia === 'frente') return pacote;
  if (modoPrevia === 'verso' && estado?.capas[estado.selecionada]?.back) return pacotesCarregados.get('verso') ?? null;
  return null;
}
function guiaAtiva(): boolean {
  return !!estado && !!pacoteDaGuia();
}
function mapaAtual() {
  const p = pacoteDaGuia();
  if (!p) return null;
  if (mapaDaArte?.pack !== p.pack) mapaDaArte = { pack: p.pack, mapa: criarMapa(p.pack.artCorners) };
  return mapaDaArte.mapa;
}
/** Quanto a prévia mostrada é menor que o pacote (1 = tamanho cheio, 0,5 = rascunho). */
function escalaDaPrevia(): number {
  const canvas = $<HTMLCanvasElement>('previa');
  const p = pacoteDaGuia();
  return p && p.pack.canvas.width > 0 ? canvas.width / p.pack.canvas.width : 1;
}
function ajusteAtual() {
  const capa = estado?.capas[estado.selecionada];
  return ajusteValido((modoPrevia === 'verso' ? capa?.ajusteVerso : capa?.ajuste) ?? AJUSTE_NULO);
}
/** Ponto do mouse na folha da arte (0 a 1), ou null se a guia não está ativa. */
function pontoDaArte(ev: MouseEvent | PointerEvent): [number, number] | null {
  const canvas = $<HTMLCanvasElement>('previa');
  const mapa = mapaAtual();
  if (!guiaAtiva() || !mapa) return null;
  const r = canvas.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  // a prévia de rascunho tem metade do tamanho: o mapa é em coordenadas do pacote inteiro
  const e = escalaDaPrevia();
  return mapa.paraArte([(((ev.clientX - r.left) * canvas.width) / r.width) / e, (((ev.clientY - r.top) * canvas.height) / r.height) / e]);
}
function desenharGuia(): void {
  const canvas = $<HTMLCanvasElement>('previa');
  const mapa = mapaAtual();
  if (!guiaAtiva() || !mapa || !ultimaPrevia) return;
  pintar(canvas, ultimaPrevia, rascunhos.has(ultimaPrevia) ? 2 : 1);
  const ctx = canvas.getContext('2d')!;
  const r = canvas.getBoundingClientRect();
  const k = r.width > 0 ? canvas.width / r.width : 1;
  const e = escalaDaPrevia();
  const pts = cantosDoAjuste(ajusteAtual()).map((c) => mapa.paraTela(c)).map((p): [number, number] => [p[0] * e, p[1] * e]);
  ctx.save();
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  ctx.closePath();
  ctx.lineWidth = 3 * k;
  ctx.strokeStyle = 'rgba(0,0,0,.55)';
  ctx.setLineDash([]);
  ctx.stroke();
  ctx.lineWidth = 1.5 * k;
  ctx.strokeStyle = '#fff';
  ctx.setLineDash([8 * k, 6 * k]);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const p of pts) {
    const t = 7 * k;
    ctx.fillStyle = '#4f46e5';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2 * k;
    ctx.fillRect(p[0] - t, p[1] - t, t * 2, t * 2);
    ctx.strokeRect(p[0] - t, p[1] - t, t * 2, t * 2);
  }
  ctx.restore();
}
function aplicarAjusteDaGuia(novo: import('../engine/ajuste').Ajuste): void {
  if (!estado) return;
  estado = setAjuste(estado, estado.selecionada, novo, modoPrevia === 'verso' ? 'verso' : 'frente');
  pedirPrevia(true);
  desenharGuia();
  // parou de mexer: refaz em tamanho cheio e guarda o rascunho
  window.clearTimeout(temporizadorDoPainel);
  temporizadorDoPainel = window.setTimeout(() => {
    pedirPrevia();
    salvarRascunho();
  }, 220);
}
{
  const canvas = $<HTMLCanvasElement>('previa');
  canvas.title = 'Frente: arraste a arte para mover, arraste os cantos para mudar o tamanho, use a roda do mouse para aproximar ou afastar. Duplo clique volta ao original.';
  const raioDoCanto = 0.06;
  canvas.addEventListener('pointerenter', () => {
    mouseNaPrevia = true;
    // prepara a versão leve das camadas antes do primeiro arrasto, para ele não engasgar na largada
    const p = pacoteDaGuia();
    if (p) window.setTimeout(() => pacoteDeRascunho(p.pack, p.layers), 0);
    desenharGuia();
  });
  canvas.addEventListener('pointerleave', () => {
    mouseNaPrevia = false;
    if (!arrasto && ultimaPrevia && guiaAtiva()) pintar(canvas, ultimaPrevia, rascunhos.has(ultimaPrevia) ? 2 : 1);
  });
  canvas.addEventListener('pointerdown', (ev) => {
    const p = pontoDaArte(ev);
    if (!p || ev.button !== 0) return;
    const a = ajusteAtual();
    const canto = cantoPerto(a, p, raioDoCanto);
    if (canto >= 0) arrasto = { tipo: 'canto', de: p, inicial: a };
    else if (pontoDentro(a, p)) arrasto = { tipo: 'corpo', de: p, inicial: a };
    if (arrasto) {
      try {
        canvas.setPointerCapture(ev.pointerId);
      } catch {
        // sem captura o arrasto continua valendo enquanto o mouse estiver sobre a prévia
      }
      ev.preventDefault();
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    const p = pontoDaArte(ev);
    if (!p) {
      canvas.style.cursor = '';
      return;
    }
    if (arrasto) {
      aplicarAjusteDaGuia(arrasto.tipo === 'corpo' ? arrastarCorpo(arrasto.inicial, arrasto.de, p) : arrastarCanto(arrasto.inicial, arrasto.de, p));
      return;
    }
    const a = ajusteAtual();
    const canto = cantoPerto(a, p, raioDoCanto);
    canvas.style.cursor = canto >= 0 ? (canto % 2 === 0 ? 'nwse-resize' : 'nesw-resize') : pontoDentro(a, p) ? 'move' : '';
  });
  const soltar = (ev: PointerEvent) => {
    if (!arrasto) return;
    arrasto = null;
    try {
      if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
    } catch {
      // nada a soltar
    }
    window.clearTimeout(temporizadorDoPainel);
    pedirPrevia();
    salvarRascunho();
  };
  canvas.addEventListener('pointerup', soltar);
  canvas.addEventListener('pointercancel', soltar);
  // duplo clique na prévia: volta a arte para o tamanho e a posição originais
  canvas.addEventListener('dblclick', (ev) => {
    if (!guiaAtiva()) return;
    ev.preventDefault();
    aplicarAjusteDaGuia(AJUSTE_NULO);
  });
  canvas.addEventListener(
    'wheel',
    (ev) => {
      if (!guiaAtiva()) return;
      ev.preventDefault();
      aplicarAjusteDaGuia(zoomDaRoda(ajusteAtual(), ev.deltaY));
    },
    { passive: false },
  );
}

const agendador = createPreviewScheduler(
  async (req) => {
    await proximoQuadro();
    const capa = estado?.capas[req.capa];
    if (!pacote || !capa) throw new Error('capa não encontrada');
    if (req.modo === 'vt' || req.modo === 'sem-canguru') {
      const e = await carregarPacoteNomeado('especificacao');
      return compose(e.pack, e.layers, capa.art, req.choices, versoDaFrente(capa.back), req.modo, capa.ajuste);
    }
    if (req.modo === 'verso' && capa.back) {
      const v = await carregarPacoteNomeado('verso');
      const faixa = paraRazao(capa.art, razaoDaFaixa(v.pack));
      if (req.rascunho) {
        const r = pacoteDeRascunho(v.pack, v.layers);
        const leve = compose(r.pack, r.layers, capa.back, escolhasDoVerso(v.pack, req.choices), faixa, undefined, capa.ajusteVerso);
        rascunhos.add(leve);
        return leve;
      }
      return compose(v.pack, v.layers, capa.back, escolhasDoVerso(v.pack, req.choices), faixa, undefined, capa.ajusteVerso);
    }
    if (req.rascunho) {
      const r = pacoteDeRascunho(pacote.pack, pacote.layers);
      const leve = compose(r.pack, r.layers, capa.art, req.choices, versoDaFrente(capa.back), undefined, capa.ajuste);
      rascunhos.add(leve);
      return leve;
    }
    return compose(pacote.pack, pacote.layers, capa.art, req.choices, versoDaFrente(capa.back), undefined, capa.ajuste);
  },
  (capa, resultado) => {
    if (!estado || capa !== estado.selecionada) return;
    ultimaPrevia = resultado;
    pintar($<HTMLCanvasElement>('previa'), resultado, rascunhos.has(resultado) ? 2 : 1);
    if (mouseNaPrevia || arrasto) desenharGuia();
    document.body.dataset.previa = String(++contadorDePrevias);
  },
  (e) => mensagem(`Erro ao montar a prévia: ${e instanceof Error ? e.message : String(e)}`, true),
);

function pedirPrevia(rascunho = false): void {
  if (!estado) return;
  const capa = estado.capas[estado.selecionada];
  if (!capa) return;
  atualizarAbas();
  agendador.request({ capa: estado.selecionada, choices: { ...capa.choices }, modo: modoPrevia, ...(rascunho && (modoPrevia === 'frente' || modoPrevia === 'verso') ? { rascunho: true } : {}) });
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
      salvarRascunho();
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
  // copiar as cores para "todas as capas" só faz sentido quando há mais de uma
  $('copiar').hidden = estado.capas.length < 2;
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
        salvarRascunho();
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
  desenharQualidade();
}

type PdfAberto = Awaited<ReturnType<typeof openPdf>>;

// PDFs exportados do Corel (escolhidos no card do cliente): a arte é cortada na área do molde (150 × 210 mm no centro da A4).
const paginaInteiraEm = new Set<string>();
let paginaInteiraAtual = false;

/** Renderiza a página e fica só com a arte (sem margens nem o fundo esticado de alguns PDFs). */
async function lerArteDaPagina(
  doc: PdfAberto,
  n: number,
  larguraDaArte = 1200,
  medida?: { pixels?: { largura: number; altura: number }; semMedida?: 'corel' | 'sem-imagem' },
): Promise<Raster> {
  if (paginaInteiraAtual) {
    if (medida) medida.semMedida = 'corel';
    const molde = caixaDoMolde();
    const pagina = await doc.renderPage(n, widthForArt(1500, molde));
    if (ehPaginaA4(pagina.width, pagina.height)) return cropToBox(pagina, molde);
    // página que não é A4: o molde não está onde esperamos, então volta ao modo automático
  }
  const caixa = await doc.artBox(n);
  const pagina = await doc.renderPage(n, widthForArt(larguraDaArte, caixa));
  if (ehPaginaA4(pagina.width, pagina.height) && ehArteDoMoldeDoCorel(caixa)) {
    // PDF do molde do Corel aberto sem passar pelo botão "Abrir no molde": a capa é só o miolo de 150 × 210 mm
    // (a dobra e a sobra em volta ficam de fora, igual ao que se vê no Corel).
    if (medida) medida.semMedida = 'corel';
    const molde = caixaDoMolde();
    return cropToBox(await doc.renderPage(n, widthForArt(larguraDaArte, molde)), molde);
  }
  const arte = cropMargins(caixa ? cropToBox(pagina, caixa) : pagina);
  if (medida) {
    // quantos pixels de verdade a arte tem no arquivo (e não nos pixels desta renderização)
    const densidade = await doc.artDensidade(n);
    const nativos = densidade && pixelsNativosDaArte({ largura: arte.width, altura: arte.height }, { largura: pagina.width, altura: pagina.height }, densidade);
    if (nativos) medida.pixels = nativos;
    else medida.semMedida = 'sem-imagem';
  }
  return arte;
}

/** PNG (bytes) a partir dos pixels, para entregar ao Corel uma página de PDF já recortada na arte. */
async function rasterParaPng(r: Raster): Promise<Uint8Array> {
  const c = document.createElement('canvas');
  c.width = r.width;
  c.height = r.height;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('Não consegui preparar a imagem da página.');
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Deixa cada arte escolhida (frente, verso) num arquivo que o Corel consegue importar:
 * imagem vai como está; página de PDF vira PNG só da arte (sem margens). PDF de uma página só não tem verso (volta undefined).
 */
async function prepararFontesParaOMolde(fontes: (Fonte | undefined)[]): Promise<(string | undefined)[]> {
  const abertos = new Map<string, PdfAberto>();
  try {
    const saida: (string | undefined)[] = [];
    for (const f of fontes) {
      if (!f) {
        saida.push(undefined);
        continue;
      }
      if (!f.pagina) {
        saida.push(f.caminho);
        continue;
      }
      let doc = abertos.get(f.caminho);
      if (!doc) {
        doc = await openPdf((await api.lerPdf(f.caminho)).bytes);
        abertos.set(f.caminho, doc);
      }
      if (f.pagina > doc.pageCount) {
        saida.push(undefined);
        continue;
      }
      const antes = paginaInteiraAtual;
      paginaInteiraAtual = false; // arte do cliente: modo automático (só a arte), não o recorte do molde do Corel
      let raster: Raster;
      try {
        raster = await lerArteDaPagina(doc, f.pagina, 2400);
      } finally {
        paginaInteiraAtual = antes;
      }
      saida.push(await api.salvarTemporario(`${nomeDoCaminho(f.caminho)}-p${f.pagina}`, await rasterParaPng(raster)));
    }
    return saida;
  } finally {
    for (const d of abertos.values()) await d.close().catch(() => undefined);
  }
}

/** Tela que confirma, com o que o próprio macro do Corel anotou, o que foi importado em cada página do molde. */
function mostrarConfirmacaoDoCorel(cliente: string, detalhes: ResultadoDoMolde | undefined): void {
  const tela = $('tela-corel');
  const titulo = $('tela-corel-titulo');
  const lista = $('tela-corel-lista');
  const nota = $('tela-corel-nota');
  $('tela-corel-cliente').textContent = cliente;
  lista.textContent = '';
  const linha = (classe: string, rotulo: string, texto: string) => {
    const li = document.createElement('li');
    li.className = classe;
    const b = document.createElement('b');
    b.textContent = rotulo;
    li.append(b, texto);
    lista.append(li);
  };
  let algumOk = false;
  const face = (rotulo: string, f: FaceDoMolde | undefined, semTexto: string) => {
    if (!f || f.estado === 'sem') return linha('sem', rotulo, semTexto);
    if (f.estado === 'ok') {
      algumOk = true;
      return linha('ok', rotulo, `✓ Importada${f.detalhe ? ` — ficou com ${f.detalhe}` : ''}`);
    }
    return linha('erro', rotulo, `✗ Não importou${f.detalhe ? `: ${f.detalhe}` : ''}`);
  };
  if (!detalhes) {
    titulo.textContent = 'O Corel abriu o molde';
    titulo.className = '';
    linha('sem', 'Atenção', 'Este macro não informa o que importou. Importe o MKP.bas mais novo no Corel para ver a confirmação.');
    nota.textContent = 'Confira a arte no Corel antes de gerar o PDF.';
  } else if (detalhes.jaExistia) {
    titulo.textContent = 'Esse cliente já tinha arquivo no molde';
    titulo.className = '';
    linha('sem', 'Arquivo', 'Abri o que já existia, sem importar nada de novo.');
    nota.textContent = 'Se quiser refazer, apague o arquivo "… - MOLDE.cdr" da pasta do cliente e clique de novo.';
  } else {
    face('Frente (pág. 1)', detalhes.frente, 'Sem arte: nada importado');
    face('Verso (pág. 2)', detalhes.verso, 'Sem arte: crie o verso no Corel');
    titulo.textContent = algumOk ? '✓ Arte importada no Corel' : 'Nada foi importado';
    titulo.className = algumOk ? 'ok' : 'erro';
    nota.textContent = 'Ajuste no Corel e depois clique em "Gerar PDF (Corel)".';
  }
  const fechar = () => {
    tela.hidden = true;
    document.removeEventListener('keydown', aoTecla);
  };
  const aoTecla = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Enter') fechar();
  };
  document.addEventListener('keydown', aoTecla);
  $('tela-corel-ok').onclick = fechar;
  tela.hidden = false;
  $('tela-corel-ok').focus();
}

const ehImagem = (nome: string) => /\.(png|jpe?g)$/i.test(nome);

/** Lê PNG/JPG como pixels (sobre fundo branco, para imagens com transparência). */
async function lerImagem(bytes: Uint8Array): Promise<Raster> {
  const bmp = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const d = ctx.getImageData(0, 0, c.width, c.height);
  return { width: c.width, height: c.height, data: d.data };
}

/** Dados de um trabalho do histórico que está sendo reaberto para edição. */
interface Retomada {
  escolhas: Choices[];
  saidas: Saidas;
  /** Capa que estava selecionada (só nos rascunhos). */
  selecionada?: number;
  /** Zoom e posição de cada capa (só nos rascunhos). */
  ajustes?: (Partial<import('../engine/ajuste').Ajuste> | null)[];
  ajustesVerso?: (Partial<import('../engine/ajuste').Ajuste> | null)[];
  /** Registro do histórico a atualizar quando salvar de novo (só ao editar do histórico). */
  idHistorico?: string;
}

async function abrirPdf(arquivo: ArquivoPdf, retomada?: Retomada): Promise<void> {
  if (!pacote) return;
  const { nome, bytes, caminho } = arquivo;
  paginaInteiraAtual = paginaInteiraEm.has(caminho);
  if (retomada) trabalhos.remover(caminho); // o histórico manda: parte das cores salvas, não do que estava na memória
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
    const artes: Raster[] = [];
    const versos: (Raster | null)[] = [];
    const novaInfo: InfoDaCapa[] = [];
    if (ehImagem(nome)) {
      mensagem('Lendo a imagem…');
      const img = await lerImagem(bytes);
      artes.push(reduzir(coverCrop(img, razaoDaCapa), 1200));
      versos.push(null);
      novaInfo.push({
        pagina: 1,
        semVerso: true,
        avisoProporcao: Math.abs(img.width / img.height / razaoDaCapa - 1) > TOLERANCIA_DE_PROPORCAO,
        pixels: { largura: img.width, altura: img.height },
      });
    } else {
      const doc = await openPdf(bytes);
      const paginas = capaPageNumbers(doc.pageCount);
      if (paginas.length === 0) throw new PdfError('corrupt', 'O PDF não tem páginas.');
      const temContraCapa = !!pacote.pack.backArt;
      for (const [i, n] of paginas.entries()) {
        mensagem(`Lendo a capa ${i + 1} de ${paginas.length}…`);
        progresso(i / paginas.length);
        await proximoQuadro();
        // a arte é a imagem de cima da página (em PDFs com fundo esticado + arte menor, é só a menor)
        const medida: { pixels?: { largura: number; altura: number }; semMedida?: 'corel' | 'sem-imagem' } = {};
        const recortada = await lerArteDaPagina(doc, n, 1200, medida);
        const proporcao = recortada.width / recortada.height;
        novaInfo.push({
          pagina: n,
          pixels: medida.pixels,
          pixelsEstimados: medida.pixels ? true : undefined,
          semMedida: medida.semMedida,
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
    }
    estado = createState(pacote.pack, artes, versos);
    let aviso = '';
    if (retomada) {
      estado = aplicarEscolhas(estado, retomada.escolhas);
      retomada.ajustes?.forEach((a, i) => {
        if (a && estado && i < estado.capas.length) estado = setAjuste(estado, i, ajusteValido(a));
      });
      retomada.ajustesVerso?.forEach((a, i) => {
        if (a && estado && i < estado.capas.length) estado = setAjuste(estado, i, ajusteValido(a), 'verso');
      });
      if (retomada.selecionada !== undefined) estado = select(estado, Math.min(Math.max(retomada.selecionada, 0), estado.capas.length - 1));
      if (retomada.idHistorico) idsDoHistorico.set(caminho, retomada.idHistorico);
      const ignoradas = contarIgnoradas(pacote.pack, retomada.escolhas);
      if (ignoradas > 0) aviso += ` ${ignoradas === 1 ? '1 capa tinha uma cor que não existe mais no modelo e ficou com a cor padrão.' : `${ignoradas} capas tinham cores que não existem mais no modelo e ficaram com a cor padrão.`}`;
      if (retomada.escolhas.length !== estado.capas.length) aviso += ` O PDF tem ${estado.capas.length} capas e o trabalho salvo tinha ${retomada.escolhas.length}.`;
      const sd = retomada.saidas;
      caixa('saida-frente').checked = sd.frente;
      caixa('saida-vt').checked = sd.vt;
      caixa('saida-sem-canguru').checked = sd.semCanguru;
      caixa('saida-verso').checked = sd.verso;
      if (nenhumaMarcada()) caixa('saida-frente').checked = true;
    }
    info = novaInfo;
    nomeDoPdf = nome;
    caminhoDoPdf = caminho;
    trabalhos.guardar({ caminho, nome, estado, info });
    mostrarNomeDoPdf(nome, estado.capas.length);
    progresso(null);
    mensagem((artes.length === 1 ? '1 capa carregada.' : `${artes.length} capas carregadas.`) + aviso, aviso !== '');
    definirEstado('pronto');
    salvarRascunho();
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
  const dentroDaPasta1 = !!designer.pasta1 && semBarra(paiDe(paiDe(caminhoDoPdf))) === semBarra(designer.pasta1);
  $('salvo-aprovar').hidden = !(designer.designer && dentroDaPasta1 && designer.pasta2);
  $<HTMLButtonElement>('salvo-aprovar').disabled = false;
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
// Outra arte deste cliente: dá este serviço como terminado e abre a escolha de outra arte, já na pasta do cliente.
// As imagens novas vão para a mesma pasta MKP (ela fica ao lado do arquivo, e o nome da arte novo evita sobrescrever).
$('salvo-outra').addEventListener('click', () => {
  const pastaDoCliente = paiDe(caminhoDoPdf);
  fecharSalvo();
  descartarRascunho(caminhoDoPdf);
  trabalhos.remover(caminhoDoPdf);
  idsDoHistorico.delete(caminhoDoPdf);
  geradasDoTrabalho.delete(caminhoDoPdf);
  irParaInicio();
  mensagem('Escolha a outra arte deste cliente.');
  void (async () => {
    try {
      const arquivo = await api.escolherPdf(pastaDoCliente);
      if (arquivo) await abrirPdf(arquivo);
      else mensagem('');
    } catch (e) {
      mensagem(textoDoErro(e), true);
    }
  })();
});
$('salvo-ok').addEventListener('click', () => {
  fecharSalvo();
  descartarRascunho(caminhoDoPdf);
  trabalhos.remover(caminhoDoPdf);
  idsDoHistorico.delete(caminhoDoPdf);
  geradasDoTrabalho.delete(caminhoDoPdf);
  irParaInicio();
  mensagem('');
});

// ---- rascunho: o trabalho em andamento é gravado em disco a cada mudança ----
let temporizadorRascunho: number | undefined;
let filaRascunho: Promise<void> = Promise.resolve();
const naFila = (acao: () => Promise<void>) => {
  filaRascunho = filaRascunho.then(acao).catch((e) => console.warn('rascunho', e));
};

function salvarRascunho(): void {
  if (!estado || !caminhoDoPdf) return;
  // o retrato é tirado agora (e não quando o temporizador dispara), para não se perder se o usuário voltar ao início antes
  const r: Rascunho = {
    caminho: caminhoDoPdf,
    nome: nomeDoPdf,
    atualizadoEm: new Date().toISOString(),
    selecionada: estado.selecionada,
    saidas: saidasMarcadas(),
    escolhas: estado.capas.map((c) => ({ ...c.choices })),
    ajustes: estado.capas.map((c) => c.ajuste ?? null),
    ajustesVerso: estado.capas.map((c) => c.ajusteVerso ?? null),
  };
  window.clearTimeout(temporizadorRascunho);
  temporizadorRascunho = window.setTimeout(() => naFila(() => api.salvarRascunho(r)), 400);
}

function descartarRascunho(caminho: string): void {
  window.clearTimeout(temporizadorRascunho);
  naFila(() => api.removerRascunho(caminho));
}

async function continuarRascunho(r: Rascunho): Promise<void> {
  try {
    let arquivo: ArquivoPdf | null = null;
    try {
      arquivo = await api.lerPdf(r.caminho);
    } catch {
      mensagem('O PDF não está mais no lugar de antes. Escolha o PDF (as cores salvas serão mantidas).');
    }
    if (!arquivo) arquivo = await api.escolherPdf();
    if (!arquivo) return;
    if (arquivo.caminho !== r.caminho) descartarRascunho(r.caminho);
    await abrirPdf(arquivo, { escolhas: r.escolhas, saidas: r.saidas, selecionada: r.selecionada, ...(r.ajustes ? { ajustes: r.ajustes } : {}), ...(r.ajustesVerso ? { ajustesVerso: r.ajustesVerso } : {}) });
  } catch (e) {
    mensagem(textoDoErro(e), true);
  }
}

function guardarAtual(): void {
  if (estado && caminhoDoPdf) trabalhos.guardar({ caminho: caminhoDoPdf, nome: nomeDoPdf, estado, info });
}

let desenhoDeAndamento = 0;
function desenharEmAndamento(): void {
  const rodada = ++desenhoDeAndamento;
  const emMemoria = trabalhos.todos();
  const alvo = $('trabalhos');
  const linhaDe = (nome: string, capas: number, continuar: () => void, descartar: () => void) => {
    const linha = document.createElement('div');
    linha.className = 'trabalho';
    const n = document.createElement('span');
    n.className = 'nome';
    n.textContent = nome;
    const qtd = document.createElement('span');
    qtd.className = 'qtd';
    qtd.textContent = capas === 1 ? '1 capa' : `${capas} capas`;
    const bc = document.createElement('button');
    bc.type = 'button';
    bc.className = 'primario continuar';
    bc.textContent = 'Continuar';
    bc.addEventListener('click', continuar);
    const bd = document.createElement('button');
    bd.type = 'button';
    bd.className = 'discreto descartar';
    bd.textContent = 'Descartar';
    bd.addEventListener('click', () => {
      if (!window.confirm(`Descartar "${nome}"? As cores escolhidas serão perdidas.`)) return;
      descartar();
    });
    linha.append(n, qtd, bc, bd);
    return linha;
  };
  const desenhar = (doDisco: Rascunho[]) => {
    if (rodada !== desenhoDeAndamento) return; // uma desenhada mais nova já assumiu
    alvo.replaceChildren();
    for (const t of emMemoria) {
      alvo.append(
        linhaDe(t.nome, t.estado.capas.length, () => retomar(t.caminho), () => {
          descartarRascunho(t.caminho);
          trabalhos.remover(t.caminho);
          desenharEmAndamento();
        }),
      );
    }
    // trabalhos que só existem em disco (o app foi fechado ou o PC reiniciou)
    for (const r of doDisco) {
      if (emMemoria.some((t) => t.caminho === r.caminho)) continue;
      alvo.append(
        linhaDe(r.nome, r.escolhas.length, () => void continuarRascunho(r), () => {
          descartarRascunho(r.caminho);
          void filaRascunho.then(desenharEmAndamento);
        }),
      );
    }
    $('em-andamento').hidden = alvo.childElementCount === 0;
  };
  desenhar([]);
  void filaRascunho
    .then(() => api.listarRascunhos())
    .then(desenhar)
    .catch((e) => console.warn('não consegui ler os rascunhos', e));
}

function irParaInicio(): void {
  estado = null;
  info = [];
  nomeDoPdf = '';
  caminhoDoPdf = '';
  mostrarNomeDoPdf('', 0);
  definirEstado('vazio');
  mostrarAba('novo');
  desenharEmAndamento();
}

function retomar(caminho: string): void {
  const t = trabalhos.buscar(caminho);
  if (!t) return;
  estado = t.estado;
  info = t.info;
  nomeDoPdf = t.nome;
  caminhoDoPdf = t.caminho;
  mostrarNomeDoPdf(t.nome, t.estado.capas.length);
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
    void api.designerEstado().then(aplicarDesigner, () => undefined);
    void api.operador().then((nome) => {
      $('historico-operador').textContent = nome;
    });
    irParaInicio();
  } catch (e) {
    mensagem(`Não consegui carregar o pacote do mockup: ${e instanceof Error ? e.message : String(e)}`, true);
  }
}

// ---- operador e histórico ----
/** Um trabalho salvo mantém o mesmo registro no histórico, mesmo se for salvo de novo (ex.: outras imagens). */
const idsDoHistorico = new Map<string, string>();
/** Quantas imagens já foram gravadas de cada trabalho: o botão Salvar não zera essa conta. */
const geradasDoTrabalho = new Map<string, number>();

function saidasMarcadas(): Saidas {
  return {
    frente: caixa('saida-frente').checked,
    vt: caixa('saida-vt').checked,
    semCanguru: caixa('saida-sem-canguru').checked,
    verso: caixa('saida-verso').checked,
  };
}

/** Zoom/posição da arte para guardar junto do trabalho (só os campos que existem). */
function ajustesSalvos(): { ajustes?: ReturnType<typeof ajustesDoEstado>['ajustes']; ajustesVerso?: ReturnType<typeof ajustesDoEstado>['ajustesVerso'] } {
  if (!estado) return {};
  const { ajustes, ajustesVerso } = ajustesDoEstado(estado);
  return { ...(ajustes ? { ajustes } : {}), ...(ajustesVerso ? { ajustesVerso } : {}) };
}

async function registrarNoHistorico(geradas: number, finalizado = false): Promise<void> {
  if (!estado) return;
  geradas = Math.max(geradas, geradasDoTrabalho.get(caminhoDoPdf) ?? 0);
  geradasDoTrabalho.set(caminhoDoPdf, geradas);
  let id = idsDoHistorico.get(caminhoDoPdf);
  if (!id) idsDoHistorico.set(caminhoDoPdf, (id = crypto.randomUUID()));
  try {
    await api.salvarNoHistorico({
      id,
      data: new Date().toISOString(),
      pdfNome: nomeDoPdf,
      pdfCaminho: caminhoDoPdf,
      saidas: saidasMarcadas(),
      escolhas: estado.capas.map((c) => ({ ...c.choices })),
      geradas,
      ...(finalizado ? { finalizado: true } : {}),
      ...ajustesSalvos(),
    });
  } catch (e) {
    // o histórico é um extra: se falhar, os mockups já foram salvos
    console.warn('não consegui gravar o histórico', e);
  }
}

async function editarDoHistorico(entrada: EntradaHistorico, trocarPdf: boolean): Promise<void> {
  try {
    let arquivo: ArquivoPdf | null = null;
    if (!trocarPdf) {
      try {
        arquivo = await api.lerPdf(entrada.pdfCaminho);
      } catch {
        mensagem('O PDF não está mais no lugar de antes. Escolha o PDF (as cores salvas serão mantidas).');
      }
    }
    if (!arquivo) arquivo = await api.escolherPdf();
    if (!arquivo) return;
    mostrarAba('novo');
    // trocando a arte, o zoom/posição de antes não serve para a arte nova: só as cores são mantidas
    await abrirPdf(arquivo, {
      escolhas: entrada.escolhas,
      saidas: entrada.saidas,
      idHistorico: entrada.id,
      ...(!trocarPdf && entrada.ajustes ? { ajustes: entrada.ajustes } : {}),
      ...(!trocarPdf && entrada.ajustesVerso ? { ajustesVerso: entrada.ajustesVerso } : {}),
    });
  } catch (e) {
    mensagem(textoDoErro(e), true);
  }
}

async function desenharHistorico(): Promise<void> {
  const alvo = $('historico-lista');
  alvo.replaceChildren();
  let lista: EntradaHistorico[] = [];
  try {
    lista = await api.listarHistorico();
  } catch (e) {
    mensagem(`Não consegui ler o histórico: ${e instanceof Error ? e.message : String(e)}`, true);
  }
  if (lista.length === 0) {
    const vazio = document.createElement('p');
    vazio.className = 'historico-vazio';
    vazio.textContent = 'Nenhum trabalho salvo ainda. Quando você salvar mockups, eles aparecem aqui.';
    alvo.append(vazio);
    return;
  }
  for (const e of lista) {
    const linha = document.createElement('div');
    linha.className = 'historico-linha';
    const info = document.createElement('div');
    info.className = 'info';
    const pdf = document.createElement('span');
    pdf.className = 'pdf';
    pdf.textContent = e.pdfNome;
    const detalhe = document.createElement('span');
    detalhe.className = 'detalhe';
    const capas = e.escolhas.length === 1 ? '1 capa' : `${e.escolhas.length} capas`;
    detalhe.textContent = `${formatarData(e.data)} · ${situacaoDoTrabalho(e)} · ${capas} · ${descreverSaidas(e.saidas)} · ${e.geradas} ${e.geradas === 1 ? 'imagem' : 'imagens'}`;
    info.append(pdf, detalhe);
    const botao = (texto: string, classe: string, acao: () => void, dica = ''): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = classe;
      b.textContent = texto;
      if (dica) b.title = dica;
      b.addEventListener('click', acao);
      return b;
    };
    linha.append(
      info,
      botao('Editar', 'primario editar', () => void editarDoHistorico(e, false), 'Reabre este trabalho para mudar as cores'),
      botao('Trocar a arte', 'secundario trocar', () => void editarDoHistorico(e, true), 'Escolhe outro PDF e mantém as cores salvas'),
      botao('Remover', 'discreto remover', () => {
        if (!window.confirm(`Remover "${e.pdfNome}" do histórico? Os arquivos já salvos não são apagados.`)) return;
        void api.removerDoHistorico(e.id).then(desenharHistorico);
      }),
    );
    alvo.append(linha);
  }
}

function mostrarAba(aba: 'novo' | 'historico' | 'pasta1' | 'config' | 'anuncios'): void {
  if ((aba === 'pasta1' || aba === 'config' || aba === 'anuncios') && !designer.designer) aba = 'novo';
  const pagina = aba !== 'novo';
  document.querySelector<HTMLElement>('.area')!.hidden = pagina;
  $('paginas').hidden = !pagina;
  $('historico').hidden = aba !== 'historico';
  $('pasta1').hidden = aba !== 'pasta1';
  $('config').hidden = aba !== 'config';
  $('anuncios').hidden = aba !== 'anuncios';
  $('tab-anuncios').setAttribute('aria-pressed', String(aba === 'anuncios'));
  $('tab-config').setAttribute('aria-pressed', String(aba === 'config'));
  $('tab-novo').setAttribute('aria-pressed', String(aba === 'novo'));
  $('tab-historico').setAttribute('aria-pressed', String(aba === 'historico'));
  $('tab-pasta1').setAttribute('aria-pressed', String(aba === 'pasta1'));
  if (aba === 'historico') void desenharHistorico();
  if (aba === 'config') atualizarCaminhos();
  if (aba === 'anuncios') void mostrarAnuncios();
  if (aba === 'pasta1') {
    alertasNovos = 0;
    $('badge-cliente').hidden = true;
    void desenharPasta1();
  }
}
$('tab-novo').addEventListener('click', () => mostrarAba('novo'));
$('tab-historico').addEventListener('click', () => mostrarAba('historico'));
$('tab-pasta1').addEventListener('click', () => mostrarAba('pasta1'));
$('tab-config').addEventListener('click', () => mostrarAba('config'));
$('tab-anuncios').addEventListener('click', () => mostrarAba('anuncios'));
iniciarAnuncios();

/** Mostra na Configuração o caminho de cada pasta do fluxo. */
function atualizarCaminhos(): void {
  for (const n of [1, 2, 3, 4] as const) $(`caminho-pasta${n}`).textContent = designer[`pasta${n}`] ?? 'não escolhida';
  $('caminho-anuncios').textContent = designer.pastaAnuncios ?? 'não escolhida';
}

// ---- Modo designer (só aparece para quem liga; desligado por padrão) ----
let designer: ConfigDesigner = { designer: false };

const semBarra = (p: string) => p.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
const paiDe = (p: string) => p.slice(0, Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')));
const nomeDoCaminho = (p: string) => p.slice(Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')) + 1);

function aplicarDesigner(c: ConfigDesigner): void {
  designer = c;
  if (c.designer) void api.iniciarComWindowsEstado().then((v) => ($<HTMLInputElement>('iniciar-windows').checked = v), () => undefined);
  // O nome genérico do Windows ("User") não aparece mais: só o designer reconhecido, e só no modo Designer.
  $('operador').textContent = `${NOME_DO_DESIGNER} · Designer`;
  $('operador').hidden = !c.designer;
  $('tab-pasta1').hidden = !c.designer;
  $('tab-config').hidden = !c.designer;
  $('tab-anuncios').hidden = !c.designer;
  if (!c.designer && ($('pasta1').hidden === false || $('config').hidden === false || $('anuncios').hidden === false)) mostrarAba('novo');
  atualizarCaminhos();
  desenharQualidade();
}

const NOME_DO_DESIGNER = 'LK';
const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let trocandoModo = false;

/** Shift+D liga (ou desliga) o Modo designer, com uma tela de "carregando" e as boas-vindas. */
function pedirPin(): Promise<string | null> {
  const tela = $('tela-pin');
  const campo = $<HTMLInputElement>('pin-campo');
  const erro = $('pin-erro');
  return new Promise((resolver) => {
    const fechar = (valor: string | null): void => {
      tela.hidden = true;
      $('pin-form').removeEventListener('submit', enviar);
      $('pin-cancelar').removeEventListener('click', cancelar);
      document.removeEventListener('keydown', esc, true);
      campo.value = '';
      resolver(valor);
    };
    const enviar = (e: Event): void => {
      e.preventDefault();
      if (campo.value.length === 0) return;
      fechar(campo.value);
    };
    const cancelar = (): void => fechar(null);
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') fechar(null);
    };
    erro.textContent = '';
    campo.value = '';
    tela.hidden = false;
    $('pin-form').addEventListener('submit', enviar);
    $('pin-cancelar').addEventListener('click', cancelar);
    document.addEventListener('keydown', esc, true);
    campo.focus();
  });
}

async function trocarModoDesigner(): Promise<void> {
  if (trocandoModo) return;
  trocandoModo = true;
  let pin: string | undefined;
  if (!designer.designer) {
    const digitado = await pedirPin();
    if (digitado === null) {
      trocandoModo = false;
      return;
    }
    pin = digitado;
  }
  const tela = $('tela-designer');
  const titulo = $('designer-titulo');
  const giro = $('designer-giro');
  const ligar = !designer.designer;
  try {
    giro.hidden = false;
    $('designer-ok').hidden = true;
    $('designer-barra').hidden = false;
    $('designer-sub').textContent = ligar ? 'Procurando as pastas do fluxo de artes' : '';
    titulo.textContent = ligar ? 'Carregando modo designer…' : 'Saindo do modo designer…';
    tela.hidden = false;
    const [config] = await Promise.all([api.designerLigar(ligar, pin), esperar(1200)]);
    aplicarDesigner(config);
    if (ligar) {
      if (!config.pasta1) {
        // primeira vez: tenta achar as pastas sozinho (só preenche o que está vazio)
        const r = await api.designerProcurarPastas(false).catch(() => null);
        if (r) {
          aplicarDesigner(r.config);
          if (r.achou > 0) mensagem(`Achei ${r.achou} ${r.achou === 1 ? 'pasta' : 'pastas'} do fluxo. Confira na aba Configuração.`);
        }
      }
      await desenharPasta1();
      giro.hidden = true;
      $('designer-barra').hidden = true;
      $('designer-ok').hidden = false; // check animado: desenha o traço e abre uma onda verde
      $('designer-sub').textContent = 'Modo Designer ativo';
      titulo.textContent = `Bem-vindo, ${NOME_DO_DESIGNER}`;
      await esperar(1600);
    }
  } catch (e) {
    mensagem(textoDoErro(e), true);
  } finally {
    tela.hidden = true;
    trocandoModo = false;
  }
}
document.addEventListener('keydown', (e) => {
  if (e.repeat || !e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.key.toLowerCase() !== 'd') return;
  const alvo = e.target as HTMLElement | null;
  if (alvo && ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName)) return;
  void trocarModoDesigner();
});

function desenharQualidade(): void {
  const el = $('qualidade');
  const dados = estado ? info[estado.selecionada] : undefined;
  if (!designer.designer || !dados) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.replaceChildren();
  if (!dados.pixels) {
    el.className = 'qualidade';
    el.textContent =
      dados.semMedida === 'corel'
        ? 'PDF exportado do Corel: a qualidade não é medida. Confira a arte original.'
        : 'Não encontrei uma imagem grande nesta página (pode ser vetorial ou várias imagens pequenas): a qualidade não foi medida. Confira a arte original.';
    return;
  }
  const r = avaliarQualidade(dados.pixels, AREA_PADRAO_MM, LIMITES_PADRAO);
  el.className = `qualidade ${r.nivel}`;
  const selo = document.createElement('div');
  selo.className = 'selo';
  selo.textContent = r.nivel === 'boa' ? 'Qualidade boa' : r.nivel === 'limite' ? 'No limite: pode serrilhar' : 'Baixa: vai serrilhar';
  const detalhe = document.createElement('div');
  detalhe.textContent = `${dados.pixels.largura} × ${dados.pixels.altura} px · cerca de ${Math.round(r.dpi)} DPI em ${AREA_PADRAO_MM.largura} × ${AREA_PADRAO_MM.altura} mm`;
  const nota = document.createElement('div');
  nota.className = 'nota';
  nota.textContent = dados.pixelsEstimados
    ? 'Estimativa pela imagem da página do PDF. O tamanho da área e os limites ainda não foram calibrados.'
    : 'Estimativa: o tamanho da área e os limites ainda não foram calibrados.';
  el.append(selo, detalhe, nota);
  if (r.nivel !== 'boa') {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'secundario';
    botao.textContent = 'Copiar pedido de nova arte';
    botao.addEventListener('click', () => {
      void navigator.clipboard.writeText(pedidoDeNovaArte(dados.pixels!, AREA_PADRAO_MM, LIMITES_PADRAO)).then(
        () => mensagem('Texto copiado. É só colar na conversa com o admin.'),
        () => mensagem('Não consegui copiar o texto.', true),
      );
    });
    el.append(botao);
  }
}

const ROTULOS_ETAPAS = ['Arte', 'Aprovar', 'Impressão', 'Finalizado'];

function linhaDoCliente(c: Cliente): HTMLElement {
  const linha = document.createElement('article');
  linha.className = `cliente-linha${c.alteradoDepoisDoEnvio || c.voltou ? ' com-alteracao' : ''}`;

  // 1) nome do cliente em cima (e a pasta de grupo, se houver)
  const cabeca = document.createElement('header');
  cabeca.className = 'cc-cabeca';
  const nome = document.createElement('h3');
  nome.className = 'nome';
  nome.textContent = c.nome;
  nome.title = c.nome;
  cabeca.append(nome);
  if (c.grupo) {
    const g = document.createElement('span');
    g.className = 'grupo-chip';
    g.textContent = c.grupo;
    cabeca.append(g);
  }
  const selo = document.createElement('span');
  selo.className = 'selo-situacao';
  if (c.etapa === 1) {
    selo.classList.add(c.situacao);
    selo.textContent = c.situacao === 'arte-a-fazer' ? 'Arte para fazer' : c.situacao === 'pronta-para-aprovar' ? 'Pronta para aprovar' : 'Em andamento';
  } else {
    selo.textContent = ROTULOS_ETAPAS[c.etapa - 1] ?? '';
  }
  cabeca.append(selo);
  linha.append(cabeca);

  // 2) em que etapa está
  const barra = document.createElement('div');
  barra.className = 'etapas';
  barra.setAttribute('aria-label', `Etapa ${c.etapa} de 4: ${ROTULOS_ETAPAS[c.etapa - 1]}`);
  ROTULOS_ETAPAS.forEach((r, i) => {
    const e = document.createElement('div');
    e.className = `etapa ${i + 1 < c.etapa ? 'feita' : i + 1 === c.etapa ? 'atual' : ''}`;
    e.textContent = `${i + 1} ${r}`;
    barra.append(e);
  });
  linha.append(barra);

  // 3) o que está acontecendo / o que falta
  const avisos = document.createElement('div');
  avisos.className = 'cc-avisos';
  const aviso = (texto: string, classe = '') => {
    const e = document.createElement('span');
    e.className = `cc-aviso ${classe}`.trim();
    e.textContent = texto;
    avisos.append(e);
    return e;
  };
  if (c.etapa === 1 && c.situacao === 'em-andamento') aviso(`Falta: ${c.faltando.join(', ')}`);
  if (c.duplicado) aviso('Mesmo nome em mais de uma etapa');
  if (c.chegando) aviso('Chegando… (arquivos ainda sendo enviados)', 'suave');
  if (c.etapa === 1 && c.artes.length === 0) aviso('Sem PDF/JPG/PNG na pasta', 'suave');
  if (c.voltou) aviso(`Voltou da Pasta ${c.voltou.de} para a Pasta ${c.voltou.para} (alguém moveu a pasta)`, 'alterado');
  if (c.alteradoDepoisDoEnvio) aviso('Alterado depois do envio: confira com a admin', 'alterado');
  if (avisos.childElementCount > 0) linha.append(avisos);

  // 4) ações
  const acoes = document.createElement('div');
  acoes.className = 'cc-acoes';
  const botao = (texto: string, classe: string, titulo: string, aoClicar: (ev: MouseEvent) => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = classe;
    b.textContent = texto;
    b.title = titulo;
    b.addEventListener('click', aoClicar);
    acoes.append(b);
  };
  if (c.voltou) {
    botao('Já vi', 'secundario', 'Tira o aviso de que a pasta voltou de etapa', () => {
      void api.fluxoVoltouVisto(c.caminho).then(
        () => desenharPasta1(),
        (e) => mensagem(textoDoErro(e), true),
      );
    });
  }
  if (c.alteradoDepoisDoEnvio) {
    botao('Já avisei a admin', 'secundario', 'Tira o aviso de alteração', () => {
      void api.fluxoConferido(c.caminho).then(
        () => desenharPasta1(),
        (e) => mensagem(textoDoErro(e), true),
      );
    });
  }
  // botões de mandar a pasta para a próxima etapa (com confirmação em 2 cliques); só quando os arquivos já terminaram de chegar
  const botaoDeEnviar = (rotulo: string, destinoTexto: string, mensagemOk: string, mover: () => Promise<{ ok: true } | { ok: false; motivo: string }>) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'primario';
    b.textContent = rotulo;
    b.title = `Move a pasta do cliente para ${destinoTexto}`;
    let pedindo = false;
    let timer = 0;
    const normal = () => {
      pedindo = false;
      b.textContent = rotulo;
      b.classList.remove('confirmando');
    };
    b.addEventListener('click', () => {
      if (!pedindo) {
        pedindo = true;
        b.textContent = `Confirmar: mover para ${destinoTexto}`;
        b.classList.add('confirmando');
        timer = window.setTimeout(normal, 6000);
        return;
      }
      window.clearTimeout(timer);
      b.disabled = true;
      void mover().then(
        async (r) => {
          if (!r.ok) {
            mensagem(r.motivo, true);
            b.disabled = false;
            normal();
            return;
          }
          mensagem(mensagemOk);
          await desenharPasta1();
        },
        (e) => {
          mensagem(textoDoErro(e), true);
          b.disabled = false;
          normal();
        },
      );
    });
    acoes.append(b);
  };
  const comGrupo = (pasta: string) => (c.grupo ? `${pasta} / ${c.grupo}` : pasta);
  if (!c.chegando) {
    if (c.etapa === 1 && c.situacao === 'pronta-para-aprovar') {
      botaoDeEnviar('Enviar para Aprovar', comGrupo('2 APROVAR'), `${c.nome} enviada para Aprovar.`, () => api.fluxoMover(c.caminho));
    } else if (c.etapa === 2) {
      botaoDeEnviar('Enviar para Impressão', comGrupo('3 AGUARDA IMPRESSÃO'), `${c.nome} enviada para Aguarda impressão.`, () => api.fluxoAvancar(c.caminho));
    } else if (c.etapa === 3) {
      botaoDeEnviar('Marcar como finalizado', comGrupo('4 FINALIZADOS'), `${c.nome} enviada para Finalizados.`, () => api.fluxoAvancar(c.caminho));
    }
  }
  // só oferece fazer o MKP enquanto ele ainda não está pronto; nomes MKP* já são o mockup pronto
  if (c.etapa === 1 && c.situacao !== 'pronta-para-aprovar') {
    // imagens primeiro (costumam ser a arte do cliente), PDFs depois
    const doCliente = c.artes.filter((a) => !/^mkp\b/i.test(nomeDoCaminho(a))).sort((x, y) => Number(/\.pdf$/i.test(x)) - Number(/\.pdf$/i.test(y)));
    // o PDF que o Corel exportou também pode ser a fonte do MKP; fica no fim da lista, com a etiqueta
    const doCorel = (c.exportacoesCorel ?? []).filter((a) => !doCliente.includes(a));
    const artes = [...doCliente, ...doCorel];
    if (artes.length > 0) {
      let escolhida = artes[0]!;
      if (artes.length > 1) {
        const lista = document.createElement('select');
        lista.className = 'cc-select';
        lista.title = 'Qual arquivo usar para o MKP';
        for (const a of artes) {
          const o = document.createElement('option');
          o.value = a;
          o.textContent = doCorel.includes(a) ? `${nomeDoCaminho(a)} (PDF do Corel)` : nomeDoCaminho(a);
          lista.append(o);
        }
        lista.addEventListener('change', () => (escolhida = lista.value));
        acoes.append(lista);
      }
      if (doCliente.length > 0) {
        // frente e verso: o chute inicial vem dos nomes e do PDF (página 1 frente, página 2 verso); dá para trocar
        const fontes = fontesDaArte(doCliente);
        const padrao = frenteEVersoPadrao(doCliente);
        const seletor = (rotulo: string, inicial: Fonte | undefined, vazio: string) => {
          const caixa = document.createElement('label');
          caixa.className = 'cc-fonte';
          caixa.append(`${rotulo}: `);
          const lista = document.createElement('select');
          lista.className = 'cc-select';
          const sem = document.createElement('option');
          sem.value = '';
          sem.textContent = vazio;
          lista.append(sem);
          fontes.forEach((f, i) => {
            const o = document.createElement('option');
            o.value = String(i);
            o.textContent = rotuloDaFonte(f);
            lista.append(o);
          });
          const ini = inicial ? fontes.findIndex((f) => f.caminho === inicial.caminho && f.pagina === inicial.pagina) : -1;
          lista.value = ini >= 0 ? String(ini) : '';
          caixa.append(lista);
          acoes.append(caixa);
          return () => (lista.value === '' ? undefined : fontes[Number(lista.value)]);
        };
        const frenteEscolhida = seletor('Frente', padrao.frente, '(sem arte)');
        const versoEscolhido = seletor('Verso', padrao.verso, '(sem arte: criar depois)');
        botao('Abrir no molde (Corel)', 'secundario', 'Abre o CorelDRAW com a frente (página 1) e o verso (página 2) já encaixados no molde', (ev) => {
          const frente = frenteEscolhida();
          const verso = versoEscolhido();
          if (!frente && !verso) {
            mensagem('Escolha a arte da frente ou do verso.', true);
            return;
          }
          const b = ev.currentTarget as HTMLButtonElement;
          b.disabled = true;
          void (async () => {
            try {
              mensagem('Preparando as artes…');
              const [pf, pv] = await prepararFontesParaOMolde([frente, verso]);
              if (!pf && !pv) {
                mensagem('Não achei páginas para colocar no molde.', true);
                return;
              }
              mensagem('Abrindo no Corel… pode levar alguns segundos.');
              const principal = (frente ?? verso)!.caminho;
              const nomeBase = nomeDoCaminho(principal).replace(/\.[^.]+$/, '');
              const sep = c.caminho.includes('\\') ? '\\' : '/';
              const r = await api.corelArteNoMolde({
                ...(pf ? { frente: pf } : {}),
                ...(pv ? { verso: pv } : {}),
                destino: `${c.caminho}${sep}${nomeBase} - MOLDE.cdr`,
                copiar: principal,
              });
              if (r.ok) {
                mensagem('Arte no molde. Ajuste e depois use "Gerar PDF".');
                mostrarConfirmacaoDoCorel(c.nome, r.detalhes);
              } else if (r.aberto) {
                mensagem(r.motivo);
              } else {
                mensagem(`${r.motivo} (copiei o caminho da arte: no Corel, rode o macro e cole)`, true);
              }
            } catch (e) {
              mensagem(textoDoErro(e), true);
            } finally {
              b.disabled = false;
            }
          })();
        });
      }
      botao('Gerar PDF (Corel)', 'secundario', 'Manda o Corel salvar o PDF do documento aberto, na pasta do cliente', (ev) => {
        const b = ev.currentTarget as HTMLButtonElement;
        b.disabled = true;
        mensagem('Gerando o PDF no Corel…');
        void api.corelGerarPdf(c.caminho).then(
          (r) => {
            b.disabled = false;
            mensagem(r.ok ? 'PDF gerado. Ele já aparece na lista como PDF do Corel.' : r.motivo, !r.ok);
            if (r.ok) void desenharPasta1();
          },
          (e) => {
            b.disabled = false;
            mensagem(textoDoErro(e), true);
          },
        );
      });
      botao('Fazer MKP', 'primario', 'Abre o arquivo escolhido no gerador de MKP', () => {
        void (async () => {
          try {
            const arquivo = await api.lerPdf(escolhida);
            if (doCorel.includes(escolhida)) paginaInteiraEm.add(arquivo.caminho);
            else paginaInteiraEm.delete(arquivo.caminho);
            if (document.body.dataset.estado === 'pronto') {
              guardarAtual();
              irParaInicio();
            }
            mostrarAba('novo');
            await abrirPdf(arquivo);
          } catch (e) {
            mensagem(textoDoErro(e), true);
          }
        })();
      });
    }
  }
  // as cópias de segurança que o Corel cria sozinho não viram botão (continuam na lista de arquivos)
  const abrivel = c.arquivos.filter((n) => /\.(cdr|pdf)$/i.test(n) && !/^c[oó]pia_de_seguran[cç]a/i.test(n));
  const abrirArquivo = (nomeArq: string) => {
    const sep = c.caminho.includes('\\') ? '\\' : '/';
    void api.abrirArquivoCliente(`${c.caminho}${sep}${nomeArq}`).then(
      (r) => mensagem(r.ok ? `Abrindo ${nomeArq}…` : r.motivo, !r.ok),
      (e) => mensagem(textoDoErro(e), true),
    );
  };
  if (abrivel.length <= 2) {
    for (const nomeArq of abrivel) {
      const ehCdr = /\.cdr$/i.test(nomeArq);
      const unico = abrivel.filter((n) => /\.cdr$/i.test(n) === ehCdr).length === 1;
      const texto = unico ? (ehCdr ? 'Abrir no Corel' : 'Abrir PDF') : `${ehCdr ? 'Corel' : 'PDF'}: ${nomeArq}`;
      botao(texto, 'secundario', nomeArq, () => abrirArquivo(nomeArq));
    }
  } else {
    // muitos arquivos: um menu só, em vez de um botão enorme para cada um
    const menu = document.createElement('details');
    menu.className = 'cc-menu';
    const rotulo = document.createElement('summary');
    rotulo.textContent = `Abrir arquivo (${abrivel.length})`;
    menu.append(rotulo);
    const itens = document.createElement('div');
    itens.className = 'cc-menu-itens';
    for (const nomeArq of abrivel) {
      const ehCdr = /\.cdr$/i.test(nomeArq);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cc-menu-item';
      b.title = nomeArq;
      const tipo = document.createElement('span');
      tipo.className = `cc-tipo ${ehCdr ? 'cdr' : 'pdf'}`;
      tipo.textContent = ehCdr ? 'CDR' : 'PDF';
      const nomeEl = document.createElement('span');
      nomeEl.textContent = nomeArq;
      b.append(tipo, nomeEl);
      b.addEventListener('click', () => {
        abrirArquivo(nomeArq);
        menu.open = false;
      });
      itens.append(b);
    }
    menu.append(itens);
    acoes.append(menu);
  }
  if (acoes.childElementCount > 0) linha.append(acoes);

  // 5) arquivos: recolhidos, para o card não crescer
  if (c.arquivos.length > 0) {
    const d = document.createElement('details');
    d.className = 'cc-arquivos';
    const r = document.createElement('summary');
    r.textContent = `${c.arquivos.length} ${c.arquivos.length === 1 ? 'arquivo' : 'arquivos'}`;
    d.append(r);
    const ul = document.createElement('ul');
    for (const n of c.arquivos) {
      const li = document.createElement('li');
      li.textContent = n;
      ul.append(li);
    }
    d.append(ul);
    linha.append(d);
  }
  return linha;
}

// Duas atualizações da lista ao mesmo tempo desenhavam os clientes em dobro; só a mais recente pode desenhar.
let geracaoPasta1 = 0;
async function desenharPasta1(): Promise<void> {
  const minha = ++geracaoPasta1;
  const alvo = $('pasta1-lista');
  atualizarCaminhos();
  const avisos = $('pasta1-avisos');
  avisos.replaceChildren();
  alvo.replaceChildren();
  const texto = (onde: HTMLElement, t: string) => {
    const p = document.createElement('p');
    p.className = 'historico-vazio';
    p.textContent = t;
    onde.append(p);
  };
  if (!designer.pasta1) return texto(alvo, 'Abra a aba Configuração e escolha a Pasta 1 para ver os clientes.');
  let resultado: Awaited<ReturnType<MockupApi['clientesListar']>>;
  try {
    resultado = await api.clientesListar();
  } catch (e) {
    if (minha !== geracaoPasta1) return;
    return texto(alvo, textoDoErro(e));
  }
  if (minha !== geracaoPasta1) return;
  alvo.replaceChildren();
  avisos.replaceChildren();
  for (const a of resultado.avisos) texto(avisos, a);
  ultimaLista = resultado.clientes;
  desenharListaPasta1();
}

type FiltroSituacao = 'todos' | 'arte-a-fazer' | 'em-andamento' | 'pronta-para-aprovar';
let ultimaLista: Cliente[] = [];
let filtroSituacao: FiltroSituacao = 'todos';
const semAcentoR = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ORDEM_SITUACAO: Record<string, number> = { 'arte-a-fazer': 0, 'em-andamento': 1, 'pronta-para-aprovar': 2 };

/** Desenha a lista a partir do último resultado (sem ir ao disco): filtros e ordem do que precisa de ação primeiro. */
// Só o que ainda não estava na tela anima ao entrar (assim a lista não "pisca" a cada atualização).
const jaNaTela = new Set<string>();
const ultimosNumeros = new Map<string, number>();
/** Número que sobe até o valor novo; sem animação se o valor não mudou ou se o usuário pediu menos movimento. */
function animarNumero(chave: string, el: HTMLElement, para: number): void {
  const de = ultimosNumeros.get(chave);
  ultimosNumeros.set(chave, para);
  if (de === undefined || de === para || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const t0 = performance.now();
  const passo = (agora: number) => {
    const f = Math.min(1, (agora - t0) / 600);
    el.textContent = String(Math.round(de + (para - de) * (1 - (1 - f) ** 3)));
    if (f < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

function desenharListaPasta1(): void {
  const alvo = $('pasta1-lista');
  const filtros = $('pasta1-filtros');
  alvo.replaceChildren();
  filtros.hidden = ultimaLista.length === 0;
  if (ultimaLista.length === 0) {
    const p = document.createElement('p');
    p.className = 'historico-vazio';
    p.textContent = 'Nenhum cliente nas Pastas 1, 2 e 3.';
    alvo.append(p);
    return;
  }
  const doEtapa1 = ultimaLista.filter((c) => c.etapa === 1);
  const contagem = (s: FiltroSituacao) => (s === 'todos' ? doEtapa1.length : doEtapa1.filter((c) => c.situacao === s).length);
  const chips = $('filtro-chips');
  chips.replaceChildren();
  const ROTULOS: [FiltroSituacao, string][] = [
    ['todos', 'Todos'],
    ['arte-a-fazer', 'Arte para fazer'],
    ['em-andamento', 'Em andamento'],
    ['pronta-para-aprovar', 'Prontas'],
  ];
  for (const [valor, rotulo] of ROTULOS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.setAttribute('aria-pressed', String(filtroSituacao === valor));
    b.textContent = `${rotulo} (${contagem(valor)})`;
    b.addEventListener('click', () => {
      filtroSituacao = valor;
      desenharListaPasta1();
    });
    chips.append(b);
  }
  const termo = semAcentoR($<HTMLInputElement>('filtro-nome').value.trim());
  const passa = (c: Cliente) =>
    (!termo || semAcentoR(`${c.grupo ?? ''} ${c.nome}`).includes(termo)) && (c.etapa !== 1 || filtroSituacao === 'todos' || c.situacao === filtroSituacao);
  // painel de números no topo
  const resumo = document.createElement('div');
  resumo.className = 'resumo';
  const NUMEROS: [string, string, number][] = [
    ['alerta', 'Arte para fazer', doEtapa1.filter((c) => c.situacao === 'arte-a-fazer').length],
    ['andamento', 'Em andamento', doEtapa1.filter((c) => c.situacao === 'em-andamento').length],
    ['pronta', 'Prontas para aprovar', doEtapa1.filter((c) => c.situacao === 'pronta-para-aprovar').length],
    ['aprovar', 'Em aprovação', ultimaLista.filter((c) => c.etapa === 2).length],
    ['impressao', 'Aguarda impressão', ultimaLista.filter((c) => c.etapa === 3).length],
  ];
  for (const [tipo, rotulo, valor] of NUMEROS) {
    const t = document.createElement('div');
    t.className = `resumo-item ${tipo}${valor === 0 ? ' zero' : ''}`;
    const n = document.createElement('strong');
    n.textContent = String(valor);
    animarNumero(`resumo-${tipo}`, n, valor);
    const r = document.createElement('span');
    r.textContent = rotulo;
    t.append(n, r);
    resumo.append(t);
  }
  alvo.append(resumo);
  const TITULOS = ['1 · Aguarda arte', '2 · Aprovar', '3 · Aguarda impressão'];
  let mostrou = 0;
  for (const etapa of [1, 2, 3] as const) {
    const doGrupo = ultimaLista
      .filter((c) => c.etapa === etapa && passa(c))
      .sort((x, y) => (etapa === 1 ? (ORDEM_SITUACAO[x.situacao] ?? 9) - (ORDEM_SITUACAO[y.situacao] ?? 9) : 0) || x.nome.localeCompare(y.nome, 'pt-BR'));
    if (doGrupo.length === 0) continue;
    mostrou += doGrupo.length;
    const secao = document.createElement('section');
    secao.className = 'secao-etapa';
    const t = document.createElement('h3');
    t.className = 'secao-titulo';
    t.dataset.etapa = String(etapa);
    t.append(document.createTextNode(TITULOS[etapa - 1] ?? ''));
    const qtd = document.createElement('span');
    qtd.className = 'secao-qtd';
    qtd.textContent = String(doGrupo.length);
    t.append(qtd);
    const grade = document.createElement('div');
    grade.className = 'grade-clientes';
    doGrupo.forEach((c, i) => {
      const el = linhaDoCliente(c);
      const k = `${c.etapa}|${c.caminho}`;
      if (!jaNaTela.has(k)) {
        el.classList.add('entra');
        el.style.setProperty('--i', String(Math.min(i, 14)));
        jaNaTela.add(k);
      }
      grade.append(el);
    });
    secao.append(t, grade);
    alvo.append(secao);
  }
  if (mostrou === 0) {
    const p = document.createElement('p');
    p.className = 'historico-vazio';
    p.textContent = 'Nenhum cliente com esse filtro.';
    alvo.append(p);
  }
}
$('filtro-nome').addEventListener('input', () => desenharListaPasta1());

async function buscarFinalizados(): Promise<void> {
  const alvo = $('busca-resultado');
  alvo.replaceChildren();
  const termo = $<HTMLInputElement>('busca-finalizados').value;
  if (!termo.trim()) return;
  try {
    const achados = await api.clientesBuscar(termo);
    if (achados.length === 0) {
      const p = document.createElement('p');
      p.className = 'historico-vazio';
      p.textContent = 'Nenhum cliente com esse nome nos finalizados.';
      alvo.append(p);
    }
    if (achados.length > 0) {
      const t = document.createElement('h3');
      t.className = 'secao-titulo';
      t.textContent = `Finalizados encontrados (${achados.length})`;
      const grade = document.createElement('div');
      grade.className = 'grade-clientes';
      for (const c of achados) grade.append(linhaDoCliente(c));
      alvo.append(t, grade);
    }
  } catch (e) {
    mensagem(textoDoErro(e), true);
  }
}
$('buscar-finalizados').addEventListener('click', () => void buscarFinalizados());
$('busca-finalizados').addEventListener('keydown', (e) => {
  if ((e as KeyboardEvent).key === 'Enter') void buscarFinalizados();
});

// ---- alerta "arte para fazer" ----
let alertasNovos = 0;
function mostrarAlertaDeArte(nomes: string[]): void {
  alertasNovos += nomes.length;
  const badge = $('badge-cliente');
  badge.textContent = String(alertasNovos);
  badge.hidden = false;
  $('alerta-arte-nomes').textContent = nomes.join(', ');
  $('alerta-arte').hidden = false;
}
function irParaCliente(): void {
  $('alerta-arte').hidden = true;
  mostrarAba('pasta1');
}
$('alerta-arte-ver').addEventListener('click', irParaCliente);
$('alerta-arte-fechar').addEventListener('click', () => {
  $('alerta-arte').hidden = true;
});
api.aoArteParaFazer(mostrarAlertaDeArte);
api.aoAbrirCliente(irParaCliente);

for (const qual of ['pasta1', 'pasta2', 'pasta3', 'pasta4'] as const) {
  $(`escolher-${qual}`).addEventListener('click', () => {
    void api.designerEscolherPasta(qual).then((c) => {
      aplicarDesigner(c);
      void desenharPasta1();
    }, (e) => mensagem(textoDoErro(e), true));
  });
}
$('escolher-anuncios').addEventListener('click', () => {
  void api.designerEscolherPasta('pastaAnuncios').then((c) => aplicarDesigner(c), (e) => mensagem(textoDoErro(e), true));
});
$('procurar-anuncios').addEventListener('click', () => {
  const botao = $<HTMLButtonElement>('procurar-anuncios');
  botao.disabled = true;
  botao.textContent = 'Procurando…';
  void api.designerProcurarPastas(true, true).then(
    (r) => {
      aplicarDesigner(r.config);
      mensagem([r.achou > 0 ? 'Achei a pasta Anúncio 2027. Confira o caminho abaixo.' : 'Não achei a pasta Anúncio 2027.', ...r.avisos].join(' '), r.achou === 0 || r.avisos.length > 0);
    },
    (e) => mensagem(textoDoErro(e), true),
  ).finally(() => {
    botao.disabled = false;
    botao.textContent = 'Procurar sozinho';
  });
});
$('iniciar-windows').addEventListener('change', () => {
  const caixaIniciar = $<HTMLInputElement>('iniciar-windows');
  void api.iniciarComWindows(caixaIniciar.checked).then(
    (v) => {
      caixaIniciar.checked = v;
      mensagem(v ? 'O app vai abrir escondido junto com o Windows.' : 'O app não abre mais junto com o Windows.');
    },
    (e) => mensagem(textoDoErro(e), true),
  );
});
$('procurar-pastas').addEventListener('click', () => {
  const botao = $<HTMLButtonElement>('procurar-pastas');
  botao.disabled = true;
  botao.textContent = 'Procurando…';
  void api.designerProcurarPastas(true).then(
    async (r) => {
      aplicarDesigner(r.config);
      await desenharPasta1();
      const resumo = r.achou > 0 ? `Achei ${r.achou} ${r.achou === 1 ? 'pasta' : 'pastas'}. Confira os caminhos abaixo.` : 'Não achei nenhuma pasta.';
      mensagem([resumo, ...r.avisos].join(' '), r.achou === 0 || r.avisos.length > 0);
    },
    (e) => mensagem(textoDoErro(e), true),
  ).finally(() => {
    botao.disabled = false;
    botao.textContent = 'Procurar as pastas sozinho';
  });
});
$('testar-notificacao').addEventListener('click', () => {
  void api.notificacaoTestar().then(
    (r) => mensagem(r.suportada ? 'Mandei a notificação de teste. Se não apareceu, aperte Win+N: ela pode estar na Central de Notificações (modo Não perturbe).' : 'O Windows diz que não suporta notificações aqui; tentei o balão do ícone perto do relógio.', !r.suportada),
    (e) => mensagem(textoDoErro(e), true),
  );
});
$('atualizar-pasta1').addEventListener('click', () => void desenharPasta1());
// a lista se atualiza sozinha enquanto a aba está aberta
window.setInterval(() => {
  if (designer.designer && !$('pasta1').hidden) void desenharPasta1();
}, 60_000);

$('salvo-aprovar').addEventListener('click', () => {
  const botao = $<HTMLButtonElement>('salvo-aprovar');
  botao.disabled = true;
  void api.fluxoMover(paiDe(caminhoDoPdf)).then(
    (r) => {
      if (!r.ok) {
        $('salvo-detalhe').textContent = r.motivo;
        botao.disabled = false;
        return;
      }
      fecharSalvo();
      descartarRascunho(caminhoDoPdf);
      trabalhos.remover(caminhoDoPdf);
      idsDoHistorico.delete(caminhoDoPdf);
  geradasDoTrabalho.delete(caminhoDoPdf);
      irParaInicio();
      mensagem('Pasta enviada para Aprovar.');
    },
    (e) => {
      $('salvo-detalhe').textContent = textoDoErro(e);
      botao.disabled = false;
    },
  );
});

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
  salvarRascunho();
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
      salvarRascunho();
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

// Salvar: guarda o trabalho no Histórico (cores e ajustes), sem gerar imagem nem criar a pasta MKP.
$('salvar-app').addEventListener('click', async () => {
  if (!estado) return;
  guardarAtual();
  await registrarNoHistorico(0);
  mensagem('Trabalho salvo no app. Você encontra ele na aba Histórico.');
});

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
      const pronta: ExportCapa = { art: c.art, ...(c.ajuste ? { ajuste: c.ajuste } : {}), ...(c.back ? { back: versoDaFrente(c.back) as Raster } : {}), choices: c.choices };
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
          return { art: c.back, ...(c.ajusteVerso ? { ajuste: c.ajusteVerso } : {}), back: paraRazao(c.art, razaoDaFaixa(v.pack)), choices: escolhasDoVerso(v.pack, c.choices) };
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
      await registrarNoHistorico(r.written.length, true);
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
  $('reiniciar').addEventListener('click', () => {
    // mostra a tela de "atualizando" antes de fechar; o app reabre sozinho
    $('tela-atualizando').hidden = false;
    window.setTimeout(() => {
      void api.instalarAtualizacao().catch((e) => {
        $('tela-atualizando').hidden = true;
        mensagem(textoDoErro(e), true);
      });
    }, 1200);
  });
  mostrarAtualizacao(await api.estadoAtualizacao());
}

void iniciarAtualizacoes();
void iniciar();
