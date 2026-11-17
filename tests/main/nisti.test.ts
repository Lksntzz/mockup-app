import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { criarNisti, lerTxtDoAnuncio, urlDoNistiValida } from '../../src/main/nisti';
import { montarTxt } from '../../src/anuncios/txt';

const CHAVE = 'abcdefghij'.repeat(4);

async function montar(respostas: Array<number | 'cai'>, relogio = { t: 1_000_000 }) {
  const dir = await mkdtemp(join(tmpdir(), 'nisti-'));
  const chamadas: Array<{ url: string; auth: string; corpo: Record<string, string> }> = [];
  let k = 0;
  const buscar = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, auth: (init.headers as Record<string, string>).authorization!, corpo: JSON.parse(init.body as string) });
    const r = respostas[Math.min(k++, respostas.length - 1)]!;
    if (r === 'cai') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(r >= 400 ? { error: 'motivo ' + r } : { ok: true }), { status: r });
  }) as unknown as typeof fetch;
  const n = criarNisti({ arquivoConfig: join(dir, 'c.json'), arquivoFila: join(dir, 'f.json'), buscar, agora: () => relogio.t });
  return { n, dir, chamadas, relogio };
}
const v = (sku: string, ean: string, capa = 'Rosa') => ({ sku, ean, capa });

describe('lerTxtDoAnuncio', () => {
  test('lê título e só as variações completas; conta as que faltam', () => {
    const txt = montarTxt({ plataforma: 'Shopee', categoria: 'Agenda', arte: 'X', titulo: 'Agenda 2027 Rosa', variacoes: [
      { capa: 'Rosa', sku: 'AG_ROSA_WIRE', ean: '7891234567895' }, { capa: 'Azul', sku: '', ean: '' }, { capa: 'Verde', sku: 'AG_VERDE_WIRE', ean: '123' }] });
    const r = lerTxtDoAnuncio('﻿' + txt);
    expect(r.titulo).toBe('Agenda 2027 Rosa');
    expect(r.variacoes).toEqual([{ capa: 'Rosa', sku: 'AG_ROSA_WIRE', ean: '7891234567895', n: 1 }]);
    expect(r.faltando).toBe(2);
  });
});

describe('urlDoNistiValida', () => {
  test('exige https (http só em localhost) e devolve a origem', () => {
    expect(urlDoNistiValida('https://sistemanistiid.online/x')).toBe('https://sistemanistiid.online');
    expect(urlDoNistiValida('http://sistemanistiid.online')).toBeUndefined();
    expect(urlDoNistiValida('http://localhost:8787')).toBe('http://localhost:8787');
    expect(urlDoNistiValida('lixo')).toBeUndefined();
  });
});

describe('fila de envio ao NISTI', () => {
  test('envia com a chave, no formato do cadastro, e marca como enviado', async () => {
    const { n, chamadas } = await montar([201]);
    expect(await n.configurar('', CHAVE)).toEqual({ ok: true });
    await n.enfileirar('Agenda 2027', [v('AG_ROSA_WIRE', '7891234567895')]);
    await n.processar();
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.url).toBe('https://sistemanistiid.online/api/products');
    expect(chamadas[0]!.auth).toBe(`Bearer ${CHAVE}`);
    expect(chamadas[0]!.corpo).toEqual({ sku: 'AG_ROSA_WIRE', gtin: '7891234567895', nome: 'Agenda 2027', variacao: 'Rosa' });
    expect((await n.resumo()).contagem).toEqual({ aguardando: 0, enviado: 1, erro: 0 });
  });
  test('não reenvia o que já foi enviado e igual; reenvia se mudou', async () => {
    const { n, chamadas } = await montar([201]);
    await n.configurar('', CHAVE);
    await n.enfileirar('A', [v('S1', '7891234567895')]); await n.processar();
    expect(await n.enfileirar('A', [v('S1', '7891234567895')])).toBe(0);
    expect(await n.enfileirar('A novo', [v('S1', '7891234567895')])).toBe(1);
    await n.processar();
    expect(chamadas).toHaveLength(2);
  });
  test('sem chave: fica aguardando e não chama a rede', async () => {
    const { n, chamadas } = await montar([201]);
    await n.enfileirar('A', [v('S1', '7891234567895')]); await n.processar();
    expect(chamadas).toHaveLength(0);
    const r = await n.resumo();
    expect(r.configurado).toBe(false);
    expect(r.contagem.aguardando).toBe(1);
  });
  test('sem internet: tenta de novo mais tarde, sem perder o item', async () => {
    const { n, chamadas, relogio } = await montar(['cai', 201]);
    await n.configurar('', CHAVE);
    await n.enfileirar('A', [v('S1', '7891234567895')]);
    await n.processar();
    expect((await n.resumo()).contagem.aguardando).toBe(1);
    await n.processar(); // ainda não é hora
    expect(chamadas).toHaveLength(1);
    relogio.t += 31 * 60_000;
    await n.processar();
    expect((await n.resumo()).contagem.enviado).toBe(1);
  });
  test('erro do NISTI (ex.: GTIN já usado) vira erro permanente com a mensagem; tentarDeNovo reenvia', async () => {
    const { n, chamadas } = await montar([409, 201]);
    await n.configurar('', CHAVE);
    await n.enfileirar('A', [v('S1', '7891234567895')]); await n.processar();
    const r = await n.resumo();
    expect(r.contagem.erro).toBe(1);
    expect(r.itens[0]!.aviso).toBe('motivo 409');
    await n.tentarDeNovo();
    expect(chamadas).toHaveLength(2);
    expect((await n.resumo()).contagem.enviado).toBe(1);
  });
  test('chave recusada (401): para tudo e espera, sem marcar erro permanente', async () => {
    const { n, chamadas } = await montar([401]);
    await n.configurar('', CHAVE);
    await n.enfileirar('A', [v('S1', '7891234567895'), v('S2', '7891234567896')]); await n.processar();
    expect(chamadas).toHaveLength(1);
    const r = await n.resumo();
    expect(r.contagem).toEqual({ aguardando: 2, enviado: 0, erro: 0 });
    expect(r.itens[0]!.aviso).toMatch(/chave/i);
  });
  test('recusa chave curta e URL sem https; a chave nunca aparece no resumo', async () => {
    const { n, dir } = await montar([201]);
    expect((await n.configurar('', 'curta')).ok).toBe(false);
    expect((await n.configurar('http://x.com', CHAVE)).ok).toBe(false);
    await n.configurar('', CHAVE);
    expect(JSON.stringify(await n.resumo())).not.toContain(CHAVE);
    expect(await readFile(join(dir, 'c.json'), 'utf8')).toContain(CHAVE); // sem proteger() ela fica em texto local
  });
  test('usa proteger/revelar quando existem', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nisti-'));
    const n = criarNisti({ arquivoConfig: join(dir, 'c.json'), arquivoFila: join(dir, 'f.json'), proteger: (t) => 'enc:' + t.split('').reverse().join(''), revelar: (c) => c.slice(4).split('').reverse().join('') });
    await n.configurar('', CHAVE);
    expect(await readFile(join(dir, 'c.json'), 'utf8')).not.toContain(CHAVE);
    expect((await n.resumo()).configurado).toBe(true);
  });
  test('testar: 401 = recusada; 400 = chave aceita', async () => {
    const a = await montar([401]); await a.n.configurar('', CHAVE);
    expect((await a.n.testar()).ok).toBe(false);
    const b = await montar([400]); await b.n.configurar('', CHAVE);
    expect(await b.n.testar()).toEqual({ ok: true });
  });
  test('enfileirarDaPasta lê o .txt e enfileira só as completas', async () => {
    const { n, dir } = await montar([201]);
    const pasta = join(dir, 'arte'); await mkdir(pasta);
    await writeFile(join(pasta, 'arte.txt'), '﻿' + montarTxt({ plataforma: 'S', categoria: 'C', arte: 'arte', titulo: 'Agenda', variacoes: [
      { capa: 'Rosa', sku: 'AG_ROSA_WIRE', ean: '7891234567895' }, { capa: 'Azul', sku: 'AG_AZUL_WIRE', ean: '' }] }), 'utf8');
    expect(await n.enfileirarDaPasta(pasta)).toEqual({ entraram: 1, faltando: 1 });
  });
});

