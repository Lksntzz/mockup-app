import { describe, expect, test } from 'vitest';
import { detalhesDoVideo, formatarBytes, formatarTempo, rotuloDoFormato, rotuloDoVideo } from '../../src/app/converte-ui';
import type { InfoDoVideo } from '../../src/converte/info';

const IPHONE: InfoDoVideo = { contenedor: 'mov', duracaoS: 26.17, tamanhoBytes: 37_254_613, video: { codec: 'hevc', largura: 1440, altura: 2560, fps: 30, rotacao: 0 }, audio: { codec: 'aac' } };

describe('formatarBytes', () => {
  test('bytes, KB, MB e GB com vírgula', () => {
    expect(formatarBytes(900)).toBe('900 B');
    expect(formatarBytes(1_048_576)).toBe('1 MB');
    expect(formatarBytes(37_254_613)).toBe('35,5 MB');
    expect(formatarBytes(2048)).toBe('2 KB');
    expect(formatarBytes(3 * 1_073_741_824)).toBe('3 GB');
  });
  test('valor inválido não vira "NaN"', () => {
    expect(formatarBytes(Number.NaN)).toBe('—');
    expect(formatarBytes(-5)).toBe('—');
  });
});

describe('formatarTempo', () => {
  test('null = calculando; segundos, minutos e horas', () => {
    expect(formatarTempo(null)).toBe('calculando…');
    expect(formatarTempo(26.4)).toBe('26 s');
    expect(formatarTempo(75)).toBe('1 min 15 s');
    expect(formatarTempo(182)).toBe('3 min 2 s');
    expect(formatarTempo(60)).toBe('1 min');
    expect(formatarTempo(3720)).toBe('1 h 2 min');
    expect(formatarTempo(0)).toBe('0 s');
  });
});

describe('rotuloDoVideo', () => {
  test('vídeo com áudio', () => {
    expect(rotuloDoVideo('IMG_6040.MOV', IPHONE)).toBe('IMG_6040.MOV · HEVC + AAC · 1440×2560 · 26 s · 35,5 MB');
  });
  test('vídeo sem áudio', () => {
    const info: InfoDoVideo = { ...IPHONE, audio: null, video: { ...IPHONE.video!, codec: 'h264' } };
    expect(rotuloDoVideo('a.mp4', info)).toBe('a.mp4 · H.264 · sem áudio · 1440×2560 · 26 s · 35,5 MB');
  });
  test('só áudio', () => {
    const info: InfoDoVideo = { contenedor: 'mp3', duracaoS: 182, tamanhoBytes: 4_400_000, video: null, audio: { codec: 'mp3' } };
    expect(rotuloDoVideo('musica.mp3', info)).toBe('musica.mp3 · MP3 · 3 min 2 s · 4,2 MB');
  });
  test('vídeo girado 90° mostra as medidas como aparecem na tela', () => {
    const info: InfoDoVideo = { ...IPHONE, video: { ...IPHONE.video!, largura: 1920, altura: 1080, rotacao: 90 } };
    expect(rotuloDoVideo('a.mov', info)).toContain('1080×1920');
  });
  test('duração desconhecida some do rótulo em vez de mostrar 0 s', () => {
    expect(rotuloDoVideo('a.mkv', { ...IPHONE, duracaoS: 0 })).not.toContain(' 0 s');
  });
});

describe('rotuloDoFormato', () => {
  test('nomes que a pessoa entende', () => {
    expect(rotuloDoFormato('mp4', IPHONE)).toBe('MP4 (H.264) — o mais aceito');
    expect(rotuloDoFormato('webm', IPHONE)).toBe('WebM (VP9)');
    expect(rotuloDoFormato('mov', IPHONE)).toBe('MOV (H.264)');
    expect(rotuloDoFormato('mp3', IPHONE)).toBe('MP3 — só o áudio');
  });
});

describe('detalhesDoVideo', () => {
  test('vídeo com áudio: uma linha para cada informação', () => {
    expect(detalhesDoVideo('IMG_6040.MOV', { ...IPHONE, contenedor: 'mov,mp4,m4a,3gp,3g2,mj2' })).toEqual([
      ['Arquivo', 'IMG_6040.MOV'],
      ['Formato', 'MOV'],
      ['Vídeo', 'HEVC · 1440×2560 · 30 quadros/s'],
      ['Áudio', 'AAC'],
      ['Duração', '26 s'],
      ['Tamanho', '35,5 MB'],
    ]);
  });
  test('sem áudio, duração desconhecida e só áudio', () => {
    const semAudio = detalhesDoVideo('a.mkv', { ...IPHONE, contenedor: 'matroska,webm', audio: null, duracaoS: 0 });
    expect(semAudio).toContainEqual(['Áudio', 'sem áudio']);
    expect(semAudio).toContainEqual(['Duração', 'desconhecida']);
    expect(semAudio).toContainEqual(['Formato', 'MATROSKA']);
    const soAudio = detalhesDoVideo('m.mp3', { contenedor: 'mp3', duracaoS: 182, tamanhoBytes: 4_400_000, video: null, audio: { codec: 'mp3' } });
    expect(soAudio.map((l) => l[0])).toEqual(['Arquivo', 'Formato', 'Áudio', 'Duração', 'Tamanho']);
  });
  test('vídeo girado 90° mostra as medidas como aparecem; fps com vírgula', () => {
    const r = detalhesDoVideo('a.mov', { ...IPHONE, video: { ...IPHONE.video!, largura: 1920, altura: 1080, rotacao: 90, fps: 29.97 } });
    expect(r).toContainEqual(['Vídeo', 'HEVC · 1080×1920 · 29,97 quadros/s']);
  });
});
