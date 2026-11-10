import { describe, expect, test } from 'vitest';
import type { Choices, Pack } from '../../src/engine/types';
import { contarIgnoradas } from '../../src/app/historico';
import { rascunhoValido, type Rascunho } from '../../src/app/rascunhos';

const c = (wireo: string, elastico: string, tassel: string): Choices => ({ wireo, elastico, tassel });
const ok: Rascunho = {
  caminho: 'C:\\x\\CAPAS.pdf', nome: 'CAPAS.pdf', atualizadoEm: new Date().toISOString(), selecionada: 2,
  saidas: { frente: true, vt: false, semCanguru: false, verso: false }, escolhas: [c('preto', 'preto', 'branco')],
};

describe('rascunhoValido', () => {
  test('aceita um rascunho completo', () => expect(rascunhoValido(ok)).toBe(true));
  test('recusa o que está incompleto ou com tipo errado', () => {
    expect(rascunhoValido(null)).toBe(false);
    expect(rascunhoValido({ ...ok, caminho: 1 })).toBe(false);
    expect(rascunhoValido({ ...ok, selecionada: 'a' })).toBe(false);
    expect(rascunhoValido({ ...ok, escolhas: undefined })).toBe(false);
    expect(rascunhoValido({ ...ok, saidas: { frente: true } })).toBe(false);
  });
});

describe('contarIgnoradas (modelo do PSD mudou)', () => {
  const pack = {
    options: { wireo: [{ id: 'preto' }], elastico: [{ id: 'preto' }, { id: 'azul' }], tassel: [{ id: 'branco' }] },
    unavailable: [],
  } as unknown as Pack;
  test('zero quando todas as cores salvas ainda existem', () => {
    expect(contarIgnoradas(pack, [c('preto', 'azul', 'branco')])).toBe(0);
  });
  test('conta as capas cujas cores salvas não existem mais', () => {
    expect(contarIgnoradas(pack, [c('rose-gold', 'azul', 'branco'), c('preto', 'preto', 'branco'), c('preto', 'laranja', 'branco')])).toBe(2);
  });
});
