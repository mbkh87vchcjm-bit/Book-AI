'use strict';

const {app, BrowserWindow, dialog, ipcMain, session} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const Policy = require('./cyber/core/cyber-policy.js');
const Scanner = require('./cyber/core/project-scanner.cjs');
const Sbom = require('./cyber/core/sbom-export.cjs');
const ToolRegistry = require('./cyber/core/tool-registry.cjs');
const AssistantContext = require('./cyber/core/assistant-context.cjs');
const LocalAI = require('./cyber/core/local-ai.cjs');
const localAiClient = LocalAI.createLocalAiClient();

let mainWindow = null;
let selectedProjectRoot = null;
let lastScanReport = null;
let scanRevision = 0;
let lastAssistantRequestAt = 0;

function isTrustedRenderer(event) {
  return Boolean(mainWindow && event && event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame &&
    typeof event.senderFrame.url === 'string' && event.senderFrame.url.startsWith('file://'));
}

function buildAssistantContext(question) {
  return AssistantContext.buildAssistantContext(question);
}

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


ipcMain.handle('cyber:list-tool-categories', async (event) => {
  if (!isTrustedRenderer(event)) return {ok: false, error: 'untrusted-renderer'};
  return {
    ok: true,
    totalTools: ToolRegistry.TOOLS.length,
    reviewedTools: ToolRegistry.TOOLS.filter((item) => item.knowledgeStatus === 'reviewed-summary').length,
    categories: ToolRegistry.listCategories()
  };
});

ipcMain.handle('cyber:search-tools', async (event, input) => {
  if (!isTrustedRenderer(event)) return {ok: false, error: 'untrusted-renderer'};
  const query = String(input && input.query || '').trim().slice(0, 200);
  const category = String(input && input.category || 'all');
  const validCategory = category === 'all' || ToolRegistry.CATEGORIES.some((item) => item.id === category);
  if (!validCategory) return {ok: false, error: 'invalid-category'};
  const limit = Number.isSafeInteger(input && input.limit) ? Math.max(1, Math.min(input.limit, 40)) : 40;
  return {ok: true, ...ToolRegistry.searchTools(query, category, limit)};
});

ipcMain.handle('cyber:list-local-models', async (event) => {
  if (!isTrustedRenderer(event)) return {ok: false, connected: false, models: [], error: 'untrusted-renderer'};
  return localAiClient.listModels();
});

ipcMain.handle('cyber:ask-local-model', async (event, input) => {
  if (!isTrustedRenderer(event)) return {ok: false, error: 'untrusted-renderer'};
  const now = Date.now();
  if (now - lastAssistantRequestAt < 1200) return {ok: false, error: 'request-rate-limited'};
  lastAssistantRequestAt = now;
  const question = String(input && input.question || '').trim();
  const model = String(input && input.model || '').trim();
  if (!question || question.length > 4000) return {ok: false, error: 'question-invalid'};
  const contextObject = buildAssistantContext(question);
  const result = await localAiClient.ask({model, question, context: JSON.stringify(contextObject)});
  if (result.ok) {
    result.evidence = {
      retrieval: contextObject.retrieval,
      tools: contextObject.toolCatalogue.records.map((tool) => ({
        name: tool.name, knowledgeStatus: tool.knowledgeStatus,
        documentation: tool.documentation
      })),
      concepts: contextObject.securityConcepts.map((concept) => ({
        term: concept.term, references: concept.references
      }))
    };
  }
  return result;
});

ipcMain.handle('cyber:choose-project', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'اختر مجلد المشروع المراد فحصه',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) return {canceled: true};
  try {
    const candidateRoot = await fs.realpath(result.filePaths[0]);
    const stat = await fs.stat(candidateRoot);
    if (!stat.isDirectory()) return {ok: false, error: 'not-a-directory'};
    selectedProjectRoot = candidateRoot;
    scanRevision += 1;
    lastScanReport = null;
    return {ok: true, project: path.basename(candidateRoot), path: candidateRoot};
  } catch (_) {
    return {ok: false, error: 'project-unavailable'};
  }
});

