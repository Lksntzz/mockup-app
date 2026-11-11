import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createPreviewScheduler } from '../app/scheduler';
import { aplicarEscolhas, contarIgnoradas, descreverSaidas, formatarData, type EntradaHistorico, type Saidas } from '../app/historico';
import { copyToAll, createState, select, setColor, type AppState, type CapaState } from '../app/state';
import { abasVisiveis, ROTULOS, vizinha, type Modo } from '../app/abas';
import { escolhasDoVerso, paraRazao } from '../app/verso';
import { compose, isAvailable } from '../engine/compose';
import { exportAll, type ExportCapa, type ExportExtra } from '../export/exporter';
import type { Accessory, Choices, Pack, Raster } from '../engine/types';
import { cropMargins, cropToBox, widthForArt } from '../pdf/crop';
import { caixaDoMolde, ehPaginaA4 } from '../pdf/molde';
import { coverCrop, reduzir } from '../pdf/fit';
import { capaPageNumbers } from '../pdf/pages';
import { openPdf, PdfError } from '../pdf/reader';
import type { ArquivoPdf, EstadoAtualizacao, MockupApi } from './global';
import { criarTrabalhos } from '../app/trabalhos';
import type { Rascunho } from '../app/rascunhos';
import { avaliarQualidade, AREA_PADRAO_MM, LIMITES_PADRAO, pedidoDeNovaArte } from '../app/qualidade';
import type { ConfigDesigner } from '../main/config-designer';
import type { Cliente } from '../main/clientes';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.mjs', document.baseURI).href;

const api: MockupApi = (window as unknown as { mockupApi: MockupApi }).mockupApi;
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const NOMES: Record<Accessory, string> = { wireo: 'Wire-o', elastico: 'Elástico', tassel: 'Tassel' };
const ACESSORIOS: Accessory[] = ['wireo', 'elastico', 'tassel'];
/** Página cuja proporção difere mais que isso da capa do pacote ganha o aviso amarelo. */
const TOLERANCIA_DE_PROPORCAO = 0.1;

