import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('mockupApi', {
  carregarPacote: () => ipcRenderer.invoke('carregar-pacote'),
  escolherPdf: () => ipcRenderer.invoke('escolher-pdf'),
  escolherPasta: () => ipcRenderer.invoke('escolher-pasta'),
});
