import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

/** A gravação só é permitida para arquivos .png dentro da pasta que o usuário escolheu. */
export function caminhoPermitido(pasta: string, caminho: string): boolean {
  if (!pasta || !caminho) return false;
  if (extname(caminho).toLowerCase() !== '.png') return false;
  const rel = relative(resolve(pasta), resolve(caminho));
  if (rel === '' || isAbsolute(rel)) return false;
  return rel !== '..' && !rel.startsWith('..' + sep);
}
