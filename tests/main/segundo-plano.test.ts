import { describe, expect, test } from 'vitest';
import { deveEsconderAoFechar, iniciaOculto } from '../../src/main/segundo-plano';

describe('segundo plano (só no Modo designer)', () => {
  test('fechar a janela esconde o app só com o Modo designer ligado e sem estar saindo', () => {
    expect(deveEsconderAoFechar({ designer: true }, false)).toBe(true);
    expect(deveEsconderAoFechar({ designer: false }, false)).toBe(false); // operador comum: fechar encerra, como sempre
    expect(deveEsconderAoFechar({ designer: true }, true)).toBe(false); // Sair/atualizar: tem que fechar de verdade
  });
  test('ao iniciar com o Windows (--oculto) só fica escondido se o Modo designer estiver ligado', () => {
    expect(iniciaOculto(['app.exe', '--oculto'], { designer: true })).toBe(true);
    expect(iniciaOculto(['app.exe', '--oculto'], { designer: false })).toBe(false);
    expect(iniciaOculto(['app.exe'], { designer: true })).toBe(false);
  });
});
