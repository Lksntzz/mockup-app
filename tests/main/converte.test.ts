import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { criarConversor, type Spawn } from '../../src/main/converte';
import type { Pedido } from '../../src/converte/plano';

const INFO_IPHONE = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '/v/a.mov':
  Duration: 00:00:26.17, start: 0.000000, bitrate: 11389 kb/s
  Stream #0:0[0x1](eng): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv, bt709), 1440x2560, 11257 kb/s, 30 fps, 30 tbr, 1000k tbn (default)
  Stream #0:1[0x2](eng): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 124 kb/s (default)
At least one output file must be specified
`;
const NAO_VIDEO = `Error opening input file falso.mov.\nError opening input files: Invalid data found when processing input\n`;
const MP4: Pedido = { formato: 'mp4', tamanho: { tipo: 'nivel', nivel: 'original' } };

type Processo = EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: () => void };
interface Roteiro {
  info?: string;
  /** Roda quando o ffmpeg de conversão "abre"; recebe o processo falso. */
  conversao?: (p: Processo) => void;
  /** kill() fecha o processo com este código (null = morto por sinal). */
  fecharAoMatar?: boolean;
}

function criar(roteiro: Roteiro, extra: Partial<Parameters<typeof criarConversor>[0]> = {}) {
  const chamadas: string[][] = [];
  let mortes = 0;
  const apagados: string[] = [];
  const spawn = ((_exe: string, args: string[]) => {
    chamadas.push(args);
    const p = new EventEmitter() as Processo;
    p.stdout = new EventEmitter();
    p.stderr = new EventEmitter();
    p.kill = () => {
      mortes++;
      if (roteiro.fecharAoMatar) setImmediate(() => p.emit('close', null));
    };
    if (args.includes('-progress')) {
      setImmediate(() => roteiro.conversao?.(p));
    } else {
      setImmediate(() => {
        p.stderr.emit('data', Buffer.from(roteiro.info ?? ''));
        p.emit('close', 1);
      });
    }
    return p;
  }) as unknown as Spawn;
  let t = 0;
  const conv = criarConversor({
    ffmpeg: '/bin/ffmpeg',
    spawn,
    existe: () => false,
    tamanhoDoArquivo: async (c) => (c.endsWith('.mp4') ? 22_000_000 : 37_254_613),
    espacoLivre: async () => 10_000_000_000,
    apagar: async (c) => void apagados.push(c),
    agora: () => (t += 10_000),
    ...extra,
  });
  return { conv, chamadas, apagados, mortes: () => mortes };
}
const espera = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const saidaOk = (p: Processo, linhas: string, codigo = 0) => {
  p.stdout.emit('data', Buffer.from(linhas));
  p.emit('close', codigo);
};

describe('ler', () => {
  test('devolve as informações e o tamanho do arquivo', async () => {
    const { conv } = criar({ info: INFO_IPHONE });
    const r = await conv.ler('/v/a.mov');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.info.video?.codec).toBe('hevc');
      expect(r.info.tamanhoBytes).toBe(37_254_613);
    }
  });
  test('arquivo que não é vídeo: mensagem clara', async () => {
    const { conv } = criar({ info: NAO_VIDEO });
    expect(await conv.ler('/v/falso.mov')).toEqual({ ok: false, motivo: 'Não consegui ler este arquivo como vídeo.' });
  });
  test('programa de conversão ausente: mensagem clara', async () => {
    const spawn = (() => {
      const p = new EventEmitter() as Processo;
      p.stdout = new EventEmitter();
      p.stderr = new EventEmitter();
      p.kill = () => undefined;
      setImmediate(() => p.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })));
      return p;
    }) as unknown as Spawn;
    const r = await criarConversor({ ffmpeg: '/nada', spawn }).ler('/v/a.mov');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/programa de conversão/);
  });
});

describe('converter', () => {
  test('mostra o progresso e termina com a saída ao lado do original', async () => {
    const eventos: Array<{ fracao: number; restanteS: number | null }> = [];
    const { conv } = criar({ info: INFO_IPHONE, conversao: (p) => saidaOk(p, 'out_time_us=13085000\nprogress=continue\nout_time_us=26170000\nprogress=end\n') });
    const r = await conv.converter('/v/a.mov', MP4, (e) => eventos.push(e)).fim;
    expect(r).toEqual({ ok: true, saida: '/v/a.mp4', bytes: 22_000_000 });
    expect(eventos[0]!.fracao).toBeCloseTo(0.5, 2);
    expect(eventos[0]!.restanteS).toBeCloseTo(10, 0);
    expect(eventos[eventos.length - 1]!.fracao).toBe(1);
  });
  test('ffmpeg falha: devolve o motivo e apaga a saída parcial', async () => {
    const { conv, apagados } = criar({ info: INFO_IPHONE, conversao: (p) => { p.stderr.emit('data', Buffer.from('algo deu errado\n')); p.emit('close', 1); } });
    const r = await conv.converter('/v/a.mov', MP4, () => undefined).fim;
    expect(r.ok).toBe(false);
    expect(apagados).toEqual(['/v/a.mp4']);
  });
  test('cancelar: mata o processo, apaga a saída parcial e marca cancelado', async () => {
    const { conv, apagados, mortes } = criar({ info: INFO_IPHONE, fecharAoMatar: true, conversao: () => undefined });
    const c = conv.converter('/v/a.mov', MP4, () => undefined);
    await espera();
    c.cancelar();
    const r = await c.fim;
    expect(r).toMatchObject({ ok: false, cancelado: true });
    expect(mortes()).toBe(1);
    expect(apagados).toEqual(['/v/a.mp4']);
    expect(conv.ocupado()).toBe(false);
  });
  test('pouco espaço no disco: recusa sem abrir o ffmpeg de conversão', async () => {
    const { conv, chamadas } = criar({ info: INFO_IPHONE }, { espacoLivre: async () => 1_000_000 });
    const r = await conv.converter('/v/a.mov', MP4, () => undefined).fim;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/espaço/);
    expect(chamadas.some((a) => a.includes('-progress'))).toBe(false);
  });
  test('ocupado: verdadeiro durante a conversão e falso depois (sucesso, erro e cancelamento)', async () => {
    const a = criar({ info: INFO_IPHONE, conversao: (p) => saidaOk(p, 'progress=end\n') });
    const c = a.conv.converter('/v/a.mov', MP4, () => undefined);
    expect(a.conv.ocupado()).toBe(true);
    await c.fim;
    expect(a.conv.ocupado()).toBe(false);
    const b = criar({ info: NAO_VIDEO });
    await b.conv.converter('/v/a.mov', MP4, () => undefined).fim;
    expect(b.conv.ocupado()).toBe(false);
  });
  test('segunda conversão enquanto há uma em andamento: recusa', async () => {
    const a = criar({ info: INFO_IPHONE, conversao: () => undefined, fecharAoMatar: true });
    const primeira = a.conv.converter('/v/a.mov', MP4, () => undefined);
    const segunda = await a.conv.converter('/v/b.mov', MP4, () => undefined).fim;
    expect(segunda).toEqual({ ok: false, motivo: 'Já existe uma conversão em andamento.' });
    primeira.cancelar();
    await primeira.fim;
  });
  test('caminho com acento, espaço e & chega ao ffmpeg como um único argumento', async () => {
    const entrada = 'C:\\Vídeos\\Meu & Filme [final].mov';
    const { conv, chamadas } = criar({ info: INFO_IPHONE, conversao: (p) => saidaOk(p, 'progress=end\n') });
    await conv.converter(entrada, MP4, () => undefined).fim;
    const conversao = chamadas.find((a) => a.includes('-progress'))!;
    expect(conversao.filter((x) => x === entrada)).toHaveLength(1);
  });
  test('pasta sem permissão: pede para escolher outro lugar (pastaSemPermissao)', async () => {
    const { conv } = criar({ info: INFO_IPHONE, conversao: (p) => { p.stderr.emit('data', Buffer.from('Could not write header: Permission denied\n')); p.emit('close', 1); } });
    const r = await conv.converter('/v/a.mov', MP4, () => undefined).fim;
    expect(r).toMatchObject({ ok: false, pastaSemPermissao: true });
  });
  test('destino escolhido (pasta sem permissão): grava ali e nunca sobrescreve', async () => {
    const { conv, chamadas } = criar({ info: INFO_IPHONE, conversao: (p) => saidaOk(p, 'progress=end\n') }, { existe: (c) => c === '/outra/Filme.mp4' });
    const r = await conv.converter('/v/a.mov', MP4, () => undefined, '/outra/Filme.mp4').fim;
    expect(r).toMatchObject({ ok: true, saida: '/outra/Filme (1).mp4' });
    expect(chamadas.find((a) => a.includes('-progress'))!.at(-1)).toBe('/outra/Filme (1).mp4');
  });
  test('máximo em MB: se o resultado passar do limite, refaz com taxa menor até caber', async () => {
    const MAX: Pedido = { formato: 'mp4', tamanho: { tipo: 'maximo', mb: 8 } };
    const tamanhos = [20_000_000, 8_000_000]; // 1ª saída passa de 8 MB (8 388 608 bytes), a 2ª cabe
    const { conv, chamadas, apagados } = criar(
      { info: INFO_IPHONE, conversao: (p) => saidaOk(p, 'progress=end\n') },
      { tamanhoDoArquivo: async (c) => (c.endsWith('.mp4') ? tamanhos.shift() ?? 8_000_000 : 37_254_613) },
    );
    const r = await conv.converter('/v/a.mov', MAX, () => undefined).fim;
    expect(r).toMatchObject({ ok: true, saida: '/v/a.mp4', bytes: 8_000_000 });
    const conversoes = chamadas.filter((a) => a.includes('-progress'));
    expect(conversoes).toHaveLength(2);
    const kbps = (a: string[]) => Number.parseInt(a[a.indexOf('-b:v') + 1]!, 10);
    expect(kbps(conversoes[1]!)).toBeLessThan(kbps(conversoes[0]!) * 0.5);
    expect(apagados).toEqual(['/v/a.mp4']); // a 1ª tentativa (grande demais) foi apagada
  });
  test('máximo em MB: se nem depois das tentativas couber, avisa e não entrega arquivo grande demais', async () => {
    const MAX: Pedido = { formato: 'mp4', tamanho: { tipo: 'maximo', mb: 8 } };
    const { conv, apagados } = criar(
      { info: INFO_IPHONE, conversao: (p) => saidaOk(p, 'progress=end\n') },
      { tamanhoDoArquivo: async (c) => (c.endsWith('.mp4') ? 30_000_000 : 37_254_613) },
    );
    const r = await conv.converter('/v/a.mov', MAX, () => undefined).fim;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/8 MB/);
    expect(apagados.length).toBeGreaterThanOrEqual(1);
  });
  test('arquivo que não é vídeo: não cria saída e explica', async () => {
    const { conv, chamadas } = criar({ info: NAO_VIDEO });
    const r = await conv.converter('/v/falso.mov', MP4, () => undefined).fim;
    expect(r).toEqual({ ok: false, motivo: 'Não consegui ler este arquivo como vídeo.' });
    expect(chamadas.some((a) => a.includes('-progress'))).toBe(false);
  });
});

// Teste com o ffmpeg de verdade: só roda quando FFMPEG_PATH aponta para um ffmpeg (ex.: o do pacote ffmpeg-static).
describe.skipIf(!process.env.FFMPEG_PATH)('com o ffmpeg real', () => {
  test('converte um clipe de 1 s, mantém o original e não sobrescreve um MP4 que já existe', async () => {
    const ffmpeg = process.env.FFMPEG_PATH!;
    const pasta = mkdtempSync(join(tmpdir(), 'converte-'));
    try {
      const entrada = join(pasta, 'Meu & Vídeo [1].mov');
      execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=1', '-f', 'lavfi', '-i', 'sine=duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', entrada]);
      const tamanhoAntes = statSync(entrada).size;
      writeFileSync(join(pasta, 'Meu & Vídeo [1].mp4'), 'ja existia');
      const conv = criarConversor({ ffmpeg });
      const r = await conv.converter(entrada, { formato: 'mp4', tamanho: { tipo: 'nivel', nivel: 'medio' } }, () => undefined).fim;
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.saida).toBe(join(pasta, 'Meu & Vídeo [1] (1).mp4'));
        expect(r.bytes).toBeGreaterThan(1000);
      }
      expect(statSync(entrada).size).toBe(tamanhoAntes);
      expect(existsSync(join(pasta, 'Meu & Vídeo [1].mp4'))).toBe(true);
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  test('vídeo de tamanho ímpar (721×1281) converte em MP4 original', async () => {
    const ffmpeg = process.env.FFMPEG_PATH!;
    const pasta = mkdtempSync(join(tmpdir(), 'converte-'));
    try {
      const entrada = join(pasta, 'impar.mp4');
      execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=720x1280:rate=25:duration=1', '-vf', 'pad=721:1281', '-c:v', 'libx264', '-pix_fmt', 'yuv444p', entrada]);
      const r = await criarConversor({ ffmpeg }).converter(entrada, { formato: 'mp4', tamanho: { tipo: 'nivel', nivel: 'original' } }, () => undefined).fim;
      expect(r.ok).toBe(true);
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  }, 60000);
  test('máximo em MB num vídeo com muito ruído: o resultado nunca passa do limite (MP4 e WebM)', async () => {
    const ffmpeg = process.env.FFMPEG_PATH!;
    const pasta = mkdtempSync(join(tmpdir(), 'converte-'));
    try {
      const entrada = join(pasta, 'ruido.mp4');
      execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=8', '-vf', 'noise=alls=100:allf=t', '-c:v', 'libx264', '-crf', '10', '-pix_fmt', 'yuv420p', entrada]);
      for (const formato of ['mp4', 'webm'] as const) {
        const r = await criarConversor({ ffmpeg }).converter(entrada, { formato, tamanho: { tipo: 'maximo', mb: 2 } }, () => undefined).fim;
        if (r.ok) expect(r.bytes).toBeLessThanOrEqual(2 * 1048576);
        else expect(r.motivo).toMatch(/abaixo de 2 MB/); // recusar com clareza também é aceitável; entregar arquivo grande não
      }
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  }, 240000);
});
