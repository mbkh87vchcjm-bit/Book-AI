'use strict';

const {app, BrowserWindow, dialog, ipcMain, session} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const Policy = require('./cyber/core/cyber-policy.js');
const Scanner = require('./cyber/core/project-scanner.cjs');

let mainWindow = null;
let selectedProjectRoot = null;

function policyFilePath() {
  return path.join(app.getPath('userData'), 'cyber-policy.json');
}

async function loadPolicy() {
  try {
    const raw = await fs.readFile(policyFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    const policy = Policy.createPolicy(parsed);
    if (Policy.validatePolicy(policy).valid) return policy;
  } catch (_) {
    // Missing or damaged preferences safely fall back to defaults.
  }
  return Policy.createPolicy();
}

async function savePolicy(input) {
  const policy = Policy.createPolicy(input);
  const validation = Policy.validatePolicy(policy);
  if (!validation.valid) return {ok: false, errors: validation.errors};

  const target = policyFilePath();
  const temporary = target + '.tmp';
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(temporary, JSON.stringify(policy, null, 2), {encoding: 'utf8', mode: 0o600});
  await fs.rename(temporary, target);
  return {ok: true, policy};
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: '#101824',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.loadFile(path.join(__dirname, 'cyber', 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

ipcMain.handle('cyber:choose-project', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'اختر مجلد المشروع المراد فحصه',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) return {canceled: true};
  try {
    selectedProjectRoot = await fs.realpath(result.filePaths[0]);
    const stat = await fs.stat(selectedProjectRoot);
    if (!stat.isDirectory()) return {ok: false, error: 'not-a-directory'};
    return {ok: true, project: path.basename(selectedProjectRoot), path: selectedProjectRoot};
  } catch (_) {
    selectedProjectRoot = null;
    return {ok: false, error: 'project-unavailable'};
  }
});

ipcMain.handle('cyber:get-policy', async () => ({ok: true, policy: await loadPolicy()}));

ipcMain.handle('cyber:save-policy', async (_event, input) => {
  try {
    return await savePolicy(input);
  } catch (_) {
    return {ok: false, error: 'policy-save-failed'};
  }
});

ipcMain.handle('cyber:scan-project', async () => {
  if (!selectedProjectRoot) return {ok: false, error: 'choose-project-first'};
  const policy = await loadPolicy();
  return Scanner.scanProject({root: selectedProjectRoot, policy});
});

ipcMain.handle('cyber:export-report', async (_event, report) => {
  if (!report || report.ok !== true || !Array.isArray(report.findings)) {
    return {ok: false, error: 'invalid-report'};
  }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'حفظ تقرير فحص مِداد',
    defaultPath: 'midad-cyber-report.json',
    filters: [{name: 'JSON Report', extensions: ['json']}]
  });
  if (result.canceled || !result.filePath) return {canceled: true};

  const safeReport = {
    reportVersion: report.reportVersion,
    project: String(report.project || '').slice(0, 120),
    generatedAt: report.generatedAt,
    durationMs: Number(report.durationMs) || 0,
    scannedFiles: Number(report.scannedFiles) || 0,
    skippedFiles: Number(report.skippedFiles) || 0,
    totalBytes: Number(report.totalBytes) || 0,
    stoppedReason: report.stoppedReason || null,
    severitySummary: report.severitySummary || {},
    findings: report.findings.map((item) => ({
      id: String(item.id || ''),
      analyzer: String(item.analyzer || ''),
      severity: String(item.severity || ''),
      confidence: String(item.confidence || ''),
      title: String(item.title || ''),
      description: String(item.description || ''),
      recommendation: String(item.recommendation || ''),
      file: String(item.file || ''),
      line: Number(item.line) || 0,
      evidence: item.evidenceHidden ? null : String(item.evidence || ''),
      evidenceHidden: item.evidenceHidden !== false,
      reference: String(item.reference || '')
    })),
    warnings: Array.isArray(report.warnings) ? report.warnings.slice(0, 100) : [],
    execution: {localOnly: true, projectCodeExecuted: false, networkAccessUsed: false, filesModified: false}
  };
  await fs.writeFile(result.filePath, JSON.stringify(safeReport, null, 2), {encoding: 'utf8', flag: 'wx'});
  return {ok: true};
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
