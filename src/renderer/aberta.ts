import { paginaDuplaValida, paginaPadraoDoMiolo, tituloLimpo, TITULO_PADRAO } from '../app/aberta';
import { imagemDaAgendaAberta } from '../app/aberta-imagem';
import type { Pack, Raster } from '../engine/types';
import { openPdf, type PdfDocument } from '../pdf/reader';
import type { ArquivoPdf, MockupApi } from './global';

/** Largura com que a página do miolo (duas páginas lado a lado) é desenhada: cada metade fica com cerca de 1750 px. */
const LARGURA_DA_PAGINA_DUPLA = 3508;
const criarCanvas = (largura: number, altura: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = largura;
  c.height = altura;
  return c;
};

interface Deps {
  api: MockupApi;
  carregarVerso: () => Promise<{ pack: Pack; layers: Map<string, Raster> }>;
  mensagem: (texto: string, erro?: boolean) => void;
  textoDoErro: (e: unknown) => string;
}

export interface AgendaAbertaNaTela {
  /** A caixa "Agenda aberta" está marcada. */
  marcada(): boolean;
  /** Por que ainda não dá para gerar (ex.: falta escolher o PDF do miolo); null quando está tudo pronto. */
  faltando(): string | null;
  /** Monta a imagem (leva alguns segundos). */
  gerar(): Promise<Raster>;
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export function iniciarAgendaAberta(deps: Deps): AgendaAbertaNaTela {
  const caixa = $<HTMLInputElement>('saida-aberta');
  const opcoes = $('aberta-opcoes');
  const rotuloDoArquivo = $('aberta-arquivo');
  const campoPagina = $<HTMLInputElement>('aberta-pagina');
  const campoTitulo = $<HTMLInputElement>('aberta-titulo');
  const caixaSeta = $<HTMLInputElement>('aberta-seta');
  let miolo: { arquivo: ArquivoPdf; paginas: number } | null = null;
  campoTitulo.value = TITULO_PADRAO;

  const mostrarOpcoes = (): void => {
    opcoes.hidden = !caixa.checked;
  };
  caixa.addEventListener('change', mostrarOpcoes);
  mostrarOpcoes();

  $('aberta-escolher').addEventListener('click', async () => {
    try {
      const arquivo = await deps.api.escolherPdf();
      if (!arquivo) return;
      const doc: PdfDocument = await openPdf(arquivo.bytes);
      miolo = { arquivo, paginas: doc.pageCount };
      rotuloDoArquivo.textContent = `${arquivo.nome} (${doc.pageCount} ${doc.pageCount === 1 ? 'página' : 'páginas'})`;
      campoPagina.value = String(paginaPadraoDoMiolo(doc.pageCount));
      campoPagina.max = String(doc.pageCount);
      deps.mensagem('');
    } catch (e) {
      deps.mensagem(deps.textoDoErro(e), true);
    }
  });

  const faltando = (): string | null => {
    if (!miolo) return 'Escolha o PDF do miolo para a agenda aberta.';
    const pagina = Number(campoPagina.value);
    if (!Number.isInteger(pagina) || pagina < 1 || pagina > miolo.paginas) return `Escolha uma página do miolo de 1 a ${miolo.paginas}.`;
    return null;
  };

  const gerar = async (): Promise<Raster> => {
    const motivo = faltando();
    if (motivo || !miolo) throw new Error(motivo ?? 'Escolha o PDF do miolo.');
    const verso = await deps.carregarVerso();
    const doc = await openPdf(miolo.arquivo.bytes);
    const dupla = await doc.renderPage(Number(campoPagina.value), LARGURA_DA_PAGINA_DUPLA);
    if (!paginaDuplaValida(dupla.width, dupla.height)) {
      throw new Error('Essa página do miolo é em pé. Escolha a página que tem as duas páginas lado a lado (como uma A4 deitada).');
    }
    return imagemDaAgendaAberta(verso, dupla, { titulo: tituloLimpo(campoTitulo.value), seta: caixaSeta.checked }, criarCanvas);
  };

  // prévia: mesma imagem que sai na exportação
  const tela = $('tela-aberta');
  const quadro = $<HTMLCanvasElement>('aberta-canvas');
  const botaoPrevia = $<HTMLButtonElement>('aberta-previa');
  botaoPrevia.addEventListener('click', async () => {
    const motivo = faltando();
    if (motivo) {
      deps.mensagem(motivo, true);
      return;
    }
    botaoPrevia.disabled = true;
    deps.mensagem('Montando a prévia da agenda aberta…');
    try {
      const r = await gerar();
      quadro.width = r.width;
      quadro.height = r.height;
      (quadro.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
      tela.hidden = false;
      deps.mensagem('');
    } catch (e) {
      deps.mensagem(deps.textoDoErro(e), true);
    } finally {
      botaoPrevia.disabled = false;
    }
  });
  $('aberta-fechar').addEventListener('click', () => {
    tela.hidden = true;
  });

  return { marcada: () => caixa.checked, faltando, gerar };
}
