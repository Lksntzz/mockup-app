import { blendOver } from './blend';
import { compose } from './compose';
import type { Choices, Pack, Raster, StackLayer } from './types';

/**
 * Agenda aberta: as duas páginas do miolo, uma arte em cada lado, com um só conjunto de argolas na lombada.
 *
 * Não existe PSD dessa cena. O que se faz é reaproveitar o pacote do verso (página vista por trás, argolas à direita):
 * a página da esquerda sai como está, a da direita é espelhada em volta do eixo da lombada, as duas se multiplicam
 * e as argolas (só a parte metálica escura) são coladas de novo, simétricas, nos dois lados do eixo.
 * Só funciona com wire-o preto: as argolas são achadas pelo escuro do metal.
 */

/** Eixo da lombada no mockup do verso (px do canvas de 1200). */
const EIXO = 855;
const DESLOCAMENTO = 2 * EIXO - 1199;
const FOLGA_LATERAL = 30;
/** Faixas (linhas) onde ficam as argolas, e as colunas que elas ocupam, no mockup do verso. */
const LINHAS_DAS_ARGOLAS: [number, number][] = [
  [190, 470],
  [760, 1020],
];
const COLUNAS_DAS_ARGOLAS: [number, number] = [790, 910];
const LIMIAR_DA_ARGOLA = 0.05;
/** Coluna onde começa a argola no mockup do verso, e quantas colunas dela são coladas de cada lado do eixo. */
const COLUNA_INICIAL_DA_ARGOLA = 814;
const COLUNAS_COLADAS = 48;

/** Até onde (fração da largura da arte) o conteúdo pode chegar sem ficar debaixo dos furos do wire-o. */
const LIMITE_DA_LOMBADA = 1527 / 1772;
/** Linha (fração da altura da arte) em que o centro do conteúdo é colocado ao recuar. */
const CENTRO_VERTICAL = 1240 / 2480;
const LIMIAR_DE_TINTA = 235;

export const ESCALA_PADRAO = 1.17;

const ESCOLHAS: Choices = { wireo: 'preto', elastico: 'nenhum', tassel: 'nenhum' };

export interface CaixaDeTinta {
  x0: number;
  y0: number;
  /** Último pixel com tinta (inclusive). */
  x1: number;
  y1: number;
}

/** Corta a página dupla ao meio. Largura ímpar: a coluna do meio fica de fora. */
export function dividirAoMeio(r: Raster): { esq: Raster; dir: Raster } {
  const w = Math.floor(r.width / 2);
  const recorte = (x0: number): Raster => {
    const out: Raster = { width: w, height: r.height, data: new Uint8ClampedArray(w * r.height * 4) };
    for (let y = 0; y < r.height; y++) out.data.set(r.data.subarray((y * r.width + x0) * 4, (y * r.width + x0 + w) * 4), y * w * 4);
    return out;
  };
  return { esq: recorte(0), dir: recorte(r.width - w) };
}

export function espelhar(r: Raster): Raster {
  const out: Raster = { width: r.width, height: r.height, data: new Uint8ClampedArray(r.data.length) };
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      const de = (y * r.width + x) * 4;
      const para = (y * r.width + (r.width - 1 - x)) * 4;
      out.data[para] = r.data[de] as number;
      out.data[para + 1] = r.data[de + 1] as number;
      out.data[para + 2] = r.data[de + 2] as number;
      out.data[para + 3] = r.data[de + 3] as number;
    }
  }
  return out;
}

