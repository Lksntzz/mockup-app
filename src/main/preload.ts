import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('mockupApi', {
  carregarPacote: (nome?: string) => ipcRenderer.invoke('carregar-pacote', nome),
  escolherPdf: () => ipcRenderer.invoke('escolher-pdf'),
  lerPdf: (caminho: string) => ipcRenderer.invoke('ler-pdf', caminho),
  caminhoDoArquivo: (arquivo: File) => webUtils.getPathForFile(arquivo),
  prepararMkp: (caminhoDoPdf: string) => ipcRenderer.invoke('preparar-mkp', caminhoDoPdf),
  versao: () => ipcRenderer.invoke('versao'),
  operador: () => ipcRenderer.invoke('operador'),
  listarHistorico: () => ipcRenderer.invoke('historico-listar'),
  salvarNoHistorico: (e: unknown) => ipcRenderer.invoke('historico-salvar', e),
  removerDoHistorico: (id: string) => ipcRenderer.invoke('historico-remover', id),
  listarRascunhos: () => ipcRenderer.invoke('rascunhos-listar'),
  salvarRascunho: (r: unknown) => ipcRenderer.invoke('rascunhos-salvar', r),
  removerRascunho: (caminho: string) => ipcRenderer.invoke('rascunhos-remover', caminho),
  estadoAtualizacao: () => ipcRenderer.invoke('estado-atualizacao'),
  verificarAtualizacao: () => ipcRenderer.invoke('verificar-atualizacao'),
  instalarAtualizacao: () => ipcRenderer.invoke('instalar-atualizacao'),
  aoMudarAtualizacao: (cb: (estado: unknown) => void) => {
    ipcRenderer.on('atualizacao', (_e, estado) => cb(estado));
  },
  existe: (c: string) => ipcRenderer.invoke('existe', c),
  gravarArquivo: (c: string, b: Uint8Array) => ipcRenderer.invoke('gravar-arquivo', c, b),
  renomearArquivo: (de: string, para: string) => ipcRenderer.invoke('renomear-arquivo', de, para),
  removerArquivo: (c: string) => ipcRenderer.invoke('remover-arquivo', c),
  confirmarSobrescrever: (a: string[]) => ipcRenderer.invoke('confirmar-sobrescrever', a),
});
