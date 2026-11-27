import { describe, expect, test } from 'vitest';
import type { InfoDoVideo } from '../../src/converte/info';
import { lerProgresso, montarArgumentos, nomeLivre } from '../../src/converte/argumentos';
import { planejar, type Pedido, type Plano } from '../../src/converte/plano';

const IPHONE: InfoDoVideo = {
  contenedor: 'mov',
  duracaoS: 26.17,
  tamanhoBytes: 37254613,
  video: { codec: 'hevc', largura: 1440, altura: 2560, fps: 30, rotacao: 0 },
  audio: { codec: 'aac' },
};
const plano = (info: InfoDoVideo, p: Pedido): Plano => {
  const r = planejar(info, p);
  if (!r.ok) throw new Error(r.motivo);
  return r;
};
const nivel = (formato: Pedido['formato'], n: 'original' | 'medio' | 'pequeno'): Pedido => ({ formato, tamanho: { tipo: 'nivel', nivel: n } });

describe('montarArgumentos', () => {
  test('MP4 original: entrada, depois H.264 com CRF 23, e a saída por último', () => {
    const a = montarArgumentos(plano(IPHONE, nivel('mp4', 'original')), '/v/in.mov', '/v/in.mp4');
    const ordem = ['-i', '/v/in.mov', '-c:v', 'libx264', '-crf', '23'].map((x) => a.indexOf(x));
    expect(ordem.every((p) => p >= 0)).toBe(true);
    expect([...ordem].sort((x, y) => x - y)).toEqual(ordem);
    expect(a[a.length - 1]).toBe('/v/in.mp4');
    expect(a.slice(0, 7)).toEqual(['-hide_banner', '-nostdin', '-n', '-v', 'error', '-nostats', '-progress']);
    expect(a).toContain('+faststart');
  });
  test('copiar: usa -c copy e não tem CRF', () => {
    const h264 = { ...IPHONE, video: { ...IPHONE.video!, codec: 'h264' } };
    const a = montarArgumentos(plano(h264, nivel('mp4', 'original')), 'a.mov', 'a.mp4');
    expect(a[a.indexOf('-c') + 1]).toBe('copy');
    expect(a).not.toContain('-crf');
  });
  test('sem áudio: -an e nenhum -c:a', () => {
    const a = montarArgumentos(plano({ ...IPHONE, audio: null }, nivel('mp4', 'original')), 'a.mov', 'a.mp4');
    expect(a).toContain('-an');
    expect(a).not.toContain('-c:a');
  });
  test('MP3: -vn e libmp3lame', () => {
    const a = montarArgumentos(plano(IPHONE, nivel('mp3', 'original')), 'a.mov', 'a.mp3');
    expect(a).toContain('-vn');
    expect(a[a.indexOf('-c:a') + 1]).toBe('libmp3lame');
    expect(a[a.indexOf('-b:a') + 1]).toBe('192k');
  });
  test('caminho com acento, espaço, & e colchetes vai inteiro como UM argumento', () => {
    const entrada = 'C:\\Vídeos\\Meu & Filme [final].mov';
    const a = montarArgumentos(plano(IPHONE, nivel('mp4', 'original')), entrada, 'C:\\Vídeos\\Meu & Filme [final].mp4');
    expect(a.filter((x) => x === entrada)).toHaveLength(1);
    expect(a.filter((x) => x.includes('Filme'))).toHaveLength(2); // entrada e saída, nenhum pedaço solto
  });
  test('máximo em MB: taxa de vídeo com teto (-b:v, -maxrate, -bufsize)', () => {
    const a = montarArgumentos(plano(IPHONE, { formato: 'mp4', tamanho: { tipo: 'maximo', mb: 20 } }), 'a.mov', 'a.mp4');
    expect(a[a.indexOf('-b:v') + 1]).toMatch(/^59\d\dk$/);
    expect(a).toContain('-maxrate');
    expect(a).toContain('-bufsize');
    expect(a).not.toContain('-crf');
  });
  test('nível médio reduz o lado menor a 1080 sem aumentar vídeo pequeno', () => {
    const a = montarArgumentos(plano(IPHONE, nivel('mp4', 'medio')), 'a.mov', 'a.mp4');
    const vf = a[a.indexOf('-vf') + 1]!;
    expect(vf).toContain('min(iw,1080)');
    expect(vf).toContain('min(ih,1080)');
  });
  test('WebM: VP9 com -b:v 0 no modo de qualidade e Opus', () => {
    const a = montarArgumentos(plano(IPHONE, nivel('webm', 'original')), 'a.mov', 'a.webm');
    expect(a[a.indexOf('-c:v') + 1]).toBe('libvpx-vp9');
    expect(a[a.indexOf('-b:v') + 1]).toBe('0');
    expect(a[a.indexOf('-c:a') + 1]).toBe('libopus');
    expect(a).not.toContain('+faststart');
  });
});

describe('nomeLivre', () => {
  test('pasta livre: mesmo nome com a extensão nova', () => {
    expect(nomeLivre('/v/a.mov', 'mp4', () => false)).toBe('/v/a.mp4');
  });
  test('nomes ocupados: (1), (2)…', () => {
    const ocupados = new Set(['/v/a.mp4', '/v/a (1).mp4']);
    expect(nomeLivre('/v/a.mov', 'mp4', (c) => ocupados.has(c))).toBe('/v/a (2).mp4');
  });
  test('entrada sem extensão, com ponto na pasta', () => {
    expect(nomeLivre('/v.x/a', 'mp4', () => false)).toBe('/v.x/a.mp4');
  });
  test('nunca devolve o próprio arquivo de entrada (MP4 → MP4)', () => {
    expect(nomeLivre('/v/a.mp4', 'mp4', () => false)).toBe('/v/a (1).mp4');
  });
});

describe('lerProgresso', () => {
  test('tempo em microssegundos vira segundos', () => {
    expect(lerProgresso('out_time_us=1880000')).toEqual({ tipo: 'tempo', segundos: 1.88 });
  });
  test('tempo negativo, N/A e outras linhas: null', () => {
    for (const l of ['out_time_us=-80000', 'out_time_us=N/A', 'speed=N/A', 'frame=10', '']) expect(lerProgresso(l)).toBeNull();
  });
  test('progress=end é o fim', () => {
    expect(lerProgresso('progress=end')).toEqual({ tipo: 'fim' });
    expect(lerProgresso('progress=continue')).toBeNull();
  });
});