/** Caixa de tudo que não é papel branco (pixel transparente conta como papel). Página em branco: null. */
export function medirTinta(r: Raster): CaixaDeTinta | null {
  let x0 = r.width;
  let y0 = r.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      const i = (y * r.width + x) * 4;
      if ((r.data[i + 3] as number) < 8) continue;
      const lum = ((r.data[i] as number) + (r.data[i + 1] as number) + (r.data[i + 2] as number)) / 3;
      if (lum >= LIMIAR_DE_TINTA) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Redimensiona com filtro triangular (média ponderada quando reduz): bom para texto fino. Alfa fica como está (opaco). */
export function redimensionar(r: Raster, largura: number, altura: number): Raster {
  const horizontal = reamostrar(r, largura, r.height, true);
  return reamostrar(horizontal, largura, altura, false);
}

function reamostrar(r: Raster, w: number, h: number, nasColunas: boolean): Raster {
  const origem = nasColunas ? r.width : r.height;
  const destino = nasColunas ? w : h;
  if (origem === destino) return r;
  const escala = origem / destino;
  const apoio = Math.max(1, escala);
  const out: Raster = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  const pesos: { ini: number; p: Float32Array }[] = [];
  for (let d = 0; d < destino; d++) {
    const centro = (d + 0.5) * escala;
    const ini = Math.max(0, Math.floor(centro - apoio));
    const fim = Math.min(origem - 1, Math.ceil(centro + apoio) - 1);
    const p = new Float32Array(Math.max(1, fim - ini + 1));
    let soma = 0;
    for (let i = ini; i <= fim; i++) {
      const v = Math.max(0, 1 - Math.abs(i + 0.5 - centro) / apoio);
      p[i - ini] = v;
      soma += v;
    }
    if (soma === 0) {
      p[0] = 1;
      soma = 1;
    }
    for (let i = 0; i < p.length; i++) p[i] = (p[i] as number) / soma;
    pesos.push({ ini, p });
  }
  if (nasColunas) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const { ini, p } = pesos[x] as { ini: number; p: Float32Array };
        let c0 = 0;
        let c1 = 0;
        let c2 = 0;
        let c3 = 0;
        for (let k = 0; k < p.length; k++) {
          const i = (y * r.width + ini + k) * 4;
          const pk = p[k] as number;
          c0 += (r.data[i] as number) * pk;
          c1 += (r.data[i + 1] as number) * pk;
          c2 += (r.data[i + 2] as number) * pk;
          c3 += (r.data[i + 3] as number) * pk;
        }
        out.data.set([c0, c1, c2, c3], (y * w + x) * 4);
      }
    }
  } else {
    for (let y = 0; y < h; y++) {
      const { ini, p } = pesos[y] as { ini: number; p: Float32Array };
      for (let x = 0; x < w; x++) {
        let c0 = 0;
        let c1 = 0;
        let c2 = 0;
        let c3 = 0;
        for (let k = 0; k < p.length; k++) {
          const i = ((ini + k) * r.width + x) * 4;
          const pk = p[k] as number;
          c0 += (r.data[i] as number) * pk;
          c1 += (r.data[i + 1] as number) * pk;
          c2 += (r.data[i + 2] as number) * pk;
          c3 += (r.data[i + 3] as number) * pk;
        }
        out.data.set([c0, c1, c2, c3], (y * w + x) * 4);
      }
    }
  }
  return out;
}

function branca(w: number, h: number): Raster {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) };
}

/** Cola `src` (opaco) no `dst`, com o canto em (x, y); o que sai do quadro é cortado. */
function colar(dst: Raster, src: Raster, x: number, y: number): void {
  for (let sy = 0; sy < src.height; sy++) {
    const dy = y + sy;
    if (dy < 0 || dy >= dst.height) continue;
    const x0 = Math.max(0, x);
    const x1 = Math.min(dst.width, x + src.width);
    if (x1 <= x0) continue;
    dst.data.set(src.data.subarray((sy * src.width + (x0 - x)) * 4, (sy * src.width + (x1 - x)) * 4), (dy * dst.width + x0) * 4);
  }
}

/**
 * O miolo desenhado até a borda da página ficaria debaixo dos furos do wire-o. Recua as duas artes (já com a da
 * direita espelhada, lombada à direita) para o conteúdo terminar antes dos furos, com a mesma folga nas duas páginas.
 * Escala única (para as letras ficarem do mesmo tamanho), nunca amplia, e o conteúdo é centralizado na vertical.
 * Arte que já respeita a folga volta como veio.
 */
