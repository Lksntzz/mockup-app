import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { atualizarVistos, buscarFinalizados, listarClientes, novasArtesParaFazer, ultimaAlteracao } from '../../src/main/clientes';

let base = '';
const p = (n: number) => join(base, `${n}`);
const arq = (...partes: string[]) => writeFile(join(base, ...partes), 'x');
const pasta = (...partes: string[]) => mkdir(join(base, ...partes), { recursive: true });

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'cli-'));
  for (const n of [1, 2, 3, 4]) await mkdir(p(n));
});
afterEach(() => rm(base, { recursive: true, force: true }));

const pastas = () => ({ pasta1: p(1), pasta2: p(2), pasta3: p(3) });
const agoraLonge = () => Date.now() + 120_000;

describe('listarClientes', () => {
  test('mostra cada cliente na etapa da pasta onde está', async () => {
    await pasta('1', 'A'); await arq('1', 'A', 'arte.png');
    await pasta('2', 'B'); await arq('2', 'B', 'capa.pdf');
    await pasta('3', 'C');
    const { clientes } = await listarClientes(pastas(), agoraLonge(), 0);
    expect(clientes.map((c) => [c.nome, c.etapa])).toEqual([['A', 1], ['B', 2], ['C', 3]]);
  });
  test('etapa 1: arte a fazer, em andamento (falta cdr/pdf) e pronta para aprovar', async () => {
    await pasta('1', 'NOVA'); await arq('1', 'NOVA', 'arte.jpg');
    await pasta('1', 'MEIO', 'MKP'); await arq('1', 'MEIO', 'MKP', 'x-01.png'); await arq('1', 'MEIO', 'arte.png');
    await pasta('1', 'FIM', 'MKP'); await arq('1', 'FIM', 'MKP', 'x-01.png'); await arq('1', 'FIM', 'a.cdr'); await arq('1', 'FIM', 'a.pdf');
    const { clientes } = await listarClientes(pastas(), agoraLonge(), 0);
    const por = Object.fromEntries(clientes.map((c) => [c.nome, c]));
    expect(por.NOVA?.situacao).toBe('arte-a-fazer');
    expect(por.MEIO?.situacao).toBe('em-andamento');
    expect(por.MEIO?.faltando).toEqual(['arquivo .cdr', 'arquivo .pdf']);
    expect(por.FIM?.situacao).toBe('pronta-para-aprovar');
  });
  test('lista os nomes dos arquivos e separa as artes (pdf/jpg/png)', async () => {
    await pasta('1', 'A');
    for (const n of ['arte.JPG', 'capa.cdr', 'leia.txt']) await arq('1', 'A', n);
    const { clientes } = await listarClientes(pastas(), agoraLonge(), 0);
    expect(clientes[0]?.arquivos.sort()).toEqual(['arte.JPG', 'capa.cdr', 'leia.txt']);
    expect(clientes[0]?.artes.map((a) => a.split(/[\\/]/).pop())).toEqual(['arte.JPG']);
  });
  test('pasta de etapa não configurada ou inexistente vira aviso, sem derrubar as outras', async () => {
    await pasta('1', 'A');
    const { clientes, avisos } = await listarClientes({ pasta1: p(1), pasta2: join(base, 'nao-existe') }, agoraLonge(), 0);
    expect(clientes.map((c) => c.nome)).toEqual(['A']);
    expect(avisos.some((a) => /Pasta 2/.test(a))).toBe(true);
  });
  test('mesmo cliente em duas etapas aparece nas duas, marcado como duplicado', async () => {
    await pasta('1', 'X'); await pasta('2', 'x');
    const { clientes } = await listarClientes(pastas(), agoraLonge(), 0);
    expect(clientes.filter((c) => c.nome.toLowerCase() === 'x').every((c) => c.duplicado)).toBe(true);
  });
});

