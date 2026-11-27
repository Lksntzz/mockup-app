import type { Formato, Nivel, Pedido } from '../converte/plano';

const FORMATOS: readonly Formato[] = ['mp4', 'webm', 'mov', 'mp3'];
const NIVEIS: readonly Nivel[] = ['original', 'medio', 'pequeno'];

/** O renderer é só uma tela: nada do que ele manda vira argumento do ffmpeg sem passar por aqui. */
export function pedidoValido(x: unknown): Pedido | null {
  if (!x || typeof x !== 'object') return null;
  const { formato, tamanho } = x as { formato?: unknown; tamanho?: unknown };
  if (typeof formato !== 'string' || !FORMATOS.includes(formato as Formato)) return null;
  if (!tamanho || typeof tamanho !== 'object') return null;
  const t = tamanho as { tipo?: unknown; nivel?: unknown; mb?: unknown };
  if (t.tipo === 'nivel' && typeof t.nivel === 'string' && NIVEIS.includes(t.nivel as Nivel)) {
    return { formato: formato as Formato, tamanho: { tipo: 'nivel', nivel: t.nivel as Nivel } };
  }
  if (t.tipo === 'maximo' && typeof t.mb === 'number' && Number.isFinite(t.mb) && t.mb > 0) {
    return { formato: formato as Formato, tamanho: { tipo: 'maximo', mb: t.mb } };
  }
  return null;
}

/** Ao fechar o app no meio de uma conversão: cancela e ESPERA a limpeza (apagar o arquivo pela metade) antes de deixar o app sair. */
export async function aoSair(conversao: { cancelar(): void; fim: Promise<unknown> } | null): Promise<void> {
  if (!conversao) return;
  conversao.cancelar();
  await conversao.fim.catch(() => undefined);
}
