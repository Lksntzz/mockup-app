import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { caminhoDoFfmpeg } from '../../src/main/ffmpeg-caminho';

describe('caminhoDoFfmpeg', () => {
  test('instalado: usa o ffmpeg.exe da pasta resources do app', () => {
    const r = caminhoDoFfmpeg({ empacotado: true, resourcesPath: join('C:', 'app', 'resources'), modoDev: () => '/dev/ffmpeg' });
    expect(r).toBe(join('C:', 'app', 'resources', 'ffmpeg', 'ffmpeg.exe'));
  });
  test('em desenvolvimento: usa o caminho do pacote ffmpeg-static', () => {
    expect(caminhoDoFfmpeg({ empacotado: false, resourcesPath: 'x', modoDev: () => '/dev/ffmpeg' })).toBe('/dev/ffmpeg');
  });
  test('em desenvolvimento sem o pacote: devolve null', () => {
    expect(caminhoDoFfmpeg({ empacotado: false, resourcesPath: 'x', modoDev: () => null })).toBeNull();
  });
});
