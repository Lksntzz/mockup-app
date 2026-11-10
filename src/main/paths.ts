import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** A gravação só é permitida para arquivos .png dentro da pasta que o usuário escolheu. */
export function caminhoPermitido(pasta: string, caminho: string): boolean {
  if (!pasta || !caminho) return false;
  if (extname(caminho).toLowerCase() !== '.png') return false;
  const rel = relative(resolve(pasta), resolve(caminho));
  if (rel === '' || isAbsolute(rel)) return false;
  return rel !== '..' && !rel.startsWith('..' + sep);
}

/** Os mockups de um PDF vão para a pasta "MKP", criada ao lado dele. */
export function pastaMkp(caminhoDoPdf: string): string {
  if (!['.pdf', '.png', '.jpg', '.jpeg'].includes(extname(caminhoDoPdf).toLowerCase())) throw new Error('Isso não é um arquivo PDF, PNG ou JPG.');
  return join(dirname(caminhoDoPdf), 'MKP');
}
