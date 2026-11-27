import { join, parse } from 'node:path';
import type { Formato, Plano } from './plano';

/**
 * Lista de argumentos do ffmpeg (nunca um texto de comando: caminhos com acento, espaço e & seguem inteiros).
 * `-n` nunca sobrescreve; `-progress pipe:1` manda o andamento pela saída padrão.
 */
export function montarArgumentos(plano: Plano, entrada: string, saida: string): string[] {
  const a = ['-hide_banner', '-nostdin', '-n', '-v', 'error', '-nostats', '-progress', 'pipe:1', '-i', entrada];
  const comFaststart = plano.formato === 'mp4' || plano.formato === 'mov';
  if (plano.modo === 'copiar') {
    a.push('-c', 'copy', '-movflags', '+faststart', saida);
    return a;
  }
  if (plano.video) {
    const v = plano.video;
    const vp9 = v.codec === 'libvpx-vp9';
    a.push('-c:v', v.codec);
    if (v.crf !== undefined) a.push('-crf', String(v.crf));
    if (v.kbps !== undefined) a.push('-b:v', `${v.kbps}k`, '-maxrate', `${v.kbps}k`, '-bufsize', `${v.kbps * 2}k`);
    else if (vp9) a.push('-b:v', '0');
    if (vp9) a.push('-row-mt', '1', '-deadline', 'good', '-cpu-used', '4');
    else a.push('-preset', 'veryfast', '-pix_fmt', 'yuv420p');
    if (v.ladoMenorMax) {
      // só o lado menor passa a no máximo L px (em vídeo em pé é a largura); vídeo menor que isso não é ampliado
      const L = v.ladoMenorMax;
      a.push('-vf', `scale='if(gte(iw,ih),-2,min(iw,${L}))':'if(gte(iw,ih),min(ih,${L}),-2)'`);
    }
  } else {
    a.push('-vn');
  }
  if (plano.audio) a.push('-c:a', plano.audio.codec, '-b:a', `${plano.audio.kbps}k`);
  else a.push('-an');
  if (comFaststart) a.push('-movflags', '+faststart');
  a.push(saida);
  return a;
}

/** Nome da saída na mesma pasta: `nome.mp4`, `nome (1).mp4`… Nunca devolve um arquivo que já existe, nem a própria entrada. */
export function nomeLivre(entrada: string, formato: Formato, existe: (caminho: string) => boolean): string {
  const { dir, name } = parse(entrada);
  const ocupado = (c: string) => c === entrada || existe(c);
  let candidato = join(dir, `${name}.${formato}`);
  for (let n = 1; ocupado(candidato); n++) candidato = join(dir, `${name} (${n}).${formato}`);
  return candidato;
}

export type Progresso = { tipo: 'tempo'; segundos: number } | { tipo: 'fim' };

/** Uma linha da saída de `-progress pipe:1`. Só `out_time_us` (válido) e `progress=end` interessam. */
export function lerProgresso(linha: string): Progresso | null {
  const l = linha.trim();
  if (l === 'progress=end') return { tipo: 'fim' };
  const m = /^out_time_us=(-?\d+)$/.exec(l);
  if (!m) return null;
  const us = Number(m[1]);
  return us < 0 ? null : { tipo: 'tempo', segundos: us / 1e6 };
}