describe('buscarFinalizados', () => {
  test('acha por parte do nome, sem diferenciar maiúscula nem acento', async () => {
    await pasta('4', 'CECÍLIA PRESENTES'); await pasta('4', 'UNION SAFETY'); await pasta('4', 'Outro');
    expect((await buscarFinalizados(p(4), 'cecilia')).map((c) => [c.nome, c.etapa])).toEqual([['CECÍLIA PRESENTES', 4]]);
    expect((await buscarFinalizados(p(4), 'SAFE')).map((c) => c.nome)).toEqual(['UNION SAFETY']);
  });
  test('busca vazia não lista a pasta inteira e o resultado tem limite', async () => {
    for (let i = 0; i < 40; i++) await pasta('4', `cliente ${i}`);
    expect(await buscarFinalizados(p(4), '  ')).toEqual([]);
    expect(await buscarFinalizados(p(4), 'cliente', 25)).toHaveLength(25);
  });
});

describe('novasArtesParaFazer', () => {
  test('alerta só de cliente na etapa 1, sem MKP, com arte já presente e ainda não visto', async () => {
    await pasta('1', 'COM_ARTE'); await arq('1', 'COM_ARTE', 'a.png');
    await pasta('1', 'VAZIA'); // pasta recém-criada, sem arquivos ainda
    await pasta('1', 'JA_VISTA'); await arq('1', 'JA_VISTA', 'a.png');
    await pasta('2', 'OUTRA_ETAPA'); await arq('2', 'OUTRA_ETAPA', 'a.png');
    const { clientes } = await listarClientes(pastas(), agoraLonge(), 0);
    expect(novasArtesParaFazer(clientes, ['ja_vista'])).toEqual(['COM_ARTE']);
  });
});

describe('atualizarVistos (vigia do alerta)', () => {
  test('na primeira vez só marca o que já existe, sem alertar (evita enxurrada)', async () => {
    await pasta('1', 'A'); await arq('1', 'A', 'a.png');
    await pasta('1', 'B');
    const { clientes } = await listarClientes(pastas(), agoraLonge(), 0);
    expect(atualizarVistos(clientes, undefined)).toEqual({ alertar: [], vistos: ['A', 'B'] });
  });
  test('depois alerta só do que apareceu e já tem arte, e passa a lembrar dele', async () => {
    await pasta('1', 'A'); await arq('1', 'A', 'a.png');
    const antes = (await listarClientes(pastas(), agoraLonge(), 0)).clientes;
    const base1 = atualizarVistos(antes, undefined);
    await pasta('1', 'NOVO'); // criada vazia: ainda não alerta
    expect(atualizarVistos((await listarClientes(pastas(), agoraLonge(), 0)).clientes, base1.vistos).alertar).toEqual([]);
    await arq('1', 'NOVO', 'arte.pdf'); // chegou a arte
    const r = atualizarVistos((await listarClientes(pastas(), agoraLonge(), 0)).clientes, base1.vistos);
    expect(r.alertar).toEqual(['NOVO']);
    expect(atualizarVistos((await listarClientes(pastas(), agoraLonge(), 0)).clientes, r.vistos).alertar).toEqual([]);
  });
  test('guarda no máximo 500 nomes', () => {
    const muitos = Array.from({ length: 600 }, (_, i) => `c${i}`);
    expect(atualizarVistos([], muitos).vistos).toHaveLength(500);
  });
});

describe('pasta de grupo SHOPEE', () => {
  test('os clientes de dentro da SHOPEE aparecem como clientes, com o grupo; a SHOPEE em si não é cliente', async () => {
    await pasta('1', 'SHOPEE', 'LOJA X'); await arq('1', 'SHOPEE', 'LOJA X', 'arte.png');
    await pasta('1', 'AVULSO'); await arq('1', 'AVULSO', 'arte.png');
    await pasta('2', 'shopee', 'LOJA Y');
    const { clientes } = await listarClientes(pastas(), agoraLonge(), 0);
    expect(clientes.map((c) => [c.nome, c.etapa, c.grupo])).toEqual([
      ['AVULSO', 1, undefined],
      ['LOJA X', 1, 'SHOPEE'],
      ['LOJA Y', 2, 'shopee'],
    ]);
    expect(clientes.find((c) => c.nome === 'LOJA X')?.caminho).toBe(join(p(1), 'SHOPEE', 'LOJA X'));
  });
  test('mesmo nome em grupos diferentes não é duplicado; o mesmo nome no mesmo grupo em etapas diferentes é', async () => {
    await pasta('1', 'SHOPEE', 'A'); await pasta('1', 'A');
    await pasta('2', 'SHOPEE', 'A');
    const { clientes } = await listarClientes(pastas(), agoraLonge(), 0);
    const dup = clientes.filter((c) => c.duplicado).map((c) => [c.etapa, c.grupo]);
    expect(dup).toEqual([[1, 'SHOPEE'], [2, 'SHOPEE']]);
  });
  test('o alerta de arte para fazer vale para cliente dentro da SHOPEE e usa o grupo na chave', async () => {
    await pasta('1', 'SHOPEE', 'LOJA X'); await arq('1', 'SHOPEE', 'LOJA X', 'arte.png');
    await pasta('1', 'LOJA X'); await arq('1', 'LOJA X', 'arte.png');
    const { clientes } = await listarClientes(pastas(), agoraLonge(), 0);
    const r = atualizarVistos(clientes, ['LOJA X']);
    expect(r.alertar).toEqual(['SHOPEE / LOJA X']);
  });
});

