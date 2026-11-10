import { readdir, rename, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

export const EXT_ARTE = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

export interface ClientePendente {
  nome: string;
  caminho: string;
  /** Caminhos completos de PDF/JPG/PNG na pasta do cliente (a arte que ele mandou, mais o PDF do Corel se já existir). */
  artes: string[];
  /** Mexida há pouco tempo: os arquivos podem ainda estar subindo. */
  chegando: boolean;
}

export async function ehPasta(caminho: string): Promise<boolean> {
  try {
    return (await stat(caminho)).isDirectory();
  } catch {
    return false;
  }
}

export async function nomesEm(pasta: string): Promise<{ nome: string; caminho: string; pasta: boolean; mtimeMs: number }[]> {
  const itens = await readdir(pasta, { withFileTypes: true });
  return Promise.all(
    itens.map(async (d) => {
      const caminho = join(pasta, d.name);
      const s = await stat(caminho).catch(() => null);
      return { nome: d.name, caminho, pasta: d.isDirectory(), mtimeMs: s?.mtimeMs ?? 0 };
    }),
  );
}

const ehMkp = (nome: string) => nome.toLowerCase() === 'mkp';

async function temImagensNoMkp(pastaCliente: string): Promise<boolean> {
  const itens = await nomesEm(pastaCliente);
  const mkp = itens.find((i) => i.pasta && ehMkp(i.nome));
  if (!mkp) return false;
  return (await nomesEm(mkp.caminho)).some((i) => !i.pasta && extname(i.nome).toLowerCase() === '.png');
}

/**
 * Pastas de cliente na Pasta 1 que ainda não têm o MKP pronto (a subpasta MKP com imagens).
 * `agora` e `esperaMs` existem para testar: pasta mexida há menos de `esperaMs` sai marcada como "chegando".
 */
export async function listarPendentes(raiz: string, agora = Date.now(), esperaMs = 30_000): Promise<ClientePendente[]> {
  if (!(await ehPasta(raiz))) throw new Error(`Não encontrei a pasta "${raiz}". Escolha a Pasta 1 de novo.`);
  const clientes = (await nomesEm(raiz)).filter((i) => i.pasta);
  const saida: ClientePendente[] = [];
  for (const c of clientes) {
    if (await temImagensNoMkp(c.caminho)) continue;
    const itens = await nomesEm(c.caminho);
    const maisRecente = Math.max(c.mtimeMs, ...itens.map((i) => i.mtimeMs));
    saida.push({
      nome: c.nome,
      caminho: c.caminho,
      artes: itens.filter((i) => !i.pasta && EXT_ARTE.has(extname(i.nome).toLowerCase())).map((i) => i.caminho),
      chegando: agora - maisRecente < esperaMs,
    });
  }
  return saida.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Confere se a pasta do cliente está completa para ir para a Pasta 2: imagens do MKP, um .cdr e um .pdf (qualquer nome). */
export async function verificarProntidao(pastaCliente: string): Promise<{ pronta: boolean; faltando: string[] }> {
  const itens = await nomesEm(pastaCliente);
  const tem = (ext: string) => itens.some((i) => !i.pasta && extname(i.nome).toLowerCase() === ext);
  const faltando: string[] = [];
  if (!(await temImagensNoMkp(pastaCliente))) faltando.push('imagens do MKP');
  if (!tem('.cdr')) faltando.push('arquivo .cdr');
  if (!tem('.pdf')) faltando.push('arquivo .pdf');
  return { pronta: faltando.length === 0, faltando };
}

export type ResultadoMover = { ok: true; destino: string } | { ok: false; motivo: string };

/** Move a pasta do cliente para a Pasta 2. Nunca sobrescreve e só move se estiver completa. */
export async function moverParaAprovar(pastaCliente: string, pastaAprovar: string): Promise<ResultadoMover> {
  const { pronta, faltando } = await verificarProntidao(pastaCliente);
  if (!pronta) return { ok: false, motivo: `Ainda faltam: ${faltando.join(', ')}.` };
  if (!(await ehPasta(pastaAprovar))) return { ok: false, motivo: `Não encontrei a Pasta 2 ("${pastaAprovar}"). Escolha a pasta de novo.` };
  const destino = join(pastaAprovar, basename(pastaCliente));
  if (await stat(destino).then(() => true, () => false)) {
    return { ok: false, motivo: `Já existe uma pasta "${basename(pastaCliente)}" na Pasta 2. Nada foi movido.` };
  }
  try {
    await rename(pastaCliente, destino);
  } catch (e) {
    const codigo = (e as NodeJS.ErrnoException).code;
    if (codigo === 'EBUSY' || codigo === 'EPERM' || codigo === 'EACCES') {
      return { ok: false, motivo: 'O Windows não deixou mover: algum arquivo da pasta está aberto (por exemplo no CorelDRAW). Feche e tente de novo.' };
    }
    if (codigo === 'EXDEV') return { ok: false, motivo: 'As duas pastas estão em unidades diferentes; não consigo mover com segurança.' };
    return { ok: false, motivo: `Não consegui mover a pasta: ${e instanceof Error ? e.message : String(e)}` };
  }
  return { ok: true, destino };
}
