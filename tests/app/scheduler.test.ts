import { describe, expect, test } from 'vitest';
import { newRaster } from '../../src/engine/blend';
import { createPreviewScheduler } from '../../src/app/scheduler';
import type { Choices, Raster } from '../../src/engine/types';

const escolha = (e: string): Choices => ({ wireo: 'preto', elastico: e, tassel: 'branco' });
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
function marcado(id: number): Raster {
  const r = newRaster(1, 1);
  r.data[0] = id;
  return r;
}

describe('agendador da prévia', () => {
  test('três pedidos seguidos: só o resultado do último chega à tela', async () => {
    const chamados: string[] = [];
    const entregues: number[] = [];
    const sched = createPreviewScheduler(
      async (req) => {
        chamados.push(req.choices.elastico);
        await espera(req.choices.elastico === 'a' ? 60 : 5); // o primeiro é o mais lento
        return marcado(req.choices.elastico.charCodeAt(0));
      },
      (_capa, r) => entregues.push(r.data[0] as number),
    );
    sched.request({ capa: 0, choices: escolha('a') });
    sched.request({ capa: 0, choices: escolha('b') });
    sched.request({ capa: 0, choices: escolha('c') });
    await espera(200);
    expect(entregues).toEqual(['c'.charCodeAt(0)]);
    expect(chamados).toEqual(['a', 'c']); // o pedido do meio nunca chega a ser calculado
  });

  test('um pedido sozinho é entregue com o número da capa', async () => {
    const entregues: Array<[number, number]> = [];
    const sched = createPreviewScheduler(async () => marcado(7), (capa, r) => entregues.push([capa, r.data[0] as number]));
    sched.request({ capa: 3, choices: escolha('a') });
    await espera(30);
    expect(entregues).toEqual([[3, 7]]);
  });

  test('erro no cálculo vai para onError e o agendador continua funcionando', async () => {
    const erros: string[] = [];
    const entregues: number[] = [];
    let n = 0;
    const sched = createPreviewScheduler(
      async () => {
        if (n++ === 0) throw new Error('falhou');
        return marcado(9);
      },
      (_c, r) => entregues.push(r.data[0] as number),
      (e) => erros.push((e as Error).message),
    );
    sched.request({ capa: 0, choices: escolha('a') });
    await espera(30);
    sched.request({ capa: 0, choices: escolha('b') });
    await espera(30);
    expect(erros).toEqual(['falhou']);
    expect(entregues).toEqual([9]);
  });
});
