// Gera dist/: main, preload e renderer (com o pdf.js dentro), mais os arquivos estáticos.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/renderer', { recursive: true });

const node = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron', 'electron-updater'], logLevel: 'warning' };
await build({ ...node, entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.js' });
await build({ ...node, entryPoints: ['src/main/preload.ts'], outfile: 'dist/main/preload.js' });
await build({
  entryPoints: ['src/renderer/app.ts'],
  outfile: 'dist/renderer/app.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'chrome140',
  logLevel: 'warning',
});
cpSync('src/renderer/index.html', 'dist/renderer/index.html');
cpSync('src/renderer/styles.css', 'dist/renderer/styles.css');
cpSync('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', 'dist/renderer/pdf.worker.mjs');
console.log('build ok');
