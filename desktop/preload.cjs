'use strict';

const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('midadCyber', Object.freeze({
  chooseProject: () => ipcRenderer.invoke('cyber:choose-project'),
  getPolicy: () => ipcRenderer.invoke('cyber:get-policy'),
  savePolicy: (policy) => ipcRenderer.invoke('cyber:save-policy', policy),
  scanProject: () => ipcRenderer.invoke('cyber:scan-project'),
  exportReport: () => ipcRenderer.invoke('cyber:export-report'),
  exportSbom: () => ipcRenderer.invoke('cyber:export-sbom'),
  listToolCategories: () => ipcRenderer.invoke('cyber:list-tool-categories'),
  searchTools: (query) => ipcRenderer.invoke('cyber:search-tools', query),
  listLocalModels: () => ipcRenderer.invoke('cyber:list-local-models'),
  askLocalModel: (input) => ipcRenderer.invoke('cyber:ask-local-model', input),
  clearAssistantConversation: () => ipcRenderer.invoke('cyber:clear-assistant-conversation')
}));
