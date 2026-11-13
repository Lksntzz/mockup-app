export type EstadoDoPasso = 'espera' | 'andamento' | 'feito' | 'pulado' | 'erro';
export type EtapaDoPasso = 'pasta' | 'arte' | 'barras' | 'corel';
export interface Passo { etapa: EtapaDoPasso; rotulo: string; estado: EstadoDoPasso }

const ESTADOS: EstadoDoPasso[] = ['espera', 'andamento', 'feito', 'pulado', 'erro'];

export function passosIniciais(): Passo[] {
  return [
    { etapa: 'pasta', rotulo: 'Criando a pasta e o arquivo .txt', estado: 'espera' },
    { etapa: 'arte', rotulo: 'Copiando a arte', estado: 'espera' },
    { etapa: 'barras', rotulo: 'Gerando os códigos de barras', estado: 'espera' },
    { etapa: 'corel', rotulo: 'Abrindo o Corel e montando o arquivo', estado: 'espera' },
  ];
}

/** Imutável; etapa ou estado desconhecidos devolvem a mesma lista. */
export function aplicarProgresso(passos: Passo[], etapa: string, estado: string): Passo[] {
  if (!passos.some((p) => p.etapa === etapa) || !ESTADOS.includes(estado as EstadoDoPasso)) return passos;
  return passos.map((p) => (p.etapa === etapa ? { ...p, estado: estado as EstadoDoPasso } : p));
}

/** Quando o resultado chega com falha, o que ainda estava em andamento virou erro. */
export function fecharPassosPendentes(passos: Passo[]): Passo[] {
  return passos.map((p) => (p.estado === 'andamento' ? { ...p, estado: 'erro' as const } : p));
}

export function tituloFinal(
  passos: Passo[],
  r: { ok: boolean; existente?: string; avisos: string[]; etapaCorel?: string },
): 'Concluído' | 'Concluído com avisos' | 'Não concluído' {
  if (!r.ok) return 'Não concluído';
  if (r.avisos.length > 0 || passos.some((p) => p.estado === 'erro') || r.etapaCorel === 'aguardando-clique' || r.etapaCorel === 'erro') {
    return 'Concluído com avisos';
  }
  return 'Concluído';
}

export function svgParaDataUri(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
