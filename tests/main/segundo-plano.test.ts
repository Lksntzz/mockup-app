import { describe, expect, test } from 'vitest';
import { atualizacaoPodeInstalarSozinha, deveEsconderAoFechar, iniciaOculto } from '../../src/main/segundo-plano';

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
  test('atualização instala sozinha só no Modo designer e com o app escondido ou o usuário parado há 5 minutos', () => {
    const base = { designer: true, janelaEmUso: true, segundosParado: 0 };
    expect(atualizacaoPodeInstalarSozinha(base)).toBe(false); // janela aberta e usuário mexendo
    expect(atualizacaoPodeInstalarSozinha({ ...base, janelaEmUso: false })).toBe(true); // escondido perto do relógio
    expect(atualizacaoPodeInstalarSozinha({ ...base, segundosParado: 14 })).toBe(false);
    expect(atualizacaoPodeInstalarSozinha({ ...base, segundosParado: 15 })).toBe(true); // janela aberta mas ninguém mexe há 15 s
    expect(atualizacaoPodeInstalarSozinha({ ...base, janelaEmUso: false, ocupado: true })).toBe(false); // exportando ou comandando o Corel: espera
    expect(atualizacaoPodeInstalarSozinha({ ...base, segundosParado: 60, ocupado: true })).toBe(false);
    expect(atualizacaoPodeInstalarSozinha({ ...base, designer: false, janelaEmUso: false })).toBe(false); // operador comum: nunca sozinho
  });
});