describe('foto do produto (mockup da frente)', () => {
  async function comMockup(arquivoNome: string | null, respostas: Array<number>) {
    const dir = await mkdtemp(join(tmpdir(), 'nisti-'));
    const pasta = join(dir, 'arte'); await mkdir(join(pasta, 'Arte', 'MKP'), { recursive: true });
    await writeFile(join(pasta, 'arte.txt'), '﻿' + montarTxt({ plataforma: 'S', categoria: 'C', arte: 'arte', titulo: 'Agenda', variacoes: [
      { capa: 'Rosa', sku: 'AG_ROSA_WIRE', ean: '7891234567895' }, { capa: 'Azul', sku: 'AG_AZUL_WIRE', ean: '7891234567896' }] }), 'utf8');
    if (arquivoNome) await writeFile(join(pasta, 'Arte', 'MKP', arquivoNome), Buffer.from([137, 80, 78, 71]));
    const chamadas: Array<{ url: string; corpo: unknown }> = [];
    let k = 0;
    const buscar = (async (url: string, init: RequestInit) => {
      chamadas.push({ url, corpo: init.body });
      const r = respostas[Math.min(k++, respostas.length - 1)]!;
      return new Response(JSON.stringify(url.endsWith('/image') ? { ok: true } : { ok: true, id: 40 + k }), { status: r });
    }) as unknown as typeof fetch;
    const n = criarNisti({ arquivoConfig: join(dir, 'c.json'), arquivoFila: join(dir, 'f.json'), buscar, agora: () => 1_000_000 });
    await n.configurar('', CHAVE);
    return { n, pasta, chamadas, dir };
  }
  test('envia a foto da variação certa com o id devolvido no cadastro, uma vez só', async () => {
    const t = await comMockup('arte_capa-02.png', [201, 201, 200]);
    await t.n.enfileirarDaPasta(t.pasta); await t.n.processar();
    const fotos = t.chamadas.filter((c) => c.url.includes('/image'));
    expect(fotos).toHaveLength(1);
    expect(fotos[0]!.url).toMatch(/\/api\/products\/42\/image$/); // 2ª variação = 2º cadastro = id 42
    expect(fotos[0]!.corpo).toBeInstanceOf(FormData);
    await t.n.processar();
    expect(t.chamadas.filter((c) => c.url.includes('/image'))).toHaveLength(1);
  });
  test('ignora mockup de especificação/verso e espera o da frente', async () => {
    const t = await comMockup('arte_capa-01_verso.png', [201]);
    await t.n.enfileirarDaPasta(t.pasta); await t.n.processar();
    expect(t.chamadas.filter((c) => c.url.includes('/image'))).toHaveLength(0);
    expect((await t.n.resumo()).contagem.enviado).toBe(2);
    await writeFile(join(t.pasta, 'Arte', 'MKP', 'arte_capa-01.png'), Buffer.from([1]));
    await t.n.processar();
    expect(t.chamadas.filter((c) => c.url.includes('/image'))).toHaveLength(1);
  });
});