export function ajustarMargemDaLombada(esq: Raster, dirEspelhada: Raster): { esq: Raster; dir: Raster; escala: number } {
  const te = medirTinta(esq);
  const td = medirTinta(dirEspelhada);
  const limite = Math.round(LIMITE_DA_LOMBADA * esq.width);
  const direita = Math.max(te ? te.x1 + 1 : 0, td ? td.x1 + 1 : 0);
  if (direita <= limite) return { esq, dir: dirEspelhada, escala: 1 };
  const escala = limite / direita;
  const refaz = (arte: Raster, t: CaixaDeTinta | null): Raster => {
    if (!t) return arte;
    const w = Math.round(arte.width * escala);
    const h = Math.round(arte.height * escala);
    const menor = redimensionar(arte, w, h);
    const x = Math.round(limite - (t.x1 + 1) * escala);
    const y = Math.round(CENTRO_VERTICAL * arte.height - ((t.y0 + t.y1 + 1) / 2) * escala);
    const out = branca(arte.width, arte.height);
    colar(out, menor, x, y);
    return out;
  };
  return { esq: refaz(esq, te), dir: refaz(dirEspelhada, td), escala };
}

/** Os dois pacotes de páginas: com as argolas do verso e sem elas (e sem as marcas, que entram uma vez só no fim). */
export function pacotesDaAgendaAberta(verso: Pack): { comAneis: Pack; semAneis: Pack; marcas: StackLayer[] } {
  const marcas = verso.stack.filter((c) => c.id.startsWith('marca-'));
  const base = verso.stack.filter((c) => !c.id.startsWith('marca-') && c.variant === undefined);
  const extras = new Map(verso.stack.filter((c) => c.variant === 'aberta-dados').map((c) => [c.id, c.file as string]));
  for (const id of ['aberta-luz-01', 'aberta-luz-02', 'aberta-mascara']) {
    if (!extras.has(id)) throw new Error(`o pacote do verso não tem a camada ${id} (agenda aberta)`);
  }
  const semAneis = base
    .filter((c) => !c.id.startsWith('wireo-'))
    .map((c) => {
      if (c.id === 'shadow') return { ...c, file: extras.get('aberta-luz-01') as string };
      if (c.id === 'light') return { ...c, file: extras.get('aberta-luz-02') as string };
      return c;
    });
  return {
    comAneis: { ...verso, stack: base },
    semAneis: { ...verso, artMask: { ...verso.artMask, file: extras.get('aberta-mascara') as string }, stack: semAneis },
    marcas,
  };
}

// ---- trabalho em planos de ponto flutuante ----

type Plano = Float32Array;

function maximoQuadrado(src: Plano, w: number, h: number, tamanho: number): Plano {
  const r = Math.floor(tamanho / 2);
  const meio = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.max(m, src[y * w + k] as number);
      meio[y * w + x] = m;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.max(m, meio[k * w + x] as number);
      out[y * w + x] = m;
    }
  }
  return out;
}

function desfoque(src: Plano, w: number, h: number, sigma: number): Plano {
  const raio = Math.max(1, Math.ceil(sigma * 3));
  const nucleo = new Float32Array(raio * 2 + 1);
  let soma = 0;
  for (let i = -raio; i <= raio; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    nucleo[i + raio] = v;
    soma += v;
  }
  for (let i = 0; i < nucleo.length; i++) nucleo[i] = (nucleo[i] as number) / soma;
  const meio = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -raio; i <= raio; i++) s += (src[y * w + Math.min(w - 1, Math.max(0, x + i))] as number) * (nucleo[i + raio] as number);
      meio[y * w + x] = s;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -raio; i <= raio; i++) s += (meio[Math.min(h - 1, Math.max(0, y + i)) * w + x] as number) * (nucleo[i + raio] as number);
      out[y * w + x] = s;
    }
  }
  return out;
}

const suave = (mascara: Plano, w: number, h: number, tamanho: number, sigma: number): Plano => desfoque(maximoQuadrado(mascara, w, h, tamanho), w, h, sigma);

export interface OpcoesDaAgendaAberta {
  /** Quanto a agenda cresce em relação ao enquadramento justo da cena (1 = justo). */
  escala?: number;
  /** Linha em que o livro começa. Sem ela, o livro fica centralizado na vertical. */
  topo?: number;
}

export interface AgendaAberta {
  imagem: Raster;
  /** Coluna do eixo da lombada na imagem final. */
  lombadaX: number;
  /** Primeira e última linha do livro na imagem final. */
  livroY: { topo: number; base: number };
}

