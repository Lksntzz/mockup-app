import type { InfoDoVideo } from './info';

export type Formato = 'mp4' | 'webm' | 'mov' | 'mp3';
export type Nivel = 'original' | 'medio' | 'pequeno';
export type Tamanho = { tipo: 'nivel'; nivel: Nivel } | { tipo: 'maximo'; mb: number };
export interface Pedido {
  formato: Formato;
  tamanho: Tamanho;
}

export interface Plano {
  ok: true;
  modo: 'copiar' | 'reconverter';
  formato: Formato;
  video: { codec: 'libx264' | 'libvpx-vp9'; crf?: number; kbps?: number; ladoMenorMax?: number } | null;
  audio: { codec: 'aac' | 'libopus' | 'libmp3lame'; kbps: number } | null;
  /** Tamanho final aproximado; null quando a duração é desconhecida. */
  estimativaBytes: number | null;
  aviso?: string;
}
export type ResultadoDoPlano = Plano | { ok: false; motivo: string };

const MB = 1048576;
/** Os três níveis. CRF é o "quanto de qualidade guardar": menor = melhor e maior. Valores calibrados com um vídeo de iPhone (1440×2560, 26 s). */
const NIVEIS: Record<Nivel, { crfX264: number; crfVp9: number; ladoMenorMax?: number; audioKbps: number; mp3Kbps: number }> = {
  original: { crfX264: 23, crfVp9: 31, audioKbps: 160, mp3Kbps: 192 },
  medio: { crfX264: 28, crfVp9: 36, ladoMenorMax: 1080, audioKbps: 128, mp3Kbps: 128 },
  pequeno: { crfX264: 32, crfVp9: 40, ladoMenorMax: 720, audioKbps: 96, mp3Kbps: 96 },
};
const BITS_POR_PIXEL_NO_CRF_23 = 0.061; // medido: 22,6 MB no vídeo de teste; cada +6 de CRF corta a taxa pela metade
const AUDIO_DO_MAXIMO_KBPS = 128;
const MARGEM_DO_MAXIMO = 0.95; // o arquivo final fica abaixo do máximo pedido
const KBPS_MINIMO = 80;
const BITS_POR_PIXEL_DO_AVISO = 0.04;
const KBPS_MINIMO_MP3 = 32;

export function formatosPossiveis(info: InfoDoVideo): Formato[] {
  return info.video ? ['mp4', 'webm', 'mov', 'mp3'] : ['mp3'];
}

const recusa = (motivo: string): ResultadoDoPlano => ({ ok: false, motivo });
const casas = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

function estimativaPorNivel(info: InfoDoVideo, crf: number, ladoMenorMax: number | undefined, audioKbps: number): number | null {
  if (info.duracaoS <= 0 || !info.video) return null;
  const { largura, altura, fps } = info.video;
  const ladoMenor = Math.min(largura, altura);
  const fator = ladoMenorMax && ladoMenor > ladoMenorMax ? (ladoMenorMax / ladoMenor) ** 2 : 1;
  const bitsPorPixel = BITS_POR_PIXEL_NO_CRF_23 * 2 ** (-(crf - 23) / 6);
  const kbpsVideo = (largura * altura * fps * fator * bitsPorPixel) / 1000;
  return Math.round(((kbpsVideo + audioKbps) * 1000 * info.duracaoS) / 8);
}