interface InfoDaCapa {
  pagina: number;
  /** Tamanho original da imagem (só para PNG/JPG); em PDF não é medido. */
  pixels?: { largura: number; altura: number };
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
async function lerArteDaPagina(doc: PdfAberto, n: number): Promise<Raster> {
  if (paginaInteiraAtual) {
    const molde = caixaDoMolde();
    const pagina = await doc.renderPage(n, widthForArt(1500, molde));
    if (ehPaginaA4(pagina.width, pagina.height)) return cropToBox(pagina, molde);
    // página que não é A4: o molde não está onde esperamos, então volta ao modo automático
  }
  const caixa = await doc.artBox(n);
  const pagina = await doc.renderPage(n, widthForArt(1200, caixa));
  return cropMargins(caixa ? cropToBox(pagina, caixa) : pagina);
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
    }
    estado = createState(pacote.pack, artes, versos);
    let aviso = '';
    if (retomada) {
      estado = aplicarEscolhas(estado, retomada.escolhas);
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
    $('nome-pdf').textContent = nome;
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
$('salvo-ok').addEventListener('click', () => {
  fecharSalvo();
  descartarRascunho(caminhoDoPdf);
  trabalhos.remover(caminhoDoPdf);
  idsDoHistorico.delete(caminhoDoPdf);
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
    await abrirPdf(arquivo, { escolhas: r.escolhas, saidas: r.saidas, selecionada: r.selecionada });
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
  $('nome-pdf').textContent = '';
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
    void api.designerEstado().then(aplicarDesigner, () => undefined);
    void api.operador().then((nome) => {
      $('operador').textContent = nome;
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

function saidasMarcadas(): Saidas {
  return {
    frente: caixa('saida-frente').checked,
    vt: caixa('saida-vt').checked,
    semCanguru: caixa('saida-sem-canguru').checked,
    verso: caixa('saida-verso').checked,
  };
}

async function registrarNoHistorico(geradas: number): Promise<void> {
  if (!estado) return;
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
    await abrirPdf(arquivo, { escolhas: entrada.escolhas, saidas: entrada.saidas, idHistorico: entrada.id });
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
    detalhe.textContent = `${formatarData(e.data)} · ${capas} · ${descreverSaidas(e.saidas)} · ${e.geradas} ${e.geradas === 1 ? 'imagem' : 'imagens'}`;
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

function mostrarAba(aba: 'novo' | 'historico' | 'pasta1'): void {
  if (aba === 'pasta1' && !designer.designer) aba = 'novo';
  const pagina = aba !== 'novo';
  document.querySelector<HTMLElement>('.area')!.hidden = pagina;
  $('paginas').hidden = !pagina;
  $('historico').hidden = aba !== 'historico';
  $('pasta1').hidden = aba !== 'pasta1';
  $('tab-novo').setAttribute('aria-pressed', String(aba === 'novo'));
  $('tab-historico').setAttribute('aria-pressed', String(aba === 'historico'));
  $('tab-pasta1').setAttribute('aria-pressed', String(aba === 'pasta1'));
  if (aba === 'historico') void desenharHistorico();
  if (aba === 'pasta1') {
    alertasNovos = 0;
    $('badge-cliente').hidden = true;
    void desenharPasta1();
  }
}
$('tab-novo').addEventListener('click', () => mostrarAba('novo'));
$('tab-historico').addEventListener('click', () => mostrarAba('historico'));
$('tab-pasta1').addEventListener('click', () => mostrarAba('pasta1'));

// ---- Modo designer (só aparece para quem liga; desligado por padrão) ----
let designer: ConfigDesigner = { designer: false };

const semBarra = (p: string) => p.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
const paiDe = (p: string) => p.slice(0, Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')));
const nomeDoCaminho = (p: string) => p.slice(Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')) + 1);

function aplicarDesigner(c: ConfigDesigner): void {
  designer = c;
  if (c.designer) void api.iniciarComWindowsEstado().then((v) => ($<HTMLInputElement>('iniciar-windows').checked = v), () => undefined);
  $('tab-pasta1').hidden = !c.designer;
  if (!c.designer && $('pasta1').hidden === false) mostrarAba('novo');
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
          if (r.achou > 0) mensagem(`Achei ${r.achou} ${r.achou === 1 ? 'pasta' : 'pastas'} do fluxo. Confira em "Pastas do fluxo".`);
        }
      }
      await desenharPasta1();
      giro.hidden = true;
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
    el.textContent = 'Qualidade medida só para imagens PNG/JPG. Em PDF ainda não é medida: confira a arte original.';
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
  nota.textContent = 'Estimativa: o tamanho da área e os limites ainda não foram calibrados.';
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
  linha.className = `cliente-linha${c.alteradoDepoisDoEnvio ? ' com-alteracao' : ''}`;

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
  if (c.alteradoDepoisDoEnvio) aviso('Alterado depois do envio: confira com a admin', 'alterado');
  if (avisos.childElementCount > 0) linha.append(avisos);

  // 4) ações
  const acoes = document.createElement('div');
  acoes.className = 'cc-acoes';
  const botao = (texto: string, classe: string, titulo: string, aoClicar: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = classe;
    b.textContent = texto;
    b.title = titulo;
    b.addEventListener('click', aoClicar);
    acoes.append(b);
  };
  if (c.alteradoDepoisDoEnvio) {
    botao('Já avisei a admin', 'secundario', 'Tira o aviso de alteração', () => {
      void api.fluxoConferido(c.caminho).then(
        () => desenharPasta1(),
        (e) => mensagem(textoDoErro(e), true),
      );
    });
  }
  // MKP pronto e arquivos já chegaram: dá para mandar a pasta para a Pasta 2 direto do card (com confirmação em 2 cliques)
  if (c.etapa === 1 && c.situacao === 'pronta-para-aprovar' && !c.chegando) {
    const destino = c.grupo ? `2 APROVAR / ${c.grupo}` : '2 APROVAR';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'primario';
    b.textContent = 'Enviar para Aprovar';
    b.title = `Move a pasta do cliente para ${destino}`;
    let pedindo = false;
    let timer = 0;
    const normal = () => {
      pedindo = false;
      b.textContent = 'Enviar para Aprovar';
      b.classList.remove('confirmando');
    };
    b.addEventListener('click', () => {
      if (!pedindo) {
        pedindo = true;
        b.textContent = `Confirmar: mover para ${destino}`;
        b.classList.add('confirmando');
        timer = window.setTimeout(normal, 6000);
        return;
      }
      window.clearTimeout(timer);
      b.disabled = true;
      void api.fluxoMover(c.caminho).then(
        async (r) => {
          if (!r.ok) {
            mensagem(r.motivo, true);
            b.disabled = false;
            normal();
            return;
          }
          mensagem(`${c.nome} enviada para Aprovar.`);
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
  for (const n of [1, 2, 3, 4] as const) $(`caminho-pasta${n}`).textContent = designer[`pasta${n}`] ?? 'não escolhida';
  const avisos = $('pasta1-avisos');
  avisos.replaceChildren();
  alvo.replaceChildren();
  const texto = (onde: HTMLElement, t: string) => {
    const p = document.createElement('p');
    p.className = 'historico-vazio';
    p.textContent = t;
    onde.append(p);
  };
  if (!designer.pasta1) return texto(alvo, 'Abra "Pastas do fluxo" e escolha a Pasta 1 para ver os clientes.');
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
      await registrarNoHistorico(r.written.length);
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
