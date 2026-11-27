import { dividirAoMeio, montarAgendaAberta } from '../engine/aberta';
import type { Pack, Raster } from '../engine/types';
import { COR_DA_CAUDA, COR_DA_PONTA, COR_DO_TITULO, TAMANHO_DO_TITULO, geometriaDaDecoracao } from './aberta';

interface CanvasLike {
  width: number;
  height: number;
  getContext(tipo: '2d'): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
/** Cria um canvas (o do navegador no app; o @napi-rs/canvas nos testes). */
export type CriarCanvas = (largura: number, altura: number) => CanvasLike;

/** Com título ou seta, o livro desce para dar lugar a eles. */
export const TOPO_COM_DECORACAO = 291;
/** Fontes do Windows e do Mac, fina primeiro; nenhuma é copiada para o programa. */
const FONTE_DO_TITULO = '"Segoe UI", "Helvetica Neue", "Inter Display", Inter, Arial, sans-serif';

/** Escreve o título e desenha a seta turquesa em cima da imagem (devolve uma imagem nova). */
export function decorar(r: Raster, lombadaX: number, topoDoLivro: number, titulo: string, seta: boolean, criarCanvas: CriarCanvas): Raster {
  if (!titulo && !seta) return r;
  const canvas = criarCanvas(r.width, r.height);
  const ctx = canvas.getContext('2d');
  const entrada = ctx.createImageData(r.width, r.height);
  entrada.data.set(r.data);
  ctx.putImageData(entrada, 0, 0);
  const g = geometriaDaDecoracao(lombadaX, topoDoLivro);
  if (seta) {
    const degrade = ctx.createLinearGradient(g.seta.gradiente.de[0], g.seta.gradiente.de[1], g.seta.gradiente.para[0], g.seta.gradiente.para[1]);
    degrade.addColorStop(0, COR_DA_CAUDA);
    degrade.addColorStop(1, COR_DA_PONTA);
    ctx.fillStyle = degrade;
    for (const contorno of [g.seta.corpo, g.seta.ponta]) {
      ctx.beginPath();
      contorno.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      ctx.fill();
    }
  }
  if (titulo) {
    ctx.fillStyle = COR_DO_TITULO;
    ctx.font = `300 ${TAMANHO_DO_TITULO}px ${FONTE_DO_TITULO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(titulo, g.titulo.x, g.titulo.y);
  }
  const img = ctx.getImageData(0, 0, r.width, r.height);
  return { width: r.width, height: r.height, data: new Uint8ClampedArray(img.data) };
}

export interface OpcoesDaImagem {
  titulo: string;
  seta: boolean;
}

/**
 * Da página dupla do miolo (as duas páginas lado a lado, como numa A4 deitada) à imagem final da agenda aberta:
 * corta ao meio, monta a cena com o pacote do verso e põe título e seta.
 */
export function imagemDaAgendaAberta(verso: { pack: Pack; layers: Map<string, Raster> }, paginaDupla: Raster, opcoes: OpcoesDaImagem, criarCanvas: CriarCanvas): Raster {
  const { esq, dir } = dividirAoMeio(paginaDupla);
  const decorada = opcoes.titulo !== '' || opcoes.seta;
  const r = montarAgendaAberta(verso.pack, verso.layers, esq, dir, decorada ? { topo: TOPO_COM_DECORACAO } : {});
  return decorar(r.imagem, r.lombadaX, r.livroY.topo, opcoes.titulo, opcoes.seta, criarCanvas);
}
