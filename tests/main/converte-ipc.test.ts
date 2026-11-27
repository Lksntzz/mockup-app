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
