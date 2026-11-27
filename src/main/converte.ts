import { spawn as spawnReal } from 'node:child_process';
import { existsSync } from 'node:fs';
import { stat, statfs, unlink } from 'node:fs/promises';
import { dirname, join, parse } from 'node:path';
import { lerProgresso, montarArgumentos, nomeLivre } from '../converte/argumentos';
import { lerInfoDoFfmpeg, type InfoDoVideo } from '../converte/info';
import { planejar, type Pedido } from '../converte/plano';

export type Spawn = typeof spawnReal;

export type ResultadoDaLeitura = { ok: true; info: InfoDoVideo } | { ok: false; motivo: string };
export type ResultadoDaConversao =
  | { ok: true; saida: string; bytes: number }
  | { ok: false; motivo: string; cancelado?: boolean; pastaSemPermissao?: boolean };

export interface Conversor {
  ler(caminho: string): Promise<ResultadoDaLeitura>;
  converter(
    caminho: string,
    pedido: Pedido,
    aoProgredir: (p: { fracao: number; restanteS: number | null }) => void,
    /** Caminho escolhido pela pessoa quando a pasta do original não aceita gravação. */
    destino?: string,
  ): { cancelar(): void; fim: Promise<ResultadoDaConversao> };
  ocupado(): boolean;
  /** Versão do ffmpeg que está sendo usado (para o painel de Licenças); null se não deu para ler. */
  versao(): Promise<string | null>;
}

export interface OpcoesDoConversor {
  ffmpeg: string;
  spawn?: Spawn;
  existe?: (caminho: string) => boolean;
  tamanhoDoArquivo?: (caminho: string) => Promise<number>;
  espacoLivre?: (pasta: string) => Promise<number>;
  apagar?: (caminho: string) => Promise<void>;
  agora?: () => number;
}

const SEM_PERMISSAO = /permission denied|read-only file system|access is denied|EACCES|EROFS/i;
const MENSAGEM_NAO_LEU = 'Não consegui ler este arquivo como vídeo.';
const MENSAGEM_SEM_PROGRAMA = 'O programa de conversão (ffmpeg) não foi encontrado. Reinstale o app.';
const MB = 1048576;

