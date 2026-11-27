import { join } from 'node:path';

/**
 * Onde está o ffmpeg. Instalado: copiado para resources/ffmpeg/ffmpeg.exe pelo instalador (electron-builder.yml).
 * Em desenvolvimento: o caminho que o pacote ffmpeg-static informa (ou null se o pacote não está instalado).
 */
export function caminhoDoFfmpeg(o: { empacotado: boolean; resourcesPath: string; modoDev: () => string | null }): string | null {
  return o.empacotado ? join(o.resourcesPath, 'ffmpeg', 'ffmpeg.exe') : o.modoDev();
}
