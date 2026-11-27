import type { InfoDoVideo } from '../converte/info';
import type { Formato } from '../converte/plano';

const CODECS: Record<string, string> = {
  h264: 'H.264', hevc: 'HEVC', mpeg4: 'MPEG-4', vp8: 'VP8', vp9: 'VP9', av1: 'AV1',
  aac: 'AAC', mp3: 'MP3', opus: 'Opus', vorbis: 'Vorbis', ac3: 'AC3', flac: 'FLAC',
};
const nomeDoCodec = (c: string): string => CODECS[c.toLowerCase()] ?? c.toUpperCase();

const numero = (n: number): string => String(Math.round(n * 10) / 10).replace('.', ',');

/** "35,5 MB", "900 B"… (1 MB = 1 048 576 bytes, como o Windows mostra). */
export function formatarBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1_048_576) return `${numero(n / 1024)} KB`;
  if (n < 1_073_741_824) return `${numero(n / 1_048_576)} MB`;
  return `${numero(n / 1_073_741_824)} GB`;
}

/** "26 s", "1 min 15 s", "1 h 2 min"; null = ainda sem base para calcular. */
export function formatarTempo(segundos: number | null): string {
  if (segundos === null || !Number.isFinite(segundos)) return 'calculando…';
  const total = Math.max(0, Math.round(segundos));
  if (total < 60) return `${total} s`;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  return s > 0 ? `${m} min ${s} s` : `${m} min`;
}

/** Uma linha que diz o que o arquivo é: nome · codecs · medidas · duração · tamanho. */
export function rotuloDoVideo(nome: string, info: InfoDoVideo): string {
  const partes = [nome];
  if (info.video) {
    partes.push(info.audio ? `${nomeDoCodec(info.video.codec)} + ${nomeDoCodec(info.audio.codec)}` : nomeDoCodec(info.video.codec));
    if (!info.audio) partes.push('sem áudio');
    const { largura, altura, rotacao } = info.video;
    const deLado = Math.abs(rotacao) % 180 === 90;
    partes.push(`${deLado ? altura : largura}×${deLado ? largura : altura}`);
  } else if (info.audio) {
    partes.push(nomeDoCodec(info.audio.codec));
  }
  if (info.duracaoS > 0) partes.push(formatarTempo(info.duracaoS));
  partes.push(formatarBytes(info.tamanhoBytes));
  return partes.join(' · ');
}

/** Nome do formato como aparece na lista de opções. */
export function rotuloDoFormato(f: Formato, _info: InfoDoVideo): string {
  switch (f) {
    case 'mp4': return 'MP4 (H.264) — o mais aceito';
    case 'webm': return 'WebM (VP9)';
    case 'mov': return 'MOV (H.264)';
    case 'mp3': return 'MP3 — só o áudio';
  }
}
