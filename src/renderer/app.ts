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

/** Renderiza a página e fica só com a arte (sem margens nem o fundo esticado de alguns PDFs). */
async function lerArteDaPagina(doc: PdfAberto, n: number): Promise<Raster> {
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
  $('inicio-novo').hidden = aba !== 'novo';
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
  const linha = document.createElement('div');
  linha.className = 'cliente-linha';
  const topo = document.createElement('div');
  topo.className = 'topo-linha';
  const nome = document.createElement('span');
  nome.className = 'nome';
  nome.textContent = c.grupo ? `${c.grupo} · ${c.nome}` : c.nome;
  topo.append(nome);
  const nota = (texto: string) => {
    const e = document.createElement('span');
    e.className = 'chegando';
    e.textContent = texto;
    topo.append(e);
  };
  if (c.duplicado) nota('mesmo nome em mais de uma etapa');
  if (c.chegando) nota('chegando… (arquivos ainda sendo enviados)');
  if (c.etapa === 1 && c.artes.length === 0) nota('sem PDF/JPG/PNG na pasta');
  for (const arte of c.artes) {
    if (c.etapa !== 1) break;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'primario';
    b.textContent = c.artes.length === 1 ? 'Abrir no MKP' : `Abrir ${nomeDoCaminho(arte)}`;
    b.title = nomeDoCaminho(arte);
    b.addEventListener('click', () => {
      void (async () => {
        try {
          const arquivo = await api.lerPdf(arte);
          mostrarAba('novo');
          await abrirPdf(arquivo);
        } catch (e) {
          mensagem(textoDoErro(e), true);
        }
      })();
    });
    topo.append(b);
  }
  linha.append(topo);
  const abrivel = c.arquivos.filter((n) => /\.(cdr|pdf)$/i.test(n));
  if (abrivel.length > 0) {
    const acoes = document.createElement('div');
    acoes.className = 'topo-linha';
    for (const nomeArq of abrivel) {
      const ehCdr = /\.cdr$/i.test(nomeArq);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'secundario';
      b.textContent = abrivel.length <= 2 && abrivel.filter((n) => /\.cdr$/i.test(n) === ehCdr).length === 1 ? (ehCdr ? 'Abrir no Corel' : 'Abrir PDF') : `${ehCdr ? 'Corel' : 'PDF'}: ${nomeArq}`;
      b.title = nomeArq;
      b.addEventListener('click', () => {
        const sep = c.caminho.includes('\\') ? '\\' : '/';
        void api.abrirArquivoCliente(`${c.caminho}${sep}${nomeArq}`).then(
          (r) => mensagem(r.ok ? `Abrindo ${nomeArq}…` : r.motivo, !r.ok),
          (e) => mensagem(textoDoErro(e), true),
        );
      });
      acoes.append(b);
    }
    linha.append(acoes);
  }
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
  if (c.etapa === 1) {
    const s = document.createElement('div');
    s.className = 'situacao';
    s.textContent =
      c.situacao === 'arte-a-fazer' ? 'Arte para fazer o MKP' : c.situacao === 'pronta-para-aprovar' ? 'Pronta para enviar para Aprovar' : `Em andamento: falta ${c.faltando.join(', ')}`;
    linha.append(s);
  }
  if (c.arquivos.length > 0) {
    const f = document.createElement('div');
    f.className = 'arquivos';
    f.textContent = `${c.arquivos.length} ${c.arquivos.length === 1 ? 'arquivo' : 'arquivos'}: ${c.arquivos.join(' · ')}`;
    f.title = c.arquivos.join('\n');
    linha.append(f);
  }
  return linha;
}

async function desenharPasta1(): Promise<void> {
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
    return texto(alvo, textoDoErro(e));
  }
  for (const a of resultado.avisos) texto(avisos, a);
  if (resultado.clientes.length === 0) return texto(alvo, 'Nenhum cliente nas Pastas 1, 2 e 3.');
  for (const c of resultado.clientes) alvo.append(linhaDoCliente(c));
}

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
    for (const c of achados) alvo.append(linhaDoCliente(c));
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
  if (document.body.dataset.estado === 'pronto') {
    guardarAtual();
    irParaInicio();
  }
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
  $('reiniciar').addEventListener('click', () => void api.instalarAtualizacao());
  mostrarAtualizacao(await api.estadoAtualizacao());
}

void iniciarAtualizacoes();
void iniciar();
