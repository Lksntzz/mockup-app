import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Envio dos produtos dos anúncios para o NISTI ID (POST /api/products com a chave de integração).
 * O anúncio nunca espera o NISTI: o que está completo (SKU + EAN) entra numa fila gravada em disco e é enviado em segundo plano,
 * com nova tentativa sozinha se a internet ou o NISTI falharem. Reenviar é seguro: o NISTI atualiza pelo SKU em vez de duplicar.
 */

export const URL_PADRAO_DO_NISTI = 'https://sistemanistiid.online';
const TEMPO_LIMITE_MS = 15_000;
const ESPERA_MAXIMA_MS = 30 * 60_000;
const ESPERA_SEM_CHAVE_MS = 60_000;
const ESPERA_CHAVE_RECUSADA_MS = 10 * 60_000;
const MAX_ITENS_GUARDADOS = 500;

export interface ItemDaFila {
  sku: string; gtin: string; nome: string; variacao: string;
  estado: 'aguardando' | 'enviado' | 'erro';
  /** Última mensagem (erro ou motivo de ainda estar aguardando). */
  aviso?: string;
  tentativas: number;
  criadoEm: number;
  enviadoEm?: number;
  proximaTentativa?: number;
  pasta?: string;
}

export interface ResumoDoNisti {
  configurado: boolean;
  url: string;
  contagem: { aguardando: number; enviado: number; erro: number };
  itens: ItemDaFila[];
}

export interface VariacaoPronta { sku: string; ean: string; capa: string }

/** Lê o .txt do anúncio (Título + linhas "n | Capa: x | SKU: y | EAN: z"). Só devolve variações completas: SKU e EAN de 13 dígitos. */
export function lerTxtDoAnuncio(texto: string): { titulo: string; variacoes: VariacaoPronta[]; faltando: number } {
  const limpo = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const titulo = /^Título:[ \t]*(.*)$/m.exec(limpo)?.[1]?.trim() ?? '';
  const variacoes: VariacaoPronta[] = [];
  let faltando = 0;
  for (const m of limpo.matchAll(/^\d+ \| Capa: (.*?) \| SKU: (.*?) \| EAN: (.*)$/gm)) {
    const capa = m[1]!.trim();
    const sku = m[2]!.trim();
    const ean = m[3]!.trim();
    if (!sku || sku === '(pendente)' || !/^\d{13}$/.test(ean)) { faltando += 1; continue; }
    variacoes.push({ capa, sku, ean });
  }
  return { titulo, variacoes, faltando };
}

interface Persistido { url?: string; chave?: string; chaveProtegida?: boolean }

export interface OpcoesDoNisti {
  /** Arquivo da configuração (URL e chave) e arquivo da fila, ambos só desta máquina. */
  arquivoConfig: string;
  arquivoFila: string;
  buscar?: typeof fetch;
  agora?: () => number;
  /** Cifra/decifra a chave com o Windows (safeStorage). Sem isso, a chave fica em texto no arquivo. */
  proteger?: (texto: string) => string | undefined;
  revelar?: (cifrado: string) => string | undefined;
}

export type ResultadoTeste = { ok: true } | { ok: false; motivo: string };

export function urlDoNistiValida(bruta: string): string | undefined {
  try {
    const u = new URL(bruta.trim());
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return undefined;
    return u.origin;
  } catch { return undefined; }
}