/** Conversor de vídeo: roda o ffmpeg como programa separado, um vídeo por vez. */
export function criarConversor(o: OpcoesDoConversor): Conversor {
  const spawn = o.spawn ?? spawnReal;
  const existe = o.existe ?? existsSync;
  const tamanhoDoArquivo = o.tamanhoDoArquivo ?? (async (c: string) => (await stat(c)).size);
  const espacoLivre =
    o.espacoLivre ??
    (async (pasta: string) => {
      const s = await statfs(pasta);
      return Number(s.bavail) * Number(s.bsize);
    });
  const apagar = o.apagar ?? (async (c: string) => unlink(c).catch(() => undefined));
  const agora = o.agora ?? Date.now;
  let emUso = false;

  async function ler(caminho: string): Promise<ResultadoDaLeitura> {
    const r = await new Promise<{ texto: string } | { ausente: true }>((resolve) => {
      const p = spawn(o.ffmpeg, ['-hide_banner', '-i', caminho], { windowsHide: true });
      let texto = '';
      p.stderr?.on('data', (d: Buffer) => (texto += d.toString()));
      p.on('error', () => resolve({ ausente: true }));
      p.on('close', () => resolve({ texto }));
    });
    if ('ausente' in r) return { ok: false, motivo: MENSAGEM_SEM_PROGRAMA };
    const info = lerInfoDoFfmpeg(r.texto);
    if (!info) return { ok: false, motivo: MENSAGEM_NAO_LEU };
    info.tamanhoBytes = await tamanhoDoArquivo(caminho).catch(() => 0);
    return { ok: true, info };
  }

  function converter(caminho: string, pedido: Pedido, aoProgredir: (p: { fracao: number; restanteS: number | null }) => void, destino?: string) {
    if (emUso) return { cancelar: () => undefined, fim: Promise.resolve<ResultadoDaConversao>({ ok: false, motivo: 'Já existe uma conversão em andamento.' }) };
    emUso = true;
    let cancelado = false;
    let processo: ReturnType<Spawn> | undefined;
    const cancelou: ResultadoDaConversao = { ok: false, motivo: 'Conversão cancelada.', cancelado: true };

    const fim = (async (): Promise<ResultadoDaConversao> => {
      try {
        const lido = await ler(caminho);
        if (!lido.ok) return lido;
        if (cancelado) return cancelou;
        const planoInicial = planejar(lido.info, pedido);
        if (!planoInicial.ok) return planoInicial;
        let plano = planoInicial;
        // com destino: usa a pasta e o nome escolhidos (a "entrada" de mentira só garante que nada é sobrescrito)
        const saida = destino
          ? nomeLivre(join(dirname(destino), `${parse(destino).name}.__destino__`), pedido.formato, existe)
          : nomeLivre(caminho, pedido.formato, existe);
        const livre = await espacoLivre(dirname(saida)).catch(() => Infinity);
        if (plano.estimativaBytes !== null && livre < plano.estimativaBytes * 1.1) {
          return { ok: false, motivo: `Não há espaço livre suficiente nesta pasta para o resultado (cerca de ${Math.ceil(plano.estimativaBytes / MB)} MB).` };
        }
        if (cancelado) return cancelou;

        const duracao = lido.info.duracaoS;
        const rodar = (p: typeof plano) =>
          new Promise<{ codigo: number | null; stderr: string; ausente?: boolean }>((resolve) => {
            const proc = spawn(o.ffmpeg, montarArgumentos(p, caminho, saida), { windowsHide: true });
            processo = proc;
            const inicio = agora();
            let pendente = '';
            let stderr = '';
            proc.stdout?.on('data', (d: Buffer) => {
              const linhas = (pendente + d.toString()).split(/\r?\n/);
              pendente = linhas.pop() ?? '';
              for (const linha of linhas) {
                const prog = lerProgresso(linha);
                if (prog?.tipo === 'fim') aoProgredir({ fracao: 1, restanteS: 0 });
                else if (prog && duracao > 0) {
                  const fracao = Math.min(1, prog.segundos / duracao);
                  const passou = (agora() - inicio) / 1000;
                  aoProgredir({ fracao, restanteS: fracao >= 0.02 ? (passou * (1 - fracao)) / fracao : null });
                }
              }
            });
            proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
            proc.on('error', () => resolve({ codigo: -1, stderr, ausente: true }));
            proc.on('close', (codigo: number | null) => resolve({ codigo, stderr }));
          });

        // "Máximo de N MB" é uma promessa: se o resultado passar, apaga e refaz com taxa menor (o encoder de uma passagem erra para cima)
        const limite = pedido.tamanho.tipo === 'maximo' ? pedido.tamanho.mb * MB : null;
        for (let tentativa = 0; ; tentativa++) {
          const resultado = await rodar(plano);
          if (cancelado) {
            await apagar(saida);
            return cancelou;
          }
          if (resultado.ausente) return { ok: false, motivo: MENSAGEM_SEM_PROGRAMA };
          if (resultado.codigo !== 0) {
            await apagar(saida);
            if (SEM_PERMISSAO.test(resultado.stderr)) return { ok: false, motivo: 'Não consigo gravar nesta pasta.', pastaSemPermissao: true };
            const ultima = resultado.stderr.trim().split(/\r?\n/).pop()?.slice(0, 200) ?? '';
            return { ok: false, motivo: `A conversão falhou.${ultima ? ' ' + ultima : ''}` };
          }
          const bytes = await tamanhoDoArquivo(saida).catch(() => 0);
          if (limite === null || bytes <= limite) return { ok: true, saida, bytes };
          await apagar(saida);
          const taxa = plano.video?.kbps ?? plano.audio?.kbps;
          if (tentativa >= 2 || !taxa) {
            const mb = pedido.tamanho.tipo === 'maximo' ? pedido.tamanho.mb : 0;
            return { ok: false, motivo: `Não consegui deixar o resultado abaixo de ${Math.round(mb * 10) / 10} MB. Escolha um tamanho maior ou o nível Pequeno.` };
          }
          const novaTaxa = Math.max(1, Math.floor((taxa * limite * 0.9) / bytes));
          plano = plano.video?.kbps ? { ...plano, video: { ...plano.video, kbps: novaTaxa } } : { ...plano, audio: plano.audio ? { ...plano.audio, kbps: novaTaxa } : null };
        }
      } finally {
        emUso = false;
      }
    })();

    return {
      cancelar: () => {
        cancelado = true;
        processo?.kill();
      },
      fim,
    };
  }

  async function versao(): Promise<string | null> {
    const texto = await new Promise<string>((resolve) => {
      const p = spawn(o.ffmpeg, ['-hide_banner', '-version'], { windowsHide: true });
      let t = '';
      p.stdout?.on('data', (d: Buffer) => (t += d.toString()));
      p.stderr?.on('data', (d: Buffer) => (t += d.toString()));
      p.on('error', () => resolve(''));
      p.on('close', () => resolve(t));
    });
    return /^ffmpeg version (\S+)/m.exec(texto)?.[1] ?? null;
  }

  return { ler, converter, ocupado: () => emUso, versao };
}
