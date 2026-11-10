import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('mockupApi', {
  carregarPacote: () => ipcRenderer.invoke('carregar-pacote'),
  escolherPdf: () => ipcRenderer.invoke('escolher-pdf'),
  escolherPasta: () => ipcRenderer.invoke('escolher-pasta'),
  existe: (c: string) => ipcRenderer.invoke('existe', c),
  gravarArquivo: (c: string, b: Uint8Array) => ipcRenderer.invoke('gravar-arquivo', c, b),
  renomearArquivo: (de: string, para: string) => ipcRenderer.invoke('renomear-arquivo', de, para),
  removerArquivo: (c: string) => ipcRenderer.invoke('remover-arquivo', c),
  confirmarSobrescrever: (a: string[]) => ipcRenderer.invoke('confirmar-sobrescrever', a),
});
