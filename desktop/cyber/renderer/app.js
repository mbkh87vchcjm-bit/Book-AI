'use strict';

(() => {
  const api = window.midadCyber;
  const $ = (id) => document.getElementById(id);
  let selectedProject = null;
  let lastReport = null;
  let currentPolicy = null;

  function toast(message) {
    const element = $('toast');
    element.textContent = message;
    element.classList.remove('hidden');
    window.setTimeout(() => element.classList.add('hidden'), 3800);
  }

  function showPage(page) {
    const dashboard = page === 'dashboard';
    $('dashboard-page').classList.toggle('hidden', !dashboard);
    $('settings-page').classList.toggle('hidden', dashboard);
    $('nav-dashboard').classList.toggle('active', dashboard);
    $('nav-settings').classList.toggle('active', !dashboard);
    $('page-title').textContent = dashboard ? 'لوحة الفحص الأمني' : 'سياسات التحكم';
  }

  function pathsFromTextarea(value) {
    return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  }

  function readPolicyForm() {
    const base = currentPolicy;
    return {
      version: 1,
      enabled: $('mode').value !== 'disabled',
      mode: $('mode').value,
      scope: {
        allowedPaths: pathsFromTextarea($('allowed-paths').value),
        excludedPaths: pathsFromTextarea($('excluded-paths').value)
      },
      limits: {
        maxFiles: Number($('max-files').value),
        maxFileBytes: Number($('max-file-mb').value) * 1024 * 1024,
        maxTotalBytes: Number($('max-total-mb').value) * 1024 * 1024,
        maxFindings: Number($('max-findings').value),
        timeoutMs: Number($('timeout-sec').value) * 1000
      },
      analyzers: [
        ...($('analyzer-builtin').checked ? ['builtin'] : []),
        ...($('analyzer-secrets').checked ? ['secret-patterns'] : [])
      ],
      severityThreshold: $('severity').value,
      capabilities: {
        staticAnalysis: $('analyzer-builtin').checked,
        dependencyInventory: base.capabilities.dependencyInventory,
        secretDetection: $('analyzer-secrets').checked,
        remediationSuggestions: base.capabilities.remediationSuggestions,
        applyRemediations: false,
        networkAccess: false,
        executeProjectCode: false
      },
      privacy: {
        redactSecretValues: true,
        retainSourceSnippets: $('retain-snippets').checked,
        localOnly: true
      }
    };
  }

  function fillPolicyForm(policy) {
    currentPolicy = policy;
    $('mode').value = policy.mode;
    $('allowed-paths').value = policy.scope.allowedPaths.join('\n');
    $('excluded-paths').value = policy.scope.excludedPaths.join('\n');
    $('max-files').value = policy.limits.maxFiles;
    $('max-file-mb').value = Math.max(1, Math.round(policy.limits.maxFileBytes / 1048576));
    $('max-total-mb').value = Math.max(1, Math.round(policy.limits.maxTotalBytes / 1048576));
    $('max-findings').value = policy.limits.maxFindings;
    $('timeout-sec').value = Math.max(5, Math.round(policy.limits.timeoutMs / 1000));
    $('severity').value = policy.severityThreshold;
    $('analyzer-builtin').checked = policy.analyzers.includes('builtin');
    $('analyzer-secrets').checked = policy.analyzers.includes('secret-patterns');
    $('retain-snippets').checked = policy.privacy.retainSourceSnippets;
  }

  async function loadPolicy() {
    const result = await api.getPolicy();
    if (!result.ok) throw new Error('تعذر تحميل السياسات.');
    fillPolicyForm(result.policy);
  }

  async function savePolicy(event) {
    event.preventDefault();
    const status = $('save-status');
    status.textContent = 'جارٍ حفظ السياسات…';
    const candidate = readPolicyForm();
    const result = await api.savePolicy(candidate);
    if (!result.ok) {
      status.textContent = '';
      toast('لم تُحفظ الإعدادات. تحقق من المسارات والحدود.');
      return;
    }
    fillPolicyForm(result.policy);
    status.textContent = 'تم حفظ سياسات الفحص محلياً.';
    toast('تم حفظ إعدادات Midad Cyber.');
    showPage('dashboard');
    updateScanButton();
  }

  function updateScanButton() {
    const allowedMode = currentPolicy && ['read-only', 'review'].includes(currentPolicy.mode);
    $('run-scan').disabled = !selectedProject || !allowedMode;
    $('project-state').textContent = !selectedProject
      ? 'الفحص غير جاهز'
      : allowedMode ? 'المجلد جاهز للتحليل المحلي' : 'الفحص متوقف حسب وضع التشغيل';
  }

  async function chooseProject() {
    const result = await api.chooseProject();
    if (result.canceled) return;
    if (!result.ok) {
      toast('تعذر اختيار المجلد.');
      return;
    }
    selectedProject = result;
    $('project-path').classList.add('selected');
    $('project-path').replaceChildren();
    const icon = document.createElement('span');
    icon.className = 'empty-icon';
    icon.textContent = '⌘';
    const pathText = document.createElement('span');
    pathText.textContent = result.path;
    $('project-path').append(icon, pathText);
    updateScanButton();
    toast('تم تحديد مشروع ' + result.project);
  }

  function renderReport(report) {
    lastReport = report;
    $('export-report').disabled = false;
    $('metric-files').textContent = report.scannedFiles.toLocaleString('ar');
    $('metric-findings').textContent = report.findings.length.toLocaleString('ar');
    $('metric-high').textContent = (report.severitySummary.high + report.severitySummary.critical).toLocaleString('ar');
    $('metric-time').textContent = (report.durationMs / 1000).toFixed(2) + ' ث';

    const resultList = $('results');
    resultList.replaceChildren();
    $('result-caption').textContent = 'فُحص ' + report.scannedFiles + ' ملفاً؛ تم تجاوز أو استثناء ' + report.skippedFiles + ' ملفاً.';
    if (!report.findings.length) {
      const empty = document.createElement('div');
      empty.className = 'results-empty';
      const title = document.createElement('strong');
      title.textContent = 'لم تظهر مؤشرات وفق قواعد الفحص الحالية';
      const note = document.createElement('span');
      note.textContent = 'هذا لا يثبت خلو المشروع من الثغرات؛ المحلل محدود النطاق.';
      empty.append(title, note);
      resultList.appendChild(empty);
      return;
    }

    report.findings.forEach((finding) => {
      const card = document.createElement('article');
      card.className = 'finding';
      const head = document.createElement('div');
      head.className = 'finding-head';
      const title = document.createElement('div');
      title.className = 'finding-title';
      title.textContent = finding.title;
      const severity = document.createElement('span');
      severity.className = 'severity ' + finding.severity;
      severity.textContent = ({critical:'حرج',high:'مرتفع',medium:'متوسط',low:'منخفض',info:'معلوماتي'})[finding.severity] || finding.severity;
      head.append(title, severity);

      const meta = document.createElement('div');
      meta.className = 'finding-meta';
      meta.textContent = finding.file + ':' + finding.line + ' · ' + finding.id;
      const description = document.createElement('p');
      description.textContent = finding.description;
      const recommendation = document.createElement('p');
      recommendation.className = 'recommendation';
      recommendation.textContent = 'المقترح: ' + finding.recommendation;
      card.append(head, meta, description, recommendation);

      if (finding.evidence && !finding.evidenceHidden) {
        const evidence = document.createElement('p');
        evidence.textContent = 'المقتطف المنقح: ' + finding.evidence;
        card.appendChild(evidence);
      }
      const reference = document.createElement('p');
      reference.textContent = 'مرجع: ' + finding.reference + ' · ثقة الكشف: ' + finding.confidence;
      card.appendChild(reference);
      resultList.appendChild(card);
    });
    if (report.stoppedReason) toast('توقف الفحص عند الحد المحدد: ' + report.stoppedReason);
  }

  async function runScan() {
    $('run-scan').disabled = true;
    $('project-state').textContent = 'جارٍ فحص الملفات محلياً…';
    $('results').replaceChildren();
    const loading = document.createElement('div');
    loading.className = 'results-empty';
    loading.textContent = 'يتم تحليل الملفات النصية ضمن النطاق المسموح…';
    $('results').appendChild(loading);
    try {
      const report = await api.scanProject();
      if (!report.ok) {
        toast('تعذر بدء الفحص: ' + report.error);
        $('results').textContent = 'لم يتم تنفيذ الفحص.';
        return;
      }
      renderReport(report);
      $('project-state').textContent = 'اكتمل الفحص المحلي';
    } catch (_) {
      toast('حدث خطأ أثناء الفحص.');
      $('project-state').textContent = 'فشل الفحص';
    } finally {
      updateScanButton();
    }
  }

  async function exportReport() {
    if (!lastReport) return;
    const result = await api.exportReport(lastReport);
    if (result.ok) toast('تم حفظ التقرير في المكان الذي اخترته.');
    else if (!result.canceled) toast('تعذر حفظ التقرير.');
  }

  async function initialize() {
    await loadPolicy();
    $('choose-project').addEventListener('click', chooseProject);
    $('run-scan').addEventListener('click', runScan);
    $('export-report').addEventListener('click', exportReport);
    $('policy-form').addEventListener('submit', savePolicy);
    $('nav-dashboard').addEventListener('click', () => showPage('dashboard'));
    $('nav-settings').addEventListener('click', () => showPage('settings'));
    $('open-settings').addEventListener('click', () => showPage('settings'));
    $('cancel-settings').addEventListener('click', () => showPage('dashboard'));
    updateScanButton();
  }

  initialize().catch(() => toast('تعذر تهيئة Midad Cyber.'));
})();
