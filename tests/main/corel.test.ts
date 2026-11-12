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
  test('nunca usa GetObject para achar o Corel (ele não aparece assim; só CreateObject conecta no que já está aberto)', () => {
    for (const macro of ['ArteDoClienteNoMolde', 'ExportarPDFparaMKP'] as const) {
      const vbs = scriptVbs(macro);
      expect(vbs).not.toContain('GetObject(, "CorelDRAW');
      expect(vbs).toContain('CreateObject("CorelDRAW.Application")');
    }
  });
  test('carrega o VBA do Corel (InitializeVBA) antes de rodar o macro: por padrão o Corel só carrega o VBA quando precisa', () => {
    for (const macro of ['ArteDoClienteNoMolde', 'ExportarPDFparaMKP'] as const) {
      const vbs = scriptVbs(macro);
      expect(vbs).toContain('app.InitializeVBA');
      expect(vbs.indexOf('app.InitializeVBA')).toBeLessThan(vbs.indexOf('RunMacro'));
    }
  });
  test('descobre se o Corel está aberto pelos processos do Windows', () => {
    const vbs = scriptVbs('ArteDoClienteNoMolde');
    expect(vbs).toContain('Win32_Process');
    expect(vbs).toContain('CorelDRW.exe');
  });
  test('Corel fechado: só abre o molde pelo Windows (como um duplo clique) e para, sem mandar comandos ao Corel recém-aberto', () => {
    const vbs = scriptVbs('ArteDoClienteNoMolde');
    expect(vbs).toContain('WScript.Shell');
    expect(vbs).toContain('C:\\MOLDE\\MOLDE.cdr');
    expect(vbs).toContain('WScript.Sleep');
    expect(vbs).toContain('ABERTO');
    expect(vbs).not.toContain('MainWindowTitle');
  });
  test('gerar PDF com o Corel fechado não abre nada: pede para abrir o .cdr do cliente', () => {
    const vbs = scriptVbs('ExportarPDFparaMKP');
    expect(vbs).not.toContain('WScript.Shell');
    expect(vbs).toContain('nao esta aberto');
  });
  test('a mensagem de erro traz o motivo de cada tentativa, não só o da última', () => {
    const vbs = scriptVbs('ExportarPDFparaMKP');
    expect(vbs).toContain('erro1');
    expect(vbs).toContain('erro2');
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

describe('linhasDoMolde', () => {
  test('três linhas: destino, frente e verso (vazia quando não há)', async () => {
    const { linhasDoMolde } = await import('../../src/main/corel');
    expect(linhasDoMolde({ destino: 'C:\\c\\a - MOLDE.cdr', frente: 'C:\\c\\a.png', verso: 'C:\\c\\b.png' })).toBe('C:\\c\\a - MOLDE.cdr\r\nC:\\c\\a.png\r\nC:\\c\\b.png');
    expect(linhasDoMolde({ destino: 'C:\\c\\a - MOLDE.cdr', frente: 'C:\\c\\a.png' })).toBe('C:\\c\\a - MOLDE.cdr\r\nC:\\c\\a.png\r\n');
    expect(linhasDoMolde({ destino: 'C:\\c\\a - MOLDE.cdr', verso: 'C:\\c\\b.png' })).toBe('C:\\c\\a - MOLDE.cdr\r\n\r\nC:\\c\\b.png');
  });
  test('o app aceita o texto de três linhas (quebra de linha não atrapalha a checagem de letras)', async () => {
    const { linhasDoMolde, caminhoServeParaOCorel } = await import('../../src/main/corel');
    expect(caminhoServeParaOCorel(linhasDoMolde({ destino: 'I:\\OPERAÇÃO\\a - MOLDE.cdr', frente: 'I:\\OPERAÇÃO\\a.png' }))).toBe(true);
  });
});

describe('interpretarResultadoDoMolde', () => {
  test('frente e verso importados, com o tamanho que ficaram', async () => {
    const { interpretarResultadoDoMolde } = await import('../../src/main/corel');
    const r = interpretarResultadoDoMolde('frente=OK 150,0 x 210,0 mm\r\nverso=OK 149,9 x 210,0 mm\r\n');
    expect(r).toEqual({
      frente: { estado: 'ok', detalhe: '150,0 x 210,0 mm' },
      verso: { estado: 'ok', detalhe: '149,9 x 210,0 mm' },
    });
  });
  test('uma face sem arte (SEM) e uma face que deu erro', async () => {
    const { interpretarResultadoDoMolde } = await import('../../src/main/corel');
    const r = interpretarResultadoDoMolde('frente=OK 150,0 x 210,0 mm\nverso=SEM\n');
    expect(r.verso).toEqual({ estado: 'sem' });
    const e = interpretarResultadoDoMolde('frente=ERRO O molde nao tem a pagina 1.\nverso=SEM');
    expect(e.frente).toEqual({ estado: 'erro', detalhe: 'O molde nao tem a pagina 1.' });
  });
  test('arquivo que já existia é avisado; texto vazio ou estranho não derruba', async () => {
    const { interpretarResultadoDoMolde } = await import('../../src/main/corel');
    expect(interpretarResultadoDoMolde('existente=1').jaExistia).toBe(true);
    expect(interpretarResultadoDoMolde('')).toEqual({});
    expect(interpretarResultadoDoMolde('lixo\n???')).toEqual({});
  });
});

describe('lerResultadoDoMolde', () => {
  test('lê o arquivo, devolve e apaga; sem arquivo devolve nada', async () => {
    const { writeFile } = await import('node:fs/promises');
    const { lerResultadoDoMolde } = await import('../../src/main/corel');
    expect(await lerResultadoDoMolde(tmp)).toBeUndefined();
    await writeFile(join(tmp, 'mockup-resultado.txt'), 'frente=OK 150,0 x 210,0 mm\r\nverso=SEM\r\n', 'latin1');
    const r = await lerResultadoDoMolde(tmp);
    expect(r?.frente?.estado).toBe('ok');
    expect(await readdir(tmp)).toEqual([]);
  });
});

describe('scriptVbs: Corel que não responde', () => {
  test('arte: Corel existente que recusa conexão é finalizado e o molde é aberto de novo', () => {
    const vbs = scriptVbs('ArteDoClienteNoMolde');
    expect(vbs).toContain('taskkill /F /IM CorelDRW.exe');
    expect(vbs.indexOf('taskkill')).toBeLessThan(vbs.indexOf('sh.Run """C:\\MOLDE\\MOLDE.cdr"""'));
  });
  test('PDF: Corel que não responde nunca é finalizado (pode ter trabalho aberto)', () => {
    expect(scriptVbs('ExportarPDFparaMKP')).not.toContain('taskkill');
  });
  test('erro de conexão 462 não repete o macro (repetir por cima travava o Corel)', () => {
    expect(scriptVbs('ArteDoClienteNoMolde')).toContain('If n1 = 462 Then Exit For');
  });
});

describe('rodarMacroDoCorel: Corel estava fechado', () => {
  test('quando o script só abriu o Corel, devolve aviso "aberto" (não é erro) pedindo o segundo clique', async () => {
    const r = await rodarMacroDoCorel('ArteDoClienteNoMolde', 'I:\\a.png', {
      plataforma: 'win32',
      pastaTemporaria: tmp,
      executar: async () => ({ codigo: 0, saida: 'ABERTO: abri o CorelDRAW com o molde.\r\n' }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.aberto).toBe(true);
      expect(r.motivo).toContain('clique de novo');
    }
  });
});

describe('macro AnuncioNoMolde', () => {
  test('o macro do anúncio abre o molde quando o Corel está fechado, como o da arte', () => {
    expect(scriptVbs('AnuncioNoMolde')).toBe(scriptVbs('ArteDoClienteNoMolde').replace(/ArteDoClienteNoMolde/g, 'AnuncioNoMolde'));
  });
  test('os scripts dos macros antigos não mudaram: arte abre o molde, PDF não', () => {
    const arte = scriptVbs('ArteDoClienteNoMolde');
    expect(arte).toContain('ABERTO:');
    expect(arte).toContain('sh.Run """C:\\MOLDE\\MOLDE.cdr"""');
    expect(arte).toContain('taskkill /F /IM CorelDRW.exe');
    const pdf = scriptVbs('ExportarPDFparaMKP');
    expect(pdf).not.toContain('ABERTO:');
    expect(pdf).not.toContain('taskkill');
    expect(pdf).toContain('nao esta aberto');
  });
  test('interpretarResultadoDoAnuncio lê ok com ampliação e erro com detalhe', async () => {
    const { interpretarResultadoDoAnuncio } = await import('../../src/main/corel');
    expect(interpretarResultadoDoAnuncio('capa1=OK 105%\r\ncapa2=ERRO sem retangulo')).toEqual({
      capas: [{ n: 1, estado: 'ok', ampliacao: 1.05 }, { n: 2, estado: 'erro', detalhe: 'sem retangulo' }],
    });
  });
  test('interpretarResultadoDoAnuncio é tolerante: decimais, vírgula, maiúsculas, linhas estranhas, ERRO vazio', async () => {
    const { interpretarResultadoDoAnuncio } = await import('../../src/main/corel');
    const r = interpretarResultadoDoAnuncio('\r\nlixo\r\nCAPA3=ok 104,5%\ncapa1=Ok 104.5%\ncapa2=erro\nx=1\n');
    expect(r).toEqual({
      capas: [
        { n: 3, estado: 'ok', ampliacao: 1.045 },
        { n: 1, estado: 'ok', ampliacao: 1.045 },
        { n: 2, estado: 'erro' },
      ],
    });
    expect(interpretarResultadoDoAnuncio('')).toEqual({ capas: [] });
  });
  test('lerResultadoDoAnuncio lê, devolve e apaga; sem arquivo devolve nada', async () => {
    const { writeFile } = await import('node:fs/promises');
    const { lerResultadoDoAnuncio } = await import('../../src/main/corel');
    expect(await lerResultadoDoAnuncio(tmp)).toBeUndefined();
    await writeFile(join(tmp, 'mockup-resultado.txt'), 'capa1=OK 105%\r\n', 'latin1');
    expect(await lerResultadoDoAnuncio(tmp)).toEqual({ capas: [{ n: 1, estado: 'ok', ampliacao: 1.05 }] });
    expect(await readdir(tmp)).toEqual([]);
  });
  test('rodarMacroDoCorel grava o caminho em mockup-anuncio.txt', async () => {
    let existe = false;
    await rodarMacroDoCorel('AnuncioNoMolde', 'I:\\a', {
      plataforma: 'win32',
      pastaTemporaria: tmp,
      executar: async () => {
        existe = (await readdir(tmp)).includes('mockup-anuncio.txt');
        return { codigo: 0, saida: 'OK' };
      },
    });
    expect(existe).toBe(true);
  });
});
