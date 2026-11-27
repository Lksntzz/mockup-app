/** O que o app sabe de um vídeo antes de converter. */
export interface InfoDoVideo {
  /** Primeiro nome do contêiner que o ffmpeg informa (ex.: "mov", "matroska", "avi"). */
  contenedor: string;
  /** 0 quando o ffmpeg não sabe a duração. */
  duracaoS: number;
  /** Quem chama preenche com o tamanho do arquivo (o ffmpeg não informa); o leitor deixa 0. */
  tamanhoBytes: number;
  video: { codec: string; largura: number; altura: number; fps: number; rotacao: number } | null;
  audio: { codec: string } | null;
}

/**
 * Lê o texto que `ffmpeg -hide_banner -i <arquivo>` escreve (sem arquivo de saída).
 * Devolve null quando o arquivo não é uma mídia que o ffmpeg consiga abrir.
 */
export function lerInfoDoFfmpeg(texto: string): InfoDoVideo | null {
  const entrada = /Input #0, ([^,\s]+)/.exec(texto);
  if (!entrada) return null;
  const dur = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(texto);
  const duracaoS = dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0;

  let video: InfoDoVideo['video'] = null;
  let audio: InfoDoVideo['audio'] = null;
  let ultimoEhVideo = false;
  for (const linha of texto.split(/\r?\n/)) {
    const stream = /^\s*Stream #0:\d+.*?: (Video|Audio): ([^\s,]+)/.exec(linha);
    if (stream) {
      ultimoEhVideo = false;
      if (stream[1] === 'Video') {
        if (/attached pic/.test(linha) || video) continue; // capa de álbum ou segundo vídeo: ignora
        const tamanho = /, (\d{2,5})x(\d{2,5})/.exec(linha);
        const fps = /(\d+(?:\.\d+)?) fps/.exec(linha) ?? /(\d+(?:\.\d+)?) tbr/.exec(linha);
        video = {
          codec: stream[2]!,
          largura: tamanho ? Number(tamanho[1]) : 0,
          altura: tamanho ? Number(tamanho[2]) : 0,
          fps: fps ? Number(fps[1]) : 0,
          rotacao: 0,
        };
        ultimoEhVideo = true;
      } else if (!audio) {
        audio = { codec: stream[2]! };
      }
      continue;
    }
    const giro = /displaymatrix: rotation of (-?\d+(?:\.\d+)?) degrees/.exec(linha);
    if (giro && ultimoEhVideo && video) video.rotacao = Math.round(Math.abs(Number(giro[1]))) % 360;
  }
  if (!video && !audio) return null;
  return { contenedor: entrada[1]!, duracaoS, tamanhoBytes: 0, video, audio };
}
