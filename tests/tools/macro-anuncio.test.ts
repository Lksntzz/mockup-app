import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// O macro só roda no CorelDRAW real (ver docs/teste-manual-anuncios.md); aqui só conferimos o arquivo.
describe('tools/corel/MKP.bas', () => {
  const bytes = readFileSync('tools/corel/MKP.bas');
  const bas = bytes.toString('latin1');

  test('MKP.bas tem as rotinas do anúncio', () => {
    for (const r of ['Sub AnuncioNoMolde', 'Sub AnuncioDaPasta', 'AcharRetanguloDoEan', 'DesenharEan']) expect(bas).toContain(r);
    expect(bas).toMatch(/Private Function DesenharEan\(.*\) As Double/);
    expect(bas).toMatch(/Private Function AcharRetanguloDoEan\(pagina As Page\) As Shape/);
  });

  test('os macros antigos continuam lá', () => {
    for (const r of ['Sub ArteDoClienteNoMolde()', 'Sub ExportarPDFparaMKP()', 'Private Function LerLinhasEApagar', 'Private Sub ColocarArte(']) {
      expect(bas).toContain(r);
    }
  });

  test('o arquivo continua com quebras CRLF e sem caracteres fora do latin1 de controle', () => {
    for (let i = 0; i < bytes.length; i += 1) {
      if (bytes[i] === 0x0a) expect(bytes[i - 1], `LF sem CR no byte ${i}`).toBe(0x0d);
      if (bytes[i] === 0x0d) expect(bytes[i + 1], `CR sem LF no byte ${i}`).toBe(0x0a);
    }
    // nada da faixa 0x80–0x9F (sinal de UTF-8 ou caractere que o VBA lê errado)
    expect(bytes.some((b) => b >= 0x80 && b <= 0x9f)).toBe(false);
  });

  test('AnuncioDaPasta tenta Corel\\montar.txt e depois _corel\\montar.txt', () => {
    expect(bas).toContain('\\Corel\\montar.txt');
    expect(bas).toContain('\\_corel\\montar.txt');
    expect(bytes.some((b) => b > 127)).toBe(false);
  });

  test('AcharRetanguloDoEan também procura nas camadas especiais (o retângulo do molde fica em Linhas-guia, bloqueado), depois das comuns', () => {
    const corpo = bas.slice(bas.indexOf('Private Function AcharRetanguloDoEan'), bas.indexOf('Private Function ProcurarPorNome'));
    expect(corpo).not.toContain('If Not CamadaEspecial(camada)');
    const comuns = corpo.indexOf('ProcurarEmCamadas(pagina, False)');
    const especiais = corpo.indexOf('ProcurarEmCamadas(pagina, True)');
    expect(comuns).toBeGreaterThan(-1);
    expect(especiais).toBeGreaterThan(comuns);
    expect(bas).toContain('Private Function ProcurarEmCamadas(pagina As Page, especiais As Boolean) As Shape');
  });

  test('DesenharEan cria primeiro um fundo branco de cantos arredondados do tamanho do desenho (atrás das barras) e o põe no mesmo grupo', () => {
    const ini = bas.indexOf('Private Function DesenharEan');
    const corpo = bas.slice(ini, bas.indexOf('End Function', ini));
    const fundo = corpo.indexOf('PintarDeBranco');
    const barras = corpo.indexOf('PintarDePreto');
    expect(fundo).toBeGreaterThan(-1);
    expect(fundo).toBeLessThan(barras);
    expect(corpo).toMatch(/CreateRectangle2\(x0, y0, larguraMm, EAN_ALTURA \* k, EAN_RAIO_FUNDO \* k, EAN_RAIO_FUNDO \* k, EAN_RAIO_FUNDO \* k, EAN_RAIO_FUNDO \* k\)/);
    expect(bas).toMatch(/Const EAN_RAIO_FUNDO As Double = \d/);
    expect(bas).toMatch(/Private Sub PintarDeBranco\(s As Shape\)[\s\S]*CreateCMYKColor\(0, 0, 0, 0\)/);
    expect(corpo).toContain('formas.Add fundo');
  });

  test('as declarações do módulo vêm antes da primeira rotina (exigência do VBA)', () => {
    const linhas = bas.split('\r\n');
    const primeiraRotina = linhas.findIndex((l) => /^(Private |Public )?(Sub|Function) /.test(l));
    const ultimaConst = linhas.reduce((u, l, i) => (/^(Private )?Const /.test(l) || /^Private \w+ As /.test(l) ? i : u), -1);
    expect(primeiraRotina).toBeGreaterThan(ultimaConst);
  });
});
