import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
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
const LIMITE_IMAGEM_BYTES = 11 * 1024 * 1024; // o NISTI aceita até 12 MB
const DESISTE_DA_IMAGEM_MS = 14 * 24 * 3600_000;

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
  /** Número da variação no .txt (1, 2, 3…): casa com o arquivo NOME_capa-01.png do mockup. */
  n?: number;
  /** id do produto no NISTI, devolvido no cadastro; é com ele que a foto é enviada. */
  produtoId?: number;
  imagem?: 'enviada' | 'desistiu';
  avisoImagem?: string;
}

export interface ResumoDoNisti {
  configurado: boolean;
  url: string;
  contagem: { aguardando: number; enviado: number; erro: number };
  itens: ItemDaFila[];
}

export interface VariacaoPronta { sku: string; ean: string; capa: string; n?: number }

/** Lê o .txt do anúncio (Título + linhas "n | Capa: x | SKU: y | EAN: z"). Só devolve variações completas: SKU e EAN de 13 dígitos. */
export function lerTxtDoAnuncio(texto: string): { titulo: string; variacoes: VariacaoPronta[]; faltando: number } {
  const limpo = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const titulo = /^Título:[ \t]*(.*)$/m.exec(limpo)?.[1]?.trim() ?? '';
  const variacoes: VariacaoPronta[] = [];
  let faltando = 0;
  for (const m of limpo.matchAll(/^(\d+) \| Capa: (.*?) \| SKU: (.*?) \| EAN: (.*)$/gm)) {
    const n = Number(m[1]);
    const capa = m[2]!.trim();
    const sku = m[3]!.trim();
    const ean = m[4]!.trim();
    if (!sku || sku === '(pendente)' || !/^\d{13}$/.test(ean)) { faltando += 1; continue; }
    variacoes.push({ capa, sku, ean, n });
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
  /** Reduz um PNG grande demais (acima do limite do NISTI). Sem isso, imagem grande não é enviada. */
  reduzir?: (png: Buffer) => Buffer | undefined;
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
        const dados = { sku, gtin: v.ean, nome: titulo, variacao: v.capa.trim() || sku, ...(v.n ? { n: v.n } : {}) };
        const atual = fila.find((i) => i.sku === sku);
        if (!atual) {
          fila.push({ ...dados, estado: 'aguardando', tentativas: 0, criadoEm: agora(), ...(pasta ? { pasta } : {}) });
          novos += 1;
          continue;
        }
        if (pasta) atual.pasta = pasta;
        if (dados.n) atual.n = dados.n;
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
      if (r.ok) {
        i.estado = 'enviado'; i.enviadoEm = agora(); delete i.aviso; delete i.proximaTentativa;
        try {
          const id = Number(((await r.json()) as { id?: unknown }).id);
          if (Number.isInteger(id) && id > 0) i.produtoId = id;
        } catch { /* sem id: a foto não poderá ser enviada */ }
        return 'ok';
      }
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

  /** Acha o mockup da frente (NOME_capa-NN.png, sem sufixo de especificação/verso) da variação, nas pastas MKP do anúncio. */
  async function acharMockup(pasta: string, n: number): Promise<string | undefined> {
    const alvo = new RegExp(`_capa-0*${n}\\.png$`, 'i');
    for (const dir of [join(pasta, 'Arte', 'MKP'), join(pasta, 'MKP')]) {
      let nomes: string[];
      try { nomes = await readdir(dir); } catch { continue; }
      const achado = nomes.filter((x) => alvo.test(x) && !/\.parcial\.png$/i.test(x)).sort()[0];
      if (achado) return join(dir, achado);
    }
    return undefined;
  }

  /** Envia a foto (mockup da frente) dos produtos já cadastrados, uma vez só por produto. */
  async function enviarImagem(cfg: { url: string; chave: string }, i: ItemDaFila): Promise<void> {
    if (i.estado !== 'enviado' || !i.produtoId || !i.pasta || !i.n || i.imagem) return;
    if (agora() - i.criadoEm > DESISTE_DA_IMAGEM_MS) { i.imagem = 'desistiu'; i.avisoImagem = 'Não achei o mockup da frente em 14 dias.'; return; }
    const arquivo = await acharMockup(i.pasta, i.n);
    if (!arquivo) { i.avisoImagem = 'Aguardando você exportar o mockup da frente.'; return; }
    try {
      let bytes: Uint8Array = await readFile(arquivo);
      if (bytes.length > LIMITE_IMAGEM_BYTES) {
        const menor = op.reduzir?.(Buffer.from(bytes));
        if (!menor || menor.length > LIMITE_IMAGEM_BYTES) { i.avisoImagem = 'O mockup passa de 11 MB e não consegui reduzir.'; return; }
        bytes = menor;
      }
      if (!(await stat(arquivo).then(() => true, () => false))) return;
      const form = new FormData();
      form.append('image', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'mockup.png');
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 60_000);
      try {
        const r = await buscar(`${cfg.url}/api/products/${i.produtoId}/image`, { method: 'POST', headers: { authorization: `Bearer ${cfg.chave}` }, body: form, signal: ctl.signal });
        if (r.ok) { i.imagem = 'enviada'; delete i.avisoImagem; return; }
        i.avisoImagem = r.status === 401 ? 'O NISTI não aceitou a chave ao enviar a foto.' : await mensagemDoServidor(r);
        if (r.status >= 400 && r.status < 500 && r.status !== 401 && r.status !== 429) i.imagem = 'desistiu';
      } finally { clearTimeout(t); }
    } catch (e) {
      i.avisoImagem = e instanceof Error && e.name === 'AbortError' ? 'O NISTI demorou demais para receber a foto.' : 'Sem conexão ao enviar a foto.';
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
        if (cfg.chave) for (const i of fila) await enviarImagem(cfg, i);
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
        for (const i of devidos) await enviarImagem(cfg, i);
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