export function criarNisti(op: OpcoesDoNisti) {
  const buscar = op.buscar ?? fetch;
  const agora = op.agora ?? Date.now;
  let gravacoes: Promise<unknown> = Promise.resolve();
  let processando: Promise<void> | undefined;

  const gravar = (arquivo: string, conteudo: unknown): Promise<void> => {
    const tarefa = gravacoes.then(async () => {
      await mkdir(dirname(arquivo), { recursive: true });
      const tmp = `${arquivo}.tmp`;
      await writeFile(tmp, JSON.stringify(conteudo, null, 2), 'utf8');
      await rename(tmp, arquivo);
    });
    gravacoes = tarefa.catch(() => undefined);
    return tarefa;
  };

  async function lerConfig(): Promise<{ url: string; chave: string }> {
    try {
      const b = JSON.parse(await readFile(op.arquivoConfig, 'utf8')) as Persistido;
      const url = typeof b.url === 'string' ? urlDoNistiValida(b.url) ?? URL_PADRAO_DO_NISTI : URL_PADRAO_DO_NISTI;
      let chave = '';
      if (typeof b.chave === 'string' && b.chave) {
        chave = b.chaveProtegida ? (op.revelar?.(b.chave) ?? '') : b.chave;
      }
      return { url, chave };
    } catch { return { url: URL_PADRAO_DO_NISTI, chave: '' }; }
  }

  async function lerFila(): Promise<ItemDaFila[]> {
    try {
      const b = JSON.parse(await readFile(op.arquivoFila, 'utf8')) as unknown;
      if (!Array.isArray(b)) return [];
      return b.filter((i): i is ItemDaFila => !!i && typeof i === 'object' && typeof (i as ItemDaFila).sku === 'string');
    } catch { return []; }
  }

  const salvarFila = (fila: ItemDaFila[]): Promise<void> => {
    // guarda todos os que ainda precisam de atenção e os enviados mais recentes
    const abertos = fila.filter((i) => i.estado !== 'enviado');
    const enviados = fila.filter((i) => i.estado === 'enviado').sort((a, b) => (b.enviadoEm ?? 0) - (a.enviadoEm ?? 0));
    return gravar(op.arquivoFila, [...abertos, ...enviados].slice(0, Math.max(MAX_ITENS_GUARDADOS, abertos.length)));
  };

  // todas as mudanças na fila passam por aqui, uma de cada vez
  let trava: Promise<unknown> = Promise.resolve();
  const mudarFila = <T>(f: (fila: ItemDaFila[]) => T | Promise<T>): Promise<T> => {
    const t = trava.then(async () => {
      const fila = await lerFila();
      const r = await f(fila);
      await salvarFila(fila);
      return r;
    });
    trava = t.catch(() => undefined);
    return t;
  };

  async function enfileirar(nome: string, vars: VariacaoPronta[], pasta?: string): Promise<number> {
    const titulo = nome.trim();
    if (!titulo || vars.length === 0) return 0;
    return mudarFila((fila) => {
      let novos = 0;
      for (const v of vars) {
        const sku = v.sku.trim().toUpperCase();
        const dados = { sku, gtin: v.ean, nome: titulo, variacao: v.capa.trim() || sku };
        const atual = fila.find((i) => i.sku === sku);
        if (!atual) {
          fila.push({ ...dados, estado: 'aguardando', tentativas: 0, criadoEm: agora(), ...(pasta ? { pasta } : {}) });
          novos += 1;
          continue;
        }
        const igual = atual.gtin === dados.gtin && atual.nome === dados.nome && atual.variacao === dados.variacao;
        if (atual.estado === 'enviado' && igual) continue;
        Object.assign(atual, dados, { estado: 'aguardando', tentativas: 0, proximaTentativa: 0 });
        delete atual.aviso;
        novos += 1;
      }
      return novos;
    });
  }

  /** Lê o .txt da pasta do anúncio e enfileira o que já está completo. Devolve quantas variações entraram e quantas ainda faltam dados. */
  async function enfileirarDaPasta(pasta: string): Promise<{ entraram: number; faltando: number }> {
    let nomes: string[];
    try { nomes = (await readdir(pasta)).filter((n) => n.toLowerCase().endsWith('.txt')); } catch { return { entraram: 0, faltando: 0 }; }
    for (const n of nomes) {
      let texto: string;
      try { texto = await readFile(join(pasta, n), 'utf8'); } catch { continue; }
      const lido = lerTxtDoAnuncio(texto);
      if (!/^Variações:/m.test(texto.replace(/^﻿/, ''))) continue;
      const entraram = await enfileirar(lido.titulo, lido.variacoes, pasta);
      return { entraram, faltando: lido.faltando };
    }
    return { entraram: 0, faltando: 0 };
  }

  const mensagemDoServidor = async (r: Response): Promise<string> => {
    try {
      const j = (await r.json()) as { error?: unknown };
      if (typeof j.error === 'string' && j.error) return j.error;
    } catch { /* sem corpo legível */ }
    return `O NISTI respondeu com erro ${r.status}.`;
  };

  async function enviarUm(cfg: { url: string; chave: string }, i: ItemDaFila): Promise<'ok' | 'recusada' | 'permanente' | 'tentar'> {
    const ctl = new AbortController();
    const temporizador = setTimeout(() => ctl.abort(), TEMPO_LIMITE_MS);
    try {
      const r = await buscar(`${cfg.url}/api/products`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.chave}` },
        body: JSON.stringify({ sku: i.sku, gtin: i.gtin, nome: i.nome, variacao: i.variacao }),
        signal: ctl.signal,
      });
      if (r.ok) { i.estado = 'enviado'; i.enviadoEm = agora(); delete i.aviso; delete i.proximaTentativa; return 'ok'; }
      if (r.status === 401) { i.aviso = 'O NISTI não aceitou a chave. Confira a chave na aba Configuração.'; return 'recusada'; }
      const motivo = await mensagemDoServidor(r);
      if (r.status === 429 || r.status >= 500) { i.aviso = motivo; return 'tentar'; }
      i.estado = 'erro'; i.aviso = motivo; return 'permanente';
    } catch (e) {
      i.aviso = e instanceof Error && e.name === 'AbortError' ? 'O NISTI demorou demais para responder.' : 'Sem conexão com o NISTI.';
      return 'tentar';
    } finally {
      clearTimeout(temporizador);
    }
  }

  /** Envia o que está aguardando e já passou da hora da próxima tentativa. Chamadas ao mesmo tempo viram uma só. */
  function processar(forcar = false): Promise<void> {
    if (processando) return processando;
    processando = (async () => {
      const cfg = await lerConfig();
      await mudarFila(async (fila) => {
        const agoraMs = agora();
        const devidos = fila.filter((i) => i.estado === 'aguardando' && (forcar || (i.proximaTentativa ?? 0) <= agoraMs));
        if (devidos.length === 0) return;
        if (!cfg.chave) {
          for (const i of devidos) { i.aviso = 'Falta a chave do NISTI (aba Configuração).'; i.proximaTentativa = agoraMs + ESPERA_SEM_CHAVE_MS; }
          return;
        }
        for (const i of devidos) {
          const r = await enviarUm(cfg, i);
          if (r === 'ok' || r === 'permanente') continue;
          i.tentativas += 1;
          if (r === 'recusada') {
            for (const o of devidos) if (o.estado === 'aguardando') { o.aviso = i.aviso!; o.proximaTentativa = agoraMs + ESPERA_CHAVE_RECUSADA_MS; }
            return; // chave errada vale para todos: não insiste item por item
          }
          i.proximaTentativa = agoraMs + Math.min(ESPERA_MAXIMA_MS, 30_000 * 2 ** Math.min(i.tentativas, 6));
        }
      });
    })().finally(() => { processando = undefined; });
    return processando;
  }

  return {
    enfileirar,
    enfileirarDaPasta,
    processar,
    async resumo(): Promise<ResumoDoNisti> {
      const [cfg, fila] = await Promise.all([lerConfig(), lerFila()]);
      const contagem = { aguardando: 0, enviado: 0, erro: 0 };
      for (const i of fila) contagem[i.estado] += 1;
      const ordem = { erro: 0, aguardando: 1, enviado: 2 } as const;
      const itens = [...fila].sort((a, b) => ordem[a.estado] - ordem[b.estado] || b.criadoEm - a.criadoEm).slice(0, 40);
      return { configurado: cfg.chave.length > 0, url: cfg.url, contagem, itens };
    },
    async configurar(url: unknown, chave: unknown): Promise<{ ok: true } | { ok: false; motivo: string }> {
      if (typeof url !== 'string' || typeof chave !== 'string') return { ok: false, motivo: 'Dados inválidos.' };
      const origem = urlDoNistiValida(url || URL_PADRAO_DO_NISTI);
      if (!origem) return { ok: false, motivo: 'O endereço do NISTI precisa começar com https://.' };
      const atual = await lerConfig();
      const nova = chave.trim() === '' ? atual.chave : chave.trim();
      if (nova && nova.length < 32) return { ok: false, motivo: 'A chave tem menos de 32 caracteres. Confira se copiou inteira.' };
      const cifrada = nova ? op.proteger?.(nova) : undefined;
      const dados: Persistido = nova ? (cifrada !== undefined ? { url: origem, chave: cifrada, chaveProtegida: true } : { url: origem, chave: nova }) : { url: origem };
      await gravar(op.arquivoConfig, dados);
      return { ok: true };
    },
    async removerChave(): Promise<void> {
      const atual = await lerConfig();
      await gravar(op.arquivoConfig, { url: atual.url } satisfies Persistido);
    },
    /** Reenvia os que deram erro (depois de o designer corrigir algo) e os que estão esperando. */
    async tentarDeNovo(): Promise<void> {
      await mudarFila((fila) => {
        for (const i of fila) if (i.estado === 'erro') { i.estado = 'aguardando'; i.tentativas = 0; delete i.aviso; }
        for (const i of fila) if (i.estado === 'aguardando') i.proximaTentativa = 0;
      });
      await processar(true);
    },
    /** Confere a chave sem cadastrar nada: manda um SKU inválido de propósito. 401 = chave recusada; outro 4xx = a chave foi aceita. */
    async testar(): Promise<ResultadoTeste> {
      const cfg = await lerConfig();
      if (!cfg.chave) return { ok: false, motivo: 'Falta a chave do NISTI.' };
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), TEMPO_LIMITE_MS);
      try {
        const r = await buscar(`${cfg.url}/api/products`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.chave}` },
          body: JSON.stringify({ sku: 'TESTE', gtin: '', nome: 'teste de conexão', variacao: 'teste' }),
          signal: ctl.signal,
        });
        if (r.status === 401) return { ok: false, motivo: 'O NISTI não aceitou a chave (ou a integração ainda não foi ligada nele).' };
        if (r.status === 403 || r.status === 404) return { ok: false, motivo: `O endereço não parece ser o do NISTI (erro ${r.status}).` };
        if (r.status >= 500) return { ok: false, motivo: `O NISTI está com problema agora (erro ${r.status}). Tente mais tarde.` };
        if (r.ok) return { ok: false, motivo: 'O NISTI aceitou um cadastro de teste. Avise o suporte: isso não era esperado.' };
        return { ok: true };
      } catch (e) {
        return { ok: false, motivo: e instanceof Error && e.name === 'AbortError' ? 'O NISTI demorou demais para responder.' : 'Sem conexão com o NISTI.' };
      } finally {
        clearTimeout(t);
      }
    },
  };
}

export type Nisti = ReturnType<typeof criarNisti>;