export function planejar(info: InfoDoVideo, pedido: Pedido): ResultadoDoPlano {
  const { formato, tamanho } = pedido;
  if (!formatosPossiveis(info).includes(formato)) return recusa('Este arquivo não tem imagem: só dá para extrair o áudio em MP3.');
  if (formato === 'mp3') return planejarMp3(info, tamanho);

  if (tamanho.tipo === 'nivel') {
    const n = NIVEIS[tamanho.nivel];
    const ehCopia = tamanho.nivel === 'original' && (formato === 'mp4' || formato === 'mov') && info.video?.codec === 'h264' && (info.audio === null || info.audio.codec === 'aac');
    if (ehCopia) return { ok: true, modo: 'copiar', formato, video: null, audio: null, estimativaBytes: info.tamanhoBytes };
    const webm = formato === 'webm';
    return {
      ok: true,
      modo: 'reconverter',
      formato,
      video: { codec: webm ? 'libvpx-vp9' : 'libx264', crf: webm ? n.crfVp9 : n.crfX264, ...(n.ladoMenorMax ? { ladoMenorMax: n.ladoMenorMax } : {}) },
      audio: info.audio ? { codec: webm ? 'libopus' : 'aac', kbps: n.audioKbps } : null,
      estimativaBytes: estimativaPorNivel(info, n.crfX264, n.ladoMenorMax, info.audio ? n.audioKbps : 0),
    };
  }

  const mb = tamanho.mb;
  if (!Number.isFinite(mb) || mb <= 0) return recusa('Digite um tamanho máximo maior que zero.');
  if (info.duracaoS <= 0) return recusa('Não sei a duração deste vídeo, então não consigo calcular o tamanho máximo. Use Original, Médio ou Pequeno.');
  const audioKbps = info.audio ? AUDIO_DO_MAXIMO_KBPS : 0;
  const bitsTotais = mb * MB * 8 * MARGEM_DO_MAXIMO;
  const kbps = (bitsTotais - audioKbps * 1000 * info.duracaoS) / info.duracaoS / 1000;
  if (kbps < KBPS_MINIMO) {
    return recusa(`O tamanho máximo de ${casas(mb)} MB é pequeno demais para este vídeo de ${Math.round(info.duracaoS)} s: a imagem ficaria ruim demais. Aumente o tamanho ou use o nível Pequeno.`);
  }
  const { largura, altura, fps } = info.video!;
  const pixelsPorSegundo = largura * altura * fps;
  const aviso = pixelsPorSegundo > 0 && (kbps * 1000) / pixelsPorSegundo < BITS_POR_PIXEL_DO_AVISO ? `A qualidade vai cair bastante para caber em ${casas(mb)} MB.` : undefined;
  const webm = formato === 'webm';
  return {
    ok: true,
    modo: 'reconverter',
    formato,
    video: { codec: webm ? 'libvpx-vp9' : 'libx264', kbps: Math.floor(kbps) },
    audio: info.audio ? { codec: webm ? 'libopus' : 'aac', kbps: audioKbps } : null,
    estimativaBytes: Math.round(bitsTotais / 8),
    ...(aviso ? { aviso } : {}),
  };
}

function planejarMp3(info: InfoDoVideo, tamanho: Tamanho): ResultadoDoPlano {
  if (!info.audio) return recusa('Este arquivo não tem áudio.');
  let kbps: number;
  if (tamanho.tipo === 'nivel') {
    kbps = NIVEIS[tamanho.nivel].mp3Kbps;
  } else {
    if (!Number.isFinite(tamanho.mb) || tamanho.mb <= 0) return recusa('Digite um tamanho máximo maior que zero.');
    if (info.duracaoS <= 0) return recusa('Não sei a duração deste arquivo, então não consigo calcular o tamanho máximo. Use Original, Médio ou Pequeno.');
    kbps = Math.min(320, Math.floor((tamanho.mb * MB * 8 * MARGEM_DO_MAXIMO) / info.duracaoS / 1000));
    if (kbps < KBPS_MINIMO_MP3) return recusa(`O tamanho máximo de ${casas(tamanho.mb)} MB é pequeno demais para este áudio. Aumente o tamanho.`);
  }
  return {
    ok: true,
    modo: 'reconverter',
    formato: 'mp3',
    video: null,
    audio: { codec: 'libmp3lame', kbps },
    estimativaBytes: info.duracaoS > 0 ? Math.round((kbps * 1000 * info.duracaoS) / 8) : null,
  };
}
