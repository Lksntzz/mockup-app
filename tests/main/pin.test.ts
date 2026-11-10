import { describe, expect, test } from 'vitest';
import { criarPortaoDePin, pinCorreto } from '../../src/main/pin';

describe('PIN do Modo designer', () => {
  test('aceita o PIN certo', () => {
    expect(pinCorreto('1411')).toBe(true);
  });
  test('recusa PIN errado, vazio ou de outro tipo', () => {
    expect(pinCorreto('1412')).toBe(false);
    expect(pinCorreto('')).toBe(false);
    expect(pinCorreto(1411)).toBe(false);
    expect(pinCorreto(' 1411')).toBe(false);
  });
  test('depois de 5 erros seguidos bloqueia até o tempo passar, mesmo com o PIN certo', () => {
    let agora = 1000;
    const p = criarPortaoDePin(() => agora);
    for (let i = 0; i < 5; i++) expect(p.tentar('0000')).toEqual({ ok: false, bloqueado: i === 4 });
    expect(p.tentar('1411')).toEqual({ ok: false, bloqueado: true });
    agora += 31_000;
    expect(p.tentar('1411')).toEqual({ ok: true });
  });
  test('acertar zera a contagem de erros', () => {
    const p = criarPortaoDePin(() => 0);
    for (let i = 0; i < 4; i++) p.tentar('0000');
    expect(p.tentar('1411')).toEqual({ ok: true });
    expect(p.tentar('0000')).toEqual({ ok: false, bloqueado: false });
  });
});
