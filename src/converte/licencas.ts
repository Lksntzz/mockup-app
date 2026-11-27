/** Endereços do painel "Licenças". Só estes abrem no navegador: o app nunca abre um endereço que a tela mandar. */
export const LINKS_DE_LICENCA: ReadonlyArray<{ texto: string; url: string }> = [
  { texto: 'Site do ffmpeg', url: 'https://ffmpeg.org/' },
  { texto: 'Código-fonte do ffmpeg', url: 'https://ffmpeg.org/download.html' },
  { texto: 'Pacote ffmpeg-static (de onde vem o programa)', url: 'https://github.com/eugeneware/ffmpeg-static' },
];

export function linkDeLicencaPermitido(url: unknown): boolean {
  return typeof url === 'string' && LINKS_DE_LICENCA.some((l) => l.url === url);
}