/**
 * Monta a cena. `esq` e `dir` são as duas páginas como o leitor vê (a da direita NÃO vem espelhada).
 * `pack`/`layers` são os do verso.
 */
export function montarAgendaAberta(pack: Pack, layers: Map<string, Raster>, esq: Raster, dir: Raster, opcoes: OpcoesDaAgendaAberta = {}): AgendaAberta {
  const escalaFinal = opcoes.escala ?? ESCALA_PADRAO;
  const { comAneis, semAneis, marcas } = pacotesDaAgendaAberta(pack);
  const lado = pack.artSize;
  const paraArte = (r: Raster): Raster => (r.width === lado.width && r.height === lado.height ? r : redimensionar(r, lado.width, lado.height));
  const ajustadas = ajustarMargemDaLombada(paraArte(esq), paraArte(espelhar(dir)));

  const W = pack.canvas.width;
  const H = pack.canvas.height;
  const esqCom = compose(comAneis, layers, ajustadas.esq, ESCOLHAS);
  const esqSem = compose(semAneis, layers, ajustadas.esq, ESCOLHAS);
  const dirCom = compose(comAneis, layers, ajustadas.dir, ESCOLHAS);
  const dirSem = compose(semAneis, layers, ajustadas.dir, ESCOLHAS);

  // onde as argolas estão: diferença entre a página com e sem argolas, só nas faixas delas
  const mascaraDe = (com: Raster, sem: Raster): Plano => {
    const m = new Float32Array(W * H);
    for (const [ya, yb] of LINHAS_DAS_ARGOLAS) {
      for (let y = ya; y < Math.min(yb, H); y++) {
        for (let x = COLUNAS_DAS_ARGOLAS[0]; x < Math.min(COLUNAS_DAS_ARGOLAS[1], W); x++) {
          const i = (y * W + x) * 4;
          const d = Math.max(Math.abs((com.data[i] as number) - (sem.data[i] as number)), Math.abs((com.data[i + 1] as number) - (sem.data[i + 1] as number)), Math.abs((com.data[i + 2] as number) - (sem.data[i + 2] as number)));
          if (d / 255 > LIMIAR_DA_ARGOLA) m[y * W + x] = 1;
        }
      }
    }
    return m;
  };
  const mEsq = mascaraDe(esqCom, esqSem);
  const mDir = mascaraDe(dirCom, dirSem);
  const sEsq = suave(mEsq, W, H, 5, 1.2);
  const sDir = suave(mDir, W, H, 5, 1.2);

  // cena em largura: página esquerda como está + página direita espelhada em volta do eixo, multiplicadas
  const Wd = W + DESLOCAMENTO + 60;
  const ox = FOLGA_LATERAL;
  const cena = new Float32Array(Wd * H * 3).fill(1);
  const valor = (com: Raster, sem: Raster, s: Plano, x: number, y: number, c: number): number => {
    const k = s[y * W + x] as number;
    return (((com.data[(y * W + x) * 4 + c] as number) * (1 - k) + (sem.data[(y * W + x) * 4 + c] as number) * k) / 255);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let c = 0; c < 3; c++) {
        const a = valor(esqCom, esqSem, sEsq, x, y, c);
        const xr = W - 1 - x; // coluna da página da direita que cai neste ponto, depois do espelho
        const b = valor(dirCom, dirSem, sDir, xr, y, c);
        cena[(y * Wd + ox + x) * 3 + c] = (cena[(y * Wd + ox + x) * 3 + c] as number) * a;
        cena[(y * Wd + ox + DESLOCAMENTO + x) * 3 + c] = (cena[(y * Wd + ox + DESLOCAMENTO + x) * 3 + c] as number) * b;
      }
    }
  }

  // argolas: o metal escuro da página da esquerda, colado dos dois lados do eixo
  const alfaArgola = (() => {
    const fino = suave(mEsq, W, H, 3, 0.4);
    const a = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const lum = ((esqCom.data[i] as number) + (esqCom.data[i + 1] as number) + (esqCom.data[i + 2] as number)) / 3 / 255;
        const escuro = Math.min(1, Math.max(0, (0.78 - lum) / 0.3));
        a[y * W + x] = Math.min(1, fino[y * W + x] as number) * escuro;
      }
    }
    return desfoque(a, W, H, 0.5);
  })();
  for (let c = 0; c < COLUNAS_COLADAS; c++) {
    const sc = COLUNA_INICIAL_DA_ARGOLA + c;
    for (const dd of [ox + EIXO - COLUNAS_COLADAS + c, ox + EIXO + (COLUNAS_COLADAS - 1 - c)]) {
      for (let y = 0; y < H; y++) {
        const a = alfaArgola[y * W + sc] as number;
        if (a <= 0) continue;
        for (let k = 0; k < 3; k++) {
          const i = (y * Wd + dd) * 3 + k;
          cena[i] = (cena[i] as number) * (1 - a) + ((esqCom.data[(y * W + sc) * 4 + k] as number) / 255) * a;
        }
      }
    }
  }

  // enquadra: caixa do que não é branco, escala até a largura desejada, centraliza na horizontal
  let cx0 = Wd;
  let cx1 = -1;
  let cy0 = H;
  let cy1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < Wd; x++) {
      const i = (y * Wd + x) * 3;
      if ((cena[i] as number) < 0.995 || (cena[i + 1] as number) < 0.995 || (cena[i + 2] as number) < 0.995) {
        if (x < cx0) cx0 = x;
        if (x > cx1) cx1 = x;
        if (y < cy0) cy0 = y;
        if (y > cy1) cy1 = y;
      }
    }
  }
  if (cx1 < 0) throw new Error('a agenda aberta saiu em branco');
  cx0 = Math.max(cx0 - 20, 0);
  cx1 = Math.min(cx1 + 20, Wd - 1);
  cy0 = Math.max(cy0 - 20, 0);
  cy1 = Math.min(cy1 + 20, H - 1);
  const cw = cx1 - cx0 + 1;
  const ch = cy1 - cy0 + 1;
  const recorte: Raster = { width: cw, height: ch, data: new Uint8ClampedArray(cw * ch * 4) };
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = ((cy0 + y) * Wd + cx0 + x) * 3;
      const j = (y * cw + x) * 4;
      recorte.data[j] = Math.round((cena[i] as number) * 255);
      recorte.data[j + 1] = Math.round((cena[i + 1] as number) * 255);
      recorte.data[j + 2] = Math.round((cena[i + 2] as number) * 255);
      recorte.data[j + 3] = 255;
    }
  }
  const alvoW = Math.round(W * escalaFinal);
  const alvoH = Math.round((ch * alvoW) / cw);
  const grande = redimensionar(recorte, alvoW, alvoH);
  const fator = alvoW / cw;
  const corteX = Math.floor((alvoW - W) / 2);
  const lombadaX = (ox + EIXO - cx0) * fator - corteX;

  // linhas do livro: o que é mais escuro que o papel (limiar 0,95 pega a página, não o brilho da capa), na largura visível
  let topoLivro = -1;
  let baseLivro = -1;
  for (let y = 0; y < alvoH; y++) {
    for (let x = Math.max(0, corteX); x < Math.min(alvoW, corteX + W); x++) {
      const i = (y * alvoW + x) * 4;
      if (((grande.data[i] as number) + (grande.data[i + 1] as number) + (grande.data[i + 2] as number)) / 3 < 0.95 * 255) {
        if (topoLivro < 0) topoLivro = y;
        baseLivro = y;
        break;
      }
    }
  }
  if (topoLivro < 0) throw new Error('não achei o livro na imagem');
  const alturaDoLivro = baseLivro - topoLivro + 1;
  const topoFinal = opcoes.topo ?? Math.round((H - alturaDoLivro) / 2);
  const y = topoFinal - topoLivro;

  const imagem = branca(W, H);
  colar(imagem, grande, -corteX, y);
  for (const m of marcas) {
    if (!m.file) continue;
    const camada = layers.get(m.file);
    if (!camada) throw new Error(`falta a camada ${m.file}`);
    blendOver(imagem, camada, m.offset, m.opacity, m.blend);
  }
  return { imagem, lombadaX, livroY: { topo: topoFinal, base: topoFinal + alturaDoLivro - 1 } };
}
