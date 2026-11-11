import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { caminhoServeParaOCorel, rodarMacroDoCorel, scriptVbs } from '../../src/main/corel';

let tmp = '';
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'corel-'));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('scriptVbs', () => {
  test('chama o macro pelas duas formas de endereço e escreve OK ou ERRO', () => {
    const vbs = scriptVbs('ArteDoClienteNoMolde');
    expect(vbs).toContain('"GlobalMacros", "MKP.ArteDoClienteNoMolde"');
    expect(vbs).toContain('"GlobalMacros.MKP", "ArteDoClienteNoMolde"');
    expect(vbs).toContain('CorelDRAW.Application');
    expect(vbs).toContain('WScript.Echo "OK"');
    expect(vbs).toContain('WScript.Echo "ERRO:');
  });
});

describe('caminhoServeParaOCorel', () => {
  test('aceita acentos do português e rejeita o que o Windows em português não lê', () => {
    expect(caminhoServeParaOCorel('I:\\OPERAÇÃO\\1 AGUARDA ARTE\\JOÃO\\arte.pdf')).toBe(true);
    expect(caminhoServeParaOCorel('C:\\Clientes\\日本\\arte.pdf')).toBe(false);
    expect(caminhoServeParaOCorel('')).toBe(false);
  });
});

describe('rodarMacroDoCorel', () => {
  const arteTxt = 'mockup-arte.txt';
  const pdfTxt = 'mockup-pdf.txt';

  test('grava o caminho em latin1, roda o script e limpa os arquivos depois', async () => {
    let lido = '';
    const r = await rodarMacroDoCorel('ArteDoClienteNoMolde', 'I:\\OPERAÇÃO\\arte.pdf', {
      plataforma: 'win32',
      pastaTemporaria: tmp,
      executar: async () => {
        lido = (await readFile(join(tmp, arteTxt))).toString('latin1');
        return { codigo: 0, saida: 'OK\r\n' };
      },
    });
    expect(r).toEqual({ ok: true });
    expect(lido).toBe('I:\\OPERAÇÃO\\arte.pdf');
    expect(await readdir(tmp)).toEqual([]);
  });

  test('o macro de PDF usa o arquivo mockup-pdf.txt', async () => {
    let existe = false;
    await rodarMacroDoCorel('ExportarPDFparaMKP', 'I:\\clientes\\ana', {
      plataforma: 'win32',
      pastaTemporaria: tmp,
      executar: async () => {
        existe = (await readdir(tmp)).includes(pdfTxt);
        return { codigo: 0, saida: 'OK' };
      },
    });
    expect(existe).toBe(true);
  });

  test('devolve o motivo do script quando o Corel não responde, e ainda limpa', async () => {
    const r = await rodarMacroDoCorel('ArteDoClienteNoMolde', 'C:\\a\\arte.pdf', {
      plataforma: 'win32',
      pastaTemporaria: tmp,
      executar: async () => ({ codigo: 2, saida: 'ERRO: nao consegui falar com o CorelDRAW (x)\r\n' }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('nao consegui falar com o CorelDRAW');
    expect(await readdir(tmp)).toEqual([]);
  });

  test('fora do Windows não tenta nada', async () => {
    let chamou = false;
    const r = await rodarMacroDoCorel('ArteDoClienteNoMolde', '/x/arte.pdf', {
      plataforma: 'linux',
      pastaTemporaria: tmp,
      executar: async () => {
        chamou = true;
        return { codigo: 0, saida: 'OK' };
      },
    });
    expect(r.ok).toBe(false);
    expect(chamou).toBe(false);
  });

  test('caminho com caractere fora do alfabeto do Windows é recusado antes de rodar', async () => {
    let chamou = false;
    const r = await rodarMacroDoCorel('ArteDoClienteNoMolde', 'C:\\日本\\arte.pdf', {
      plataforma: 'win32',
      pastaTemporaria: tmp,
      executar: async () => {
        chamou = true;
        return { codigo: 0, saida: 'OK' };
      },
    });
    expect(r.ok).toBe(false);
    expect(chamou).toBe(false);
  });

  test('erro ao executar o script (cscript sumiu, tempo esgotado) vira mensagem, não exceção', async () => {
    const r = await rodarMacroDoCorel('ArteDoClienteNoMolde', 'C:\\a\\arte.pdf', {
      plataforma: 'win32',
      pastaTemporaria: tmp,
      executar: async () => {
        throw new Error('timeout');
      },
    });
    expect(r.ok).toBe(false);
    expect(await readdir(tmp)).toEqual([]);
  });
});

describe('achouArquivoNovo', () => {
  test('só conta arquivo do tipo certo alterado depois do início', async () => {
    const { writeFile, utimes } = await import('node:fs/promises');
    const { achouArquivoNovo } = await import('../../src/main/corel');
    const inicio = Date.now();
    await writeFile(join(tmp, 'velho.pdf'), 'x');
    await utimes(join(tmp, 'velho.pdf'), new Date(inicio - 60_000), new Date(inicio - 60_000));
    expect(await achouArquivoNovo(tmp, inicio, /\.pdf$/i)).toBe(false);
    await writeFile(join(tmp, 'Cliente - MOLDE.cdr'), 'x');
    expect(await achouArquivoNovo(tmp, inicio, /\.pdf$/i)).toBe(false);
    await writeFile(join(tmp, 'novo.pdf'), 'x');
    expect(await achouArquivoNovo(tmp, inicio, /\.pdf$/i)).toBe(true);
    expect(await achouArquivoNovo(tmp, inicio, /- MOLDE\.cdr$/i)).toBe(true);
  });
  test('pasta que não existe não derruba', async () => {
    const { achouArquivoNovo } = await import('../../src/main/corel');
    expect(await achouArquivoNovo(join(tmp, 'nao-existe'), 0, /\.pdf$/i)).toBe(false);
  });
});
