import { describe, expect, test } from 'vitest';
import type { InfoDoVideo } from '../../src/converte/info';
import { formatosPossiveis, planejar, type Pedido } from '../../src/converte/plano';

const MB = 1048576;
const IPHONE: InfoDoVideo = {
  contenedor: 'mov',
  duracaoS: 26.17,
  tamanhoBytes: 37254613,
  video: { codec: 'hevc', largura: 1440, altura: 2560, fps: 30, rotacao: 0 },
  audio: { codec: 'aac' },
};
const H264: InfoDoVideo = { ...IPHONE, video: { codec: 'h264', largura: 1440, altura: 2560, fps: 30, rotacao: 0 } };
const nivel = (formato: Pedido['formato'], n: 'original' | 'medio' | 'pequeno'): Pedido => ({ formato, tamanho: { tipo: 'nivel', nivel: n } });
const maximo = (mb: number, formato: Pedido['formato'] = 'mp4'): Pedido => ({ formato, tamanho: { tipo: 'maximo', mb } });
const plano = (info: InfoDoVideo, p: Pedido) => {
  const r = planejar(info, p);
  if (!r.ok) throw new Error('esperava ok: ' + r.motivo);
  return r;
};

describe('planejar: níveis', () => {
  test('HEVC para MP4 original reconverte em H.264 com CRF 23 e estimativa de 15 a 35 MB', () => {
    const p = plano(IPHONE, nivel('mp4', 'original'));
    expect(p.modo).toBe('reconverter');
    expect(p.video).toMatchObject({ codec: 'libx264', crf: 23 });
    expect(p.audio).toMatchObject({ codec: 'aac', kbps: 160 });
    expect(p.estimativaBytes! / MB).toBeGreaterThan(15);
    expect(p.estimativaBytes! / MB).toBeLessThan(35);
  });
  test('estimativas: original > médio > pequeno; médio limita o lado menor a 1080 e pequeno a 720', () => {
    const o = plano(IPHONE, nivel('mp4', 'original'));
    const m = plano(IPHONE, nivel('mp4', 'medio'));
    const s = plano(IPHONE, nivel('mp4', 'pequeno'));
    expect(o.estimativaBytes!).toBeGreaterThan(m.estimativaBytes!);
    expect(m.estimativaBytes!).toBeGreaterThan(s.estimativaBytes!);
    expect(m.video?.ladoMenorMax).toBe(1080);
    expect(s.video?.ladoMenorMax).toBe(720);
    expect(o.video?.ladoMenorMax).toBeUndefined();
  });
});

describe('planejar: copiar sem reconverter', () => {
  test('H.264 + AAC para MP4 e para MOV, nível original: copia', () => {
    for (const f of ['mp4', 'mov'] as const) {
      const p = plano(H264, nivel(f, 'original'));
      expect(p.modo).toBe('copiar');
      expect(p.video).toBeNull();
      expect(p.audio).toBeNull();
      expect(p.estimativaBytes).toBe(37254613);
    }
  });
  test('H.264 + AAC para WebM, ou em nível médio: reconverte', () => {
    expect(plano(H264, nivel('webm', 'original')).modo).toBe('reconverter');
    expect(plano(H264, nivel('mp4', 'medio')).modo).toBe('reconverter');
  });
  test('vídeo H.264 sem áudio copia e o plano não tem áudio', () => {
    const p = plano({ ...H264, audio: null }, nivel('mp4', 'original'));
    expect(p.modo).toBe('copiar');
    expect(p.audio).toBeNull();
  });
});

describe('planejar: vídeo sem áudio', () => {
  test('reconverter sem áudio: audio é null', () => {
    const p = plano({ ...IPHONE, audio: null }, nivel('mp4', 'original'));
    expect(p.modo).toBe('reconverter');
    expect(p.audio).toBeNull();
  });
});

describe('planejar: máximo em MB', () => {
  test('20 MB: cabe com qualidade razoável, sem aviso, taxa de vídeo em torno de 5,96 Mbit/s', () => {
    const p = plano(IPHONE, maximo(20));
    expect(p.aviso).toBeUndefined();
    expect(p.video?.kbps).toBeGreaterThan(5900);
    expect(p.video?.kbps).toBeLessThan(6000);
    expect(p.estimativaBytes! / MB).toBeLessThanOrEqual(20);
  });
  test('8 MB: aceita, mas avisa que a qualidade cai', () => {
    const p = plano(IPHONE, maximo(8));
    expect(p.aviso).toMatch(/qualidade/);
  });
  test('0,2 MB: recusa dizendo que o tamanho é pequeno demais', () => {
    const r = planejar(IPHONE, maximo(0.2));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/pequeno/);
  });
  test('máximo 0, negativo ou NaN: recusa', () => {
    for (const mb of [0, -3, NaN]) expect(planejar(IPHONE, maximo(mb)).ok).toBe(false);
  });
  test('duração desconhecida: máximo recusa citando a duração; nível funciona sem estimativa', () => {
    const sem = { ...IPHONE, duracaoS: 0 };
    const r = planejar(sem, maximo(16));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/duração/);
    expect(plano(sem, nivel('mp4', 'medio')).estimativaBytes).toBeNull();
  });
});

describe('formatos e MP3', () => {
  test('com vídeo oferece os quatro formatos; só áudio oferece só MP3', () => {
    expect(formatosPossiveis(IPHONE)).toEqual(['mp4', 'webm', 'mov', 'mp3']);
    expect(formatosPossiveis({ ...IPHONE, video: null })).toEqual(['mp3']);
  });
  test('pedir MP4 de um arquivo só de áudio: recusa', () => {
    const r = planejar({ ...IPHONE, video: null }, nivel('mp4', 'original'));
    expect(r.ok).toBe(false);
  });
  test('MP3: sem vídeo, libmp3lame a 192, 128 e 96 kbit/s por nível', () => {
    for (const [n, k] of [['original', 192], ['medio', 128], ['pequeno', 96]] as const) {
      const p = plano(IPHONE, nivel('mp3', n));
      expect(p.video).toBeNull();
      expect(p.audio).toEqual({ codec: 'libmp3lame', kbps: k });
    }
  });
  test('WebM usa VP9 + Opus', () => {
    const p = plano(IPHONE, nivel('webm', 'original'));
    expect(p.video?.codec).toBe('libvpx-vp9');
    expect(p.audio?.codec).toBe('libopus');
  });
});

describe('MP3 de vídeo sem áudio', () => {
  test('recusa dizendo que não há áudio', () => {
    const r = planejar({ ...IPHONE, audio: null }, nivel('mp3', 'original'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/áudio/);
  });
});
