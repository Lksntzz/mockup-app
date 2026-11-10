import type { Choices, Raster } from '../engine/types';

export interface PreviewRequest {
  capa: number;
  choices: Choices;
  /** Qual mockup mostrar; sem isso, a frente. */
  modo?: 'frente' | 'verso';
}

/**
 * Calcula a prévia uma por vez. Se chegam vários pedidos enquanto um cálculo roda, só o mais novo
 * é calculado depois, e o resultado de um pedido que já ficou velho nunca chega à tela.
 */
export function createPreviewScheduler(
  render: (req: PreviewRequest) => Promise<Raster>,
  onResult: (capa: number, resultado: Raster) => void,
  onError?: (erro: unknown) => void,
): { request(req: PreviewRequest): void } {
  let ultimo = 0;
  let rodando = false;
  let pendente: { req: PreviewRequest; token: number } | null = null;

  async function rodar(req: PreviewRequest, token: number): Promise<void> {
    rodando = true;
    try {
      const r = await render(req);
      if (token === ultimo) onResult(req.capa, r);
    } catch (e) {
      if (token === ultimo) onError?.(e);
    } finally {
      rodando = false;
      if (pendente) {
        const p = pendente;
        pendente = null;
        void rodar(p.req, p.token);
      }
    }
  }

  return {
    request(req) {
      ultimo++;
      if (rodando) pendente = { req, token: ultimo };
      else void rodar(req, ultimo);
    },
  };
}
