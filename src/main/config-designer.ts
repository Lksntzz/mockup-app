import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface ConfigDesigner {
  /** Liga as funções só do designer (painel da Pasta 1, qualidade, enviar para aprovar). Desligado por padrão. */
  designer: boolean;
  pasta1?: string;
  pasta2?: string;
  pasta3?: string;
  pasta4?: string;
  /** Clientes (nomes de pasta) que já geraram o alerta "arte para fazer"; não alerta de novo. */
  vistos?: string[];
  /** Quando (ms) cada cliente foi enviado para a Pasta 2 pelo app; base para o aviso "alterado depois do envio". */
  enviados?: Record<string, number>;
}

/** Configuração do Modo designer, num arquivo só desta máquina (nunca vai para o GitHub). */
export function criarConfigDesigner(arquivo: string) {
  async function ler(): Promise<ConfigDesigner> {
    try {
      const b = JSON.parse(await readFile(arquivo, 'utf-8')) as Record<string, unknown>;
      if (typeof b.designer !== 'boolean') return { designer: false };
      const c: ConfigDesigner = { designer: b.designer };
      if (typeof b.pasta1 === 'string') c.pasta1 = b.pasta1;
      if (typeof b.pasta2 === 'string') c.pasta2 = b.pasta2;
      if (typeof b.pasta3 === 'string') c.pasta3 = b.pasta3;
      if (typeof b.pasta4 === 'string') c.pasta4 = b.pasta4;
      if (Array.isArray(b.vistos) && b.vistos.every((v) => typeof v === 'string')) c.vistos = b.vistos as string[];
      if (b.enviados && typeof b.enviados === 'object' && !Array.isArray(b.enviados)) {
        const ok = Object.entries(b.enviados as Record<string, unknown>).filter(([, v]) => typeof v === 'number' && Number.isFinite(v));
        if (ok.length > 0) c.enviados = Object.fromEntries(ok) as Record<string, number>;
      }
      return c;
    } catch {
      return { designer: false };
    }
  }
  return {
    ler,
    async salvar(parcial: Partial<ConfigDesigner>): Promise<ConfigDesigner> {
      const atual = await ler();
      const novo = { ...atual, ...parcial };
      // outra Pasta 1 = outra lista de clientes: recomeça o "já visto" para não alertar todos de uma vez
      if (parcial.pasta1 !== undefined && parcial.pasta1 !== atual.pasta1 && parcial.vistos === undefined) delete novo.vistos;
      await mkdir(dirname(arquivo), { recursive: true });
      const tmp = `${arquivo}.tmp`;
      await writeFile(tmp, JSON.stringify(novo, null, 2), 'utf-8');
      await rename(tmp, arquivo);
      return novo;
    },
  };
}