ipcMain.handle('cyber:get-policy', async () => ({ok: true, policy: await loadPolicy()}));

ipcMain.handle('cyber:save-policy', async (_event, input) => {
  try {
    const result = await savePolicy(input);
    if (result.ok) {
      scanRevision += 1;
      lastScanReport = null;
    }
    return result;
  } catch (_) {
    return {ok: false, error: 'policy-save-failed'};
  }
});

ipcMain.handle('cyber:scan-project', async () => {
  if (!selectedProjectRoot) return {ok: false, error: 'choose-project-first'};
  const scanRoot = selectedProjectRoot;
  const generation = ++scanRevision;
  lastScanReport = null;
  const policy = await loadPolicy();
  if (generation !== scanRevision || selectedProjectRoot !== scanRoot) {
    return {ok: false, error: 'scan-context-changed'};
  }
  const report = await Scanner.scanProject({root: scanRoot, policy});
  if (generation !== scanRevision || selectedProjectRoot !== scanRoot) {
    return {ok: false, error: 'scan-context-changed'};
  }
  if (report && report.ok === true) lastScanReport = report;
  return report;
});

ipcMain.handle('cyber:export-report', async () => {
  const report = lastScanReport;
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
    astAnalysis: report.astAnalysis ? {
      available: report.astAnalysis.available === true,
      scannedFiles: Math.max(0, Number(report.astAnalysis.scannedFiles) || 0),
      parseFailures: Math.max(0, Number(report.astAnalysis.parseFailures) || 0)
    } : {available: false, scannedFiles: 0, parseFailures: 0},
    dependencyInventory: report.dependencyInventory ? {
      enabled: report.dependencyInventory.enabled === true,
      manifestsScanned: Math.max(0, Number(report.dependencyInventory.manifestsScanned) || 0),
      managers: Array.isArray(report.dependencyInventory.managers) ? report.dependencyInventory.managers.slice(0, 20).map((value) => String(value).slice(0, 40)) : [],
      packageCount: Math.max(0, Number(report.dependencyInventory.packageCount) || 0),
      truncated: report.dependencyInventory.truncated === true,
      packages: Array.isArray(report.dependencyInventory.packages) ? report.dependencyInventory.packages.slice(0, 10000).map((pkg) => ({
        name: String(pkg.name || '').slice(0, 160),
        version: String(pkg.version || '').slice(0, 120),
        relationship: String(pkg.relationship || '').slice(0, 40),
        manifest: String(pkg.manifest || '').slice(0, 160)
      })) : []
    } : {enabled: false, manifestsScanned: 0, managers: [], packageCount: 0, truncated: false, packages: []},
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


ipcMain.handle('cyber:export-sbom', async () => {
  try {
    const report = lastScanReport;
    const inventory = report && report.dependencyInventory;
    if (!report || report.ok !== true || !inventory || inventory.enabled !== true ||
        !Array.isArray(inventory.packages) || inventory.packages.length === 0) {
      return {ok: false, error: 'dependency-inventory-required'};
    }
    const bom = Sbom.createCycloneDxSbom(report, {
      projectName: selectedProjectRoot ? path.basename(selectedProjectRoot) : report.project
    });
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'تصدير قائمة مكونات البرمجيات',
      defaultPath: 'midad-sbom.cdx.json',
      filters: [{name: 'CycloneDX JSON SBOM', extensions: ['json']}]
    });
    if (result.canceled || !result.filePath) return {canceled: true};
    await fs.writeFile(result.filePath, JSON.stringify(bom, null, 2), {encoding: 'utf8', flag: 'wx'});
    return {ok: true, componentCount: bom.components.length, specVersion: bom.specVersion};
  } catch (_) {
    return {ok: false, error: 'sbom-export-failed'};
  }
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  // Deny Chromium network requests. Main-process model access is fixed to local loopback only.
  session.defaultSession.webRequest.onBeforeRequest(
    {urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*']},
    (_details, callback) => callback({cancel: true})
  );
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
