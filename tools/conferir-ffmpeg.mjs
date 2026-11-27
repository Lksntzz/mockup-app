// Confere se o ffmpeg do pacote ffmpeg-static tem os codificadores que a ferramenta Converte usa.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const caminho = createRequire(import.meta.url)('ffmpeg-static');
if (!caminho) {
  console.log('ERRO: o pacote ffmpeg-static não trouxe o programa (o download falhou?).');
  process.exit(1);
}
for (const extra of ['.LICENSE', '.README']) {
  if (!existsSync(`${caminho}${extra}`)) {
    console.log(`ERRO: falta o arquivo ffmpeg${extra} do pacote (a licença GPL precisa acompanhar o instalador).`);
    process.exit(3);
  }
}
const lista = execFileSync(caminho, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
const precisa = ['libx264', 'libvpx-vp9', 'libopus', 'libmp3lame', 'aac'];
let faltou = false;
console.log(execFileSync(caminho, ['-hide_banner', '-version'], { encoding: 'utf8' }).split('\n')[0]);
for (const nome of precisa) {
  const tem = new RegExp(`\\s${nome}\\s`).test(lista);
  if (!tem) faltou = true;
  console.log(`${tem ? 'SIM' : 'NÃO'}  ${nome}`);
}
process.exit(faltou ? 2 : 0);
