import { EventEmitter } from 'node:events';
import { describe, expect, test } from 'vitest';
import { criarAtualizador, type EstadoAtualizacao } from '../../src/main/updater';

class AtualizadorFalso extends EventEmitter {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  verificacoes = 0;
  instalou = 0;
  falharAoVerificar: Error | null = null;
  async checkForUpdates(): Promise<null> {
    this.verificacoes++;
    if (this.falharAoVerificar) {
      this.emit('error', this.falharAoVerificar);
      throw this.falharAoVerificar;
    }
    this.emit('checking-for-update');
    return null;
  }
  argumentos: unknown[] = [];
  quitAndInstall(...args: unknown[]): void {
    this.instalou++;
    this.argumentos = args;
  }
}

function montar(ativo = true, ocioso: () => boolean = () => false) {
  const updater = new AtualizadorFalso();
  const estados: EstadoAtualizacao[] = [];
  const at = criarAtualizador({ updater, ativo, enviar: (e) => estados.push(e), ocioso });
  return { updater, estados, at };
}

describe('atualizador: instalado x desenvolvimento', () => {
  test('fora do app instalado (desenvolvimento) não verifica nada nem liga o download automático', async () => {
    const { updater, estados, at } = montar(false);
    await at.verificar(false);
    expect(updater.verificacoes).toBe(0);
    expect(updater.autoDownload).toBe(false);
    expect(estados).toEqual([]);
  });
  test('fora do app instalado, a verificação manual avisa o motivo em vez de ficar muda', async () => {
    const { estados, at } = montar(false);
    await at.verificar(true);
    expect(estados).toHaveLength(1);
    expect(estados[0]).toMatchObject({ tipo: 'erro', manual: true });
  });
  test('instalado: liga o download automático e a instalação ao fechar', () => {
    const { updater } = montar(true);
    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
  });
});

describe('atualizador: fluxo de estados', () => {
  test('verificando → nova versão → baixando com porcentagem → pronta', async () => {
    const { updater, estados, at } = montar();
    await at.verificar(false);
    updater.emit('update-available', { version: '0.3.0' });
    updater.emit('download-progress', { percent: 41.6 });
    updater.emit('update-downloaded', { version: '0.3.0' });
    expect(estados.map((e) => e.tipo)).toEqual(['verificando', 'baixando', 'baixando', 'pronta']);
    expect(estados[2]).toMatchObject({ tipo: 'baixando', versao: '0.3.0', percent: 42 });
    expect(estados[3]).toMatchObject({ tipo: 'pronta', versao: '0.3.0' });
  });
  test('sem versão nova: estado "atualizado"', async () => {
    const { updater, estados, at } = montar();
    await at.verificar(true);
    updater.emit('update-not-available', { version: '0.2.0' });
    expect(estados[estados.length - 1]).toMatchObject({ tipo: 'atualizado', manual: true });
  });
});

describe('atualizador: erros (sem internet, repositório indisponível)', () => {
  test('erro na verificação automática não derruba o app e é marcado como não manual (a tela não mostra)', async () => {
    const { updater, estados, at } = montar();
    updater.falharAoVerificar = new Error('net::ERR_INTERNET_DISCONNECTED');
    await expect(at.verificar(false)).resolves.toBeUndefined();
    expect(estados.filter((e) => e.tipo === 'erro')).toHaveLength(1); // um só, mesmo com 'error' + promessa rejeitada
    expect(estados[0]).toMatchObject({ tipo: 'erro', manual: false });
  });
  test('erro na verificação manual é marcado como manual (a tela mostra a mensagem)', async () => {
    const { updater, estados, at } = montar();
    updater.falharAoVerificar = new Error('HttpError: 404');
    await at.verificar(true);
    expect(estados[0]).toMatchObject({ tipo: 'erro', manual: true });
    expect((estados[0] as { mensagem: string }).mensagem).toMatch(/atualiza/i);
  });
});

describe('atualizador: instalar', () => {
  test('só reinicia para instalar quando a atualização já foi baixada', async () => {
    const { updater, at } = montar();
    at.instalar();
    expect(updater.instalou).toBe(0);
    updater.emit('update-downloaded', { version: '0.3.0' });
    at.instalar();
    expect(updater.instalou).toBe(1);
  });
  test('o botão Reiniciar instala em silêncio e reabre o app sozinho (sem o assistente de instalação)', () => {
    const { updater, at } = montar();
    updater.emit('update-downloaded', { version: '0.3.0' });
    at.instalar();
    expect(updater.argumentos).toEqual([true, true]);
  });
  test('não verifica de novo enquanto está baixando ou com a atualização pronta', async () => {
    const { updater, at } = montar();
    updater.emit('update-available', { version: '0.3.0' });
    await at.verificar(false);
    expect(updater.verificacoes).toBe(0);
    updater.emit('update-downloaded', { version: '0.3.0' });
    await at.verificar(true);
    expect(updater.verificacoes).toBe(0);
  });
});

describe('atualizador: instalar sozinho quando o app está escondido', () => {
  test('baixou e o app está escondido: instala na hora, em silêncio e reabrindo', () => {
    const { updater } = montar(true, () => true);
    updater.emit('update-downloaded', { version: '9.9.9' });
    expect(updater.instalou).toBe(1);
    expect(updater.argumentos).toEqual([true, true]);
  });
  test('baixou com a janela em uso: não instala; instala depois que o app ficar escondido', () => {
    let escondido = false;
    const { updater, at } = montar(true, () => escondido);
    updater.emit('update-downloaded', { version: '9.9.9' });
    expect(updater.instalou).toBe(0);
    at.instalarSeOcioso();
    expect(updater.instalou).toBe(0);
    escondido = true;
    at.instalarSeOcioso();
    expect(updater.instalou).toBe(1);
  });
  test('sem versão baixada não instala nada, mesmo escondido', () => {
    const { updater, at } = montar(true, () => true);
    at.instalarSeOcioso();
    expect(updater.instalou).toBe(0);
  });
  test('o botão Reiniciar continua instalando na hora (janela aberta)', () => {
    const { updater, at } = montar(true, () => false);
    updater.emit('update-downloaded', { version: '9.9.9' });
    at.instalar();
    expect(updater.instalou).toBe(1);
  });
});
