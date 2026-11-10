import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

const EXTENSOES = new Set(['.cdr', '.pdf', '.png', '.jpg', '.jpeg']);

/**
 * Só deixa abrir (no programa padrão do Windows, como o CorelDRAW para .cdr) arquivos de cliente:
 * tipos de arte/impressão, dentro das pastas do fluxo. Nunca programas, scripts ou arquivos de fora.
 */
export function arquivoAbrivel(raizes: string[], caminho: string): boolean {
  if (!caminho || !EXTENSOES.has(extname(caminho).toLowerCase())) return false;
  const alvo = resolve(caminho);
  return raizes.filter(Boolean).some((raiz) => {
    const rel = relative(resolve(raiz), alvo);
    return rel !== '' && !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep);
  });
}
