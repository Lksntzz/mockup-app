import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import type { Pack, Raster } from '../../src/engine/types';

export async function lerPng(caminho: string): Promise<Raster> {
  const png = PNG.sync.read(await readFile(caminho));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}

/** Só para testes: carrega pack/mockup.json e todas as camadas PNG (chave = nome do arquivo). */
export async function loadPackNode(dir: string): Promise<{ pack: Pack; layers: Map<string, Raster> }> {
  const pack = JSON.parse(await readFile(join(dir, 'mockup.json'), 'utf-8')) as Pack;
  const layers = new Map<string, Raster>();
  const arquivos = [...pack.stack.flatMap((c) => (c.file ? [c.file] : [])), pack.artMask.file];
  for (const arquivo of arquivos) layers.set(arquivo, await lerPng(join(dir, 'layers', arquivo)));
  return { pack, layers };
}
