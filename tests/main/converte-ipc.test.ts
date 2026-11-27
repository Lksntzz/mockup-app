import { describe, expect, test } from 'vitest';
import { pedidoValido } from '../../src/main/converte-ipc';

describe('pedidoValido', () => {
  test('aceita nível e "máximo de MB"', () => {
    expect(pedidoValido({ formato: 'mp4', tamanho: { tipo: 'nivel', nivel: 'medio' } })).toEqual({ formato: 'mp4', tamanho: { tipo: 'nivel', nivel: 'medio' } });
    expect(pedidoValido({ formato: 'webm', tamanho: { tipo: 'maximo', mb: 16 } })).toEqual({ formato: 'webm', tamanho: { tipo: 'maximo', mb: 16 } });
  });
  test('rejeita formato desconhecido, mb inválido e lixo', () => {
    expect(pedidoValido({ formato: 'avi', tamanho: { tipo: 'nivel', nivel: 'medio' } })).toBeNull();
    expect(pedidoValido({ formato: 'mp4', tamanho: { tipo: 'maximo', mb: -1 } })).toBeNull();
    expect(pedidoValido({ formato: 'mp4', tamanho: { tipo: 'maximo', mb: '16' } })).toBeNull();
    expect(pedidoValido({ formato: 'mp4', tamanho: { tipo: 'maximo', mb: Infinity } })).toBeNull();
    expect(pedidoValido({ formato: 'mp4', tamanho: { tipo: 'nivel', nivel: 'enorme' } })).toBeNull();
    expect(pedidoValido({})).toBeNull();
    expect(pedidoValido(null)).toBeNull();
    expect(pedidoValido('mp4')).toBeNull();
  });
});

describe('aoSair', () => {
  test('cancela e só termina depois que a conversão acabou de limpar', async () => {
    const { aoSair } = await import('../../src/main/converte-ipc');
    const eventos: string[] = [];
    let terminar!: () => void;
    const fim = new Promise<void>((r) => (terminar = r)).then(() => void eventos.push('limpou'));
    const h = { cancelar: () => void eventos.push('cancelou'), fim };
    const espera = aoSair(h).then(() => eventos.push('saiu'));
    await new Promise((r) => setTimeout(r, 10));
    expect(eventos).toEqual(['cancelou']); // ainda esperando
    terminar();
    await espera;
    expect(eventos).toEqual(['cancelou', 'limpou', 'saiu']);
  });
  test('sem conversão: sai na hora', async () => {
    const { aoSair } = await import('../../src/main/converte-ipc');
    await expect(aoSair(null)).resolves.toBeUndefined();
  });
});
