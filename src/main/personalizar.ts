import { readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ARQUIVOS_DO_MODELO, type ChaveDoArquivo, type RecursosDaPagina } from '../personalizar/modelo';

const MAX_ARTE = 60 * 1024 * 1024;
const MAX_FONTE = 10 * 1024 * 1024;

export type ResultadoRecursos = { ok: true; recursos: RecursosDaPagina } | { ok: false; motivo: string };

/** Procura na pasta escolhida a arte base e as duas fontes (pelo trecho do nome e pela extensão). Nunca lança. */
export async function acharRecursos(pasta: string | undefined): Promise<ResultadoRecursos> {
  if (!pasta) return { ok: false, motivo: 'Escolha a pasta do modelo (a que tem a arte base e as fontes).' };
  let nomes: string[];
  try {
    nomes = await readdir(pasta);
  } catch {
    return { ok: false, motivo: 'Não consegui abrir a pasta do modelo. Confira se ela existe e escolha de novo.' };
  }
  const achados: Partial<Record<ChaveDoArquivo, string>> = {};
  const faltando: string[] = [];
  for (const a of ARQUIVOS_DO_MODELO) {
    const candidatos = nomes
      .filter((n) => n.toLowerCase().includes(a.trecho) && (a.extensoes as readonly string[]).includes(extname(n).toLowerCase()))
      .sort();
    let escolhido: string | undefined;
    for (const n of candidatos) {
      const caminho = join(pasta, n);
      const st = await stat(caminho).catch(() => undefined);
      if (st?.isFile() && st.size > 0 && st.size <= (a.chave === 'arte' ? MAX_ARTE : MAX_FONTE)) {
        escolhido = caminho;
        break;
      }
    }
    if (escolhido) achados[a.chave] = escolhido;
    else faltando.push(`${a.rotulo} — o nome do arquivo precisa ter "${a.trecho}"`);
  }
  if (faltando.length > 0) return { ok: false, motivo: `Falta na pasta do modelo: ${faltando.join('; ')}.` };
  return {
    ok: true,
    recursos: {
      arteUrl: pathToFileURL(achados.arte!).href,
      fonteNomeUrl: pathToFileURL(achados.fonteNome!).href,
      fonteInicialUrl: pathToFileURL(achados.fonteInicial!).href,
    },
  };
}
