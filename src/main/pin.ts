import { createHash, timingSafeEqual } from 'node:crypto';

// PIN do Modo designer. Guardado só como hash (não aparece em texto no código).
// Atenção: é uma barreira de conveniência. Um PIN de 4 dígitos num repositório público
// pode ser descoberto por quem souber programar; não protege nada sensível.
const PIN_HASH = 'bb084352b011e0400b098fceac05fc80040d6a1a71fcd2d99c899676e5a4c157';
const MAX_ERROS = 5;
const BLOQUEIO_MS = 30_000;

export function pinCorreto(pin: unknown): boolean {
  if (typeof pin !== 'string') return false;
  const h = createHash('sha256').update('mockup-agenda:' + pin).digest();
  return timingSafeEqual(h, Buffer.from(PIN_HASH, 'hex'));
}

export type ResultadoPin = { ok: true } | { ok: false; bloqueado: boolean };

export function criarPortaoDePin(agora: () => number = Date.now) {
  let erros = 0;
  let bloqueadoAte = 0;
  return {
    tentar(pin: unknown): ResultadoPin {
      if (agora() < bloqueadoAte) return { ok: false, bloqueado: true };
      if (pinCorreto(pin)) {
        erros = 0;
        return { ok: true };
      }
      erros += 1;
      if (erros >= MAX_ERROS) {
        erros = 0;
        bloqueadoAte = agora() + BLOQUEIO_MS;
        return { ok: false, bloqueado: true };
      }
      return { ok: false, bloqueado: false };
    },
  };
}
