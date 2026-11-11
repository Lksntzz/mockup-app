import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pastas } from './clientes';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

type Chave = 'pasta1' | 'pasta2' | 'pasta3' | 'pasta4';
const REGRAS: [Chave, number, RegExp][] = [
  ['pasta1', 1, /^1\b.*aguard.*arte/],
  ['pasta2', 2, /^2\b.*aprov/],
  ['pasta3', 3, /^3\b.*aguard.*impress/],
  ['pasta4', 4, /^4\b.*finaliz/],
];
const IGNORAR = /^(\$|\.)|^(node_modules|appdata|windows|program files|program files \(x86\)|programdata|system volume information)$/i;

export interface OpcoesBusca {
  /** Quantos níveis abaixo de cada raiz olhar. */
  profundidade?: number;
  /** Máximo de pastas lidas, para não varrer o computador inteiro. */
  limitePastas?: number;
  /** Tempo máximo da busca. */
  limiteMs?: number;
}

/**
 * Procura as pastas do fluxo (1 AGUARDA ARTE, 2 APROVAR, 3 AGUARDA IMPRESSÃO, 4 FINALIZADOS) dentro das raízes.
 * Só aceita um lugar onde as quatro estão juntas na mesma pasta; se houver mais de um, não escolhe (quem escolhe é o usuário).
 * Não entra em pasta que já casou com uma regra (a Pasta 1 tem centenas de clientes e a Pasta 4 tem anos de pastas).
 */
export async function acharPastasDoFluxo(raizes: string[], opcoes: OpcoesBusca = {}): Promise<{ pastas: Pastas; avisos: string[] }> {
  const profundidade = opcoes.profundidade ?? 5;
  const limitePastas = opcoes.limitePastas ?? 5000;
  const fim = Date.now() + (opcoes.limiteMs ?? 15_000);
  const achadas: { chave: Chave; caminho: string; pai: string }[] = [];
  let lidas = 0;
  let cortou = false;

  async function varrer(pasta: string, nivel: number): Promise<void> {
    if (nivel > profundidade) return;
    if (lidas >= limitePastas || Date.now() > fim) {
      cortou = true;
      return;
    }
    lidas += 1;
    let itens;
    try {
      itens = await readdir(pasta, { withFileTypes: true });
    } catch {
      return;
    }
    const filhas = itens.filter((d) => d.isDirectory() && !IGNORAR.test(d.name));
    const descer: string[] = [];
    for (const d of filhas) {
      const n = semAcento(d.name);
      const regra = REGRAS.find(([, , re]) => re.test(n));
      if (regra) achadas.push({ chave: regra[0], caminho: join(pasta, d.name), pai: pasta });
      else descer.push(join(pasta, d.name));
    }
    for (const c of descer) await varrer(c, nivel + 1);
  }

  for (const r of raizes) await varrer(r, 0);

  const avisos: string[] = [];
  const porPai = new Map<string, Map<Chave, string>>();
  for (const a of achadas) {
    const m = porPai.get(a.pai) ?? new Map<Chave, string>();
    if (!m.has(a.chave)) m.set(a.chave, a.caminho);
    porPai.set(a.pai, m);
  }
  const completos = [...porPai.values()].filter((m) => m.size === 4);
  if (completos.length > 1) {
    avisos.push('Achei as quatro pastas em mais de um lugar do computador, então não escolhi nenhuma. Escolha na mão.');
    return { pastas: {}, avisos };
  }
  if (cortou) avisos.push('A busca parou antes de olhar tudo (muitas pastas ou demorou). Se faltar alguma pasta, escolha na mão.');
  if (completos.length === 1) {
    const m = completos[0]!;
    return { pastas: { pasta1: m.get('pasta1'), pasta2: m.get('pasta2'), pasta3: m.get('pasta3'), pasta4: m.get('pasta4') } as Pastas, avisos };
  }
  // sem conjunto completo: usa o lugar com mais pastas, se for um só
  const ordenados = [...porPai.values()].sort((a, b) => b.size - a.size);
  const melhor = ordenados[0];
  if (!melhor) {
    avisos.push('Não achei as pastas do fluxo. Escolha na mão.');
    return { pastas: {}, avisos };
  }
  if (ordenados[1] && ordenados[1].size === melhor.size) {
    avisos.push('Achei pastas parecidas em mais de um lugar, então não escolhi nenhuma. Escolha na mão.');
    return { pastas: {}, avisos };
  }
  const pastas: Pastas = {};
  for (const [c, , ] of REGRAS) {
    const v = melhor.get(c);
    if (v) pastas[c] = v;
    else avisos.push(`Não achei a Pasta ${c.slice(-1)}. Escolha na mão.`);
  }
  return { pastas, avisos };
}