describe('alterado depois do envio', () => {
  const T = 1_700_000_000_000;
  const em = (ms: number) => new Date(ms);
  const marcar = async (caminho: string, ms: number) => utimes(caminho, em(ms), em(ms));

  test('Pasta 2: arquivo mexido bem depois do envio marca o cliente; antes ou logo depois não marca', async () => {
    for (const n of ['MEXIDO', 'QUIETO', 'LOGO']) { await pasta('2', n); await arq('2', n, 'capa.cdr'); }
    await marcar(join(p(2), 'MEXIDO', 'capa.cdr'), T + 600_000);
    await marcar(join(p(2), 'QUIETO', 'capa.cdr'), T - 5_000);
    await marcar(join(p(2), 'LOGO', 'capa.cdr'), T + 30_000);
    const enviados = { MEXIDO: T, QUIETO: T, LOGO: T };
    const { clientes } = await listarClientes(pastas(), agoraLonge(), 0, enviados);
    const por = Object.fromEntries(clientes.map((c) => [c.nome, c.alteradoDepoisDoEnvio]));
    expect(por).toEqual({ MEXIDO: true, QUIETO: false, LOGO: false });
  });
  test('conta também arquivo novo dentro da subpasta MKP e vale para a Pasta 3', async () => {
    await pasta('3', 'SHOPEE', 'X', 'MKP'); await arq('3', 'SHOPEE', 'X', 'MKP', 'x-01.png');
    for (const f of [join(p(3), 'SHOPEE', 'X'), join(p(3), 'SHOPEE', 'X', 'MKP')]) await marcar(f, T - 9_000);
    await marcar(join(p(3), 'SHOPEE', 'X', 'MKP', 'x-01.png'), T + 900_000);
    const { clientes } = await listarClientes(pastas(), agoraLonge(), 0, { 'SHOPEE / X': T });
    expect(clientes[0]?.alteradoDepoisDoEnvio).toBe(true);
  });
  test('sem registro de envio (pasta que não foi enviada pelo app) e na Pasta 1 não marca nada', async () => {
    await pasta('2', 'SEM'); await arq('2', 'SEM', 'a.cdr'); await marcar(join(p(2), 'SEM', 'a.cdr'), T + 999_999);
    await pasta('1', 'UM'); await arq('1', 'UM', 'a.png'); await marcar(join(p(1), 'UM', 'a.png'), T + 999_999);
    const { clientes } = await listarClientes(pastas(), agoraLonge(), 0, { UM: T });
    expect(clientes.map((c) => c.alteradoDepoisDoEnvio)).toEqual([undefined, undefined]);
  });
});

describe('ultimaAlteracao', () => {
  test('é a data do arquivo mais novo da pasta do cliente ou da subpasta MKP; pasta vazia dá 0', async () => {
    await pasta('2', 'X', 'MKP'); await arq('2', 'X', 'a.cdr'); await arq('2', 'X', 'MKP', 'x-01.png');
    await utimes(join(p(2), 'X', 'a.cdr'), new Date(5000), new Date(5000));
    await utimes(join(p(2), 'X', 'MKP', 'x-01.png'), new Date(9000), new Date(9000));
    expect(await ultimaAlteracao(join(p(2), 'X'))).toBe(9000);
    await pasta('2', 'VAZIA');
    expect(await ultimaAlteracao(join(p(2), 'VAZIA'))).toBe(0);
  });
});
