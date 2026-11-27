export type Ferramenta = 'mkp' | 'converte';

/** Qualquer valor que não seja uma ferramenta conhecida vira MKP (a que o app sempre teve). */
export function ferramentaValida(v: unknown): Ferramenta {
  return v === 'converte' ? 'converte' : 'mkp';
}

/** O que aparece na tela em cada ferramenta: nunca sobra aba nem conteúdo de uma no lado da outra. */
export function visibilidade(f: Ferramenta): { abasDoMkp: boolean; conteudoDoMkp: boolean; converte: boolean } {
  const mkp = f === 'mkp';
  return { abasDoMkp: mkp, conteudoDoMkp: mkp, converte: !mkp };
}
