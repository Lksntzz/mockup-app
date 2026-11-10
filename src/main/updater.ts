import type { EventEmitter } from 'node:events';

export type EstadoAtualizacao =
  | { tipo: 'ocioso' }
  | { tipo: 'verificando'; manual: boolean }
  | { tipo: 'baixando'; versao: string; percent: number }
  | { tipo: 'pronta'; versao: string }
  | { tipo: 'atualizado'; manual: boolean }
  | { tipo: 'erro'; mensagem: string; manual: boolean };

/** O que usamos do electron-updater (assim os testes usam um atualizador falso). */
export interface AtualizadorLike extends EventEmitter {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(): void;
}

export interface OpcoesDoAtualizador {
  updater: AtualizadorLike;
  /** false no desenvolvimento (app não instalado): não há de onde atualizar. */
  ativo: boolean;
  enviar: (estado: EstadoAtualizacao) => void;
}

const MENSAGEM_ERRO = 'Não foi possível verificar atualizações agora. Confira a internet e tente de novo mais tarde.';
const MENSAGEM_DESENVOLVIMENTO = 'As atualizações só funcionam no app instalado.';

export function criarAtualizador({ updater, ativo, enviar }: OpcoesDoAtualizador) {
  let estado: EstadoAtualizacao = { tipo: 'ocioso' };
  let manual = false;
  const definir = (e: EstadoAtualizacao) => {
    estado = e;
    enviar(e);
  };

  if (ativo) {
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.on('checking-for-update', () => definir({ tipo: 'verificando', manual }));
    updater.on('update-available', (info: { version: string }) => definir({ tipo: 'baixando', versao: info.version, percent: 0 }));
    updater.on('download-progress', (p: { percent: number }) => {
      const versao = estado.tipo === 'baixando' ? estado.versao : '';
      definir({ tipo: 'baixando', versao, percent: Math.round(p.percent) });
    });
    updater.on('update-downloaded', (info: { version: string }) => definir({ tipo: 'pronta', versao: info.version }));
    updater.on('update-not-available', () => definir({ tipo: 'atualizado', manual }));
    // 'error' chega como evento E como promessa rejeitada: este é o único lugar que vira estado
    updater.on('error', () => definir({ tipo: 'erro', mensagem: MENSAGEM_ERRO, manual }));
  }

  return {
    async verificar(foiPedidaPeloUsuario: boolean): Promise<void> {
      if (!ativo) {
        if (foiPedidaPeloUsuario) definir({ tipo: 'erro', mensagem: MENSAGEM_DESENVOLVIMENTO, manual: true });
        return;
      }
      if (estado.tipo === 'baixando' || estado.tipo === 'pronta') return;
      manual = foiPedidaPeloUsuario;
      try {
        await updater.checkForUpdates();
      } catch {
        // o evento 'error' já virou estado; nunca deixa a exceção derrubar o app
      }
    },
    instalar(): void {
      if (estado.tipo === 'pronta') updater.quitAndInstall();
    },
    estado: () => estado,
  };
}
