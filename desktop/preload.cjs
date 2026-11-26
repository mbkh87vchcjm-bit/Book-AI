'use strict';

const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('midadCyber', Object.freeze({
  chooseProject: () => ipcRenderer.invoke('cyber:choose-project'),
  getPolicy: () => ipcRenderer.invoke('cyber:get-policy'),
  savePolicy: (policy) => ipcRenderer.invoke('cyber:save-policy', policy),
  scanProject: () => ipcRenderer.invoke('cyber:scan-project'),
  exportReport: (report) => ipcRenderer.invoke('cyber:export-report', report),
  exportSbom: (report) => ipcRenderer.invoke('cyber:export-sbom', report)
}));
