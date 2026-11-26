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
    const glossary = page === 'glossary';
    $('dashboard-page').classList.toggle('hidden', !dashboard);
    $('glossary-page').classList.toggle('hidden', !glossary);
    $('settings-page').classList.toggle('hidden', dashboard || glossary);
    $('nav-dashboard').classList.toggle('active', dashboard);
    $('nav-glossary').classList.toggle('active', glossary);
    $('nav-settings').classList.toggle('active', !dashboard && !glossary);
    $('page-title').textContent = dashboard ? 'لوحة الفحص الأمني' : glossary ? 'قاموس المفاهيم' : 'سياسات التحكم';
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
        ...($('analyzer-ast').checked ? ['ast'] : []),
        ...($('analyzer-secrets').checked ? ['secret-patterns'] : []),
        ...($('analyzer-dependencies').checked ? ['dependency-audit'] : [])
      ],
      severityThreshold: $('severity').value,
      capabilities: {
        staticAnalysis: $('analyzer-builtin').checked || $('analyzer-ast').checked,
        dependencyInventory: $('analyzer-dependencies').checked,
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
    $('analyzer-ast').checked = policy.analyzers.includes('ast');
    $('analyzer-secrets').checked = policy.analyzers.includes('secret-patterns');
    $('analyzer-dependencies').checked = policy.analyzers.includes('dependency-audit');
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
    lastReport = null;
    $('export-report').disabled = true;
    $('export-sbom').disabled = true;
    renderDependencyInventory(null);
    $('results').replaceChildren();
    $('result-caption').textContent = 'تم تغيير المشروع؛ ابدأ فحصاً جديداً لعرض النتائج.';
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

  function renderDependencyInventory(inventory) {
    const container = $('dependency-inventory');
    container.replaceChildren();
    if (!inventory || !inventory.enabled) {
      container.classList.add('hidden');
      return;
    }
    container.classList.remove('hidden');
    const heading = document.createElement('h3');
    heading.textContent = 'جرد الاعتماديات المحلي';
    const summary = document.createElement('p');
    summary.textContent = 'تم التعرف على ' + inventory.packageCount.toLocaleString('ar') +
      ' مدخلاً في ' + inventory.manifestsScanned.toLocaleString('ar') +
      ' ملف اعتماديات. الأنظمة: ' + (inventory.managers.join('، ') || 'لم يُحدد نظام حزم') + '.';
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = 'هذا جرد للأسماء والإصدارات أو القيود فقط، وليس فحصاً لوجود ثغرات. لم يتم الاتصال بمستودعات الحزم.';
    container.append(heading, summary, note);
    if (!inventory.packages.length) {
      const empty = document.createElement('p');
      empty.textContent = 'لم تُستخرج حزم من ملفات الاعتماديات المعروفة.';
      container.appendChild(empty);
      return;
    }
    const table = document.createElement('table');
    table.className = 'dependency-table';
    const head = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['الحزمة', 'الإصدار / القيد', 'العلاقة', 'الملف'].forEach((label) => {
      const cell = document.createElement('th');
      cell.textContent = label;
      headerRow.appendChild(cell);
    });
    head.appendChild(headerRow);
    const body = document.createElement('tbody');
    inventory.packages.slice(0, 300).forEach((pkg) => {
      const row = document.createElement('tr');
      [pkg.name, pkg.version, pkg.relationship, pkg.manifest].forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = String(value || '');
        row.appendChild(cell);
      });
      body.appendChild(row);
    });
    table.append(head, body);
    container.appendChild(table);
    if (inventory.truncated || inventory.packages.length > 300) {
      const limitNote = document.createElement('p');
      limitNote.className = 'muted';
      limitNote.textContent = 'عُرض أول 300 مدخل فقط لحماية أداء الواجهة؛ التقرير الكامل يحتوي على بقية الجرد ضمن الحدود.';
      container.appendChild(limitNote);
    }
  }

  function renderReport(report) {
    lastReport = report;
    $('export-report').disabled = false;
    $('export-sbom').disabled = !(report.dependencyInventory && report.dependencyInventory.enabled && report.dependencyInventory.packages && report.dependencyInventory.packages.length);
    $('metric-files').textContent = report.scannedFiles.toLocaleString('ar');
    $('metric-findings').textContent = report.findings.length.toLocaleString('ar');
    $('metric-high').textContent = (report.severitySummary.high + report.severitySummary.critical).toLocaleString('ar');
    $('metric-time').textContent = (report.durationMs / 1000).toFixed(2) + ' ث';
    renderDependencyInventory(report.dependencyInventory);

    const resultList = $('results');
    resultList.replaceChildren();
    const astInfo = report.astAnalysis;
    const astCaption = astInfo && astInfo.available
      ? ' · AST: ' + astInfo.scannedFiles.toLocaleString('ar') + ' ملف، ' + astInfo.parseFailures.toLocaleString('ar') + ' تعذر تحليله'
      : ' · التحليل البنيوي غير متاح في هذه البيئة';
    $('result-caption').textContent = 'فُحص ' + report.scannedFiles.toLocaleString('ar') +
      ' ملفاً؛ تم تجاوز أو استثناء ' + report.skippedFiles.toLocaleString('ar') + ' ملفاً.' + astCaption;
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
    lastReport = null;
    $('export-report').disabled = true;
    $('export-sbom').disabled = true;
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
    try {
      const result = await api.exportReport();
      if (result.ok) toast('تم حفظ التقرير في المكان الذي اخترته.');
      else if (!result.canceled) toast('تعذر حفظ التقرير.');
    } catch (_) {
      toast('تعذر حفظ التقرير.');
    }
  }

  async function exportSbom() {
    const inventory = lastReport && lastReport.dependencyInventory;
    if (!inventory || !inventory.enabled || !inventory.packages || inventory.packages.length === 0) {
      toast('فعّل جرد الاعتماديات ونفّذ الفحص أولاً.');
      return;
    }
    try {
      const result = await api.exportSbom();
      if (result.ok) toast('تم تصدير CycloneDX 1.7 بعدد ' + result.componentCount + ' مكوّناً.');
      else if (!result.canceled) toast('تعذر تصدير SBOM.');
    } catch (_) {
      toast('تعذر تصدير SBOM.');
    }
  }


  function addConceptField(parent, label, value) {
    const row = document.createElement('div');
    row.className = 'concept-field';
    const heading = document.createElement('strong');
    heading.textContent = label;
    const text = document.createElement('p');
    text.textContent = value || 'غير متوفر في سجل المفاهيم الحالي.';
    row.append(heading, text);
    parent.appendChild(row);
  }

  function renderConceptLookup(result) {
    const container = $('concept-result');
    container.replaceChildren();
    if (result.status === 'ambiguous') {
      const heading = document.createElement('strong');
      heading.textContent = 'المصطلح يحتمل أكثر من معنى';
      const note = document.createElement('p');
      note.textContent = 'أضف سياق الاستخدام لتحديد المقصود بدقة.';
      container.append(heading, note);
      result.matches.forEach((concept) => {
        const option = document.createElement('div');
        option.className = 'concept-option';
        const name = document.createElement('strong');
        name.textContent = concept.term + ' — ' + concept.ar;
        const domain = document.createElement('span');
        domain.textContent = concept.domain;
        const definition = document.createElement('p');
        definition.textContent = concept.definition;
        option.append(name, domain, definition);
        container.appendChild(option);
      });
      return;
    }
    if (result.status !== 'resolved') {
      container.textContent = 'لم يُعثر على مفهوم مطابق في القاموس الحالي. يمكن إضافته لاحقاً بعد التحقق من مصدر موثوق.';
      return;
    }
    const concept = result.concept;
    const heading = document.createElement('h3');
    heading.textContent = concept.term + ' — ' + concept.ar;
    container.appendChild(heading);
    addConceptField(container, 'المجال', concept.domain);
    addConceptField(container, 'التعريف', concept.definition);
    addConceptField(container, 'التمييز المهم', concept.distinction);
    addConceptField(container, 'مثال', concept.example);
    const sourceItems = window.MidadCyberKnowledge.getReferences(concept);
    addConceptField(container, 'المراجع والإصدارات', sourceItems.length
      ? sourceItems.map((item) => item.title + ' — ' + item.version + '\n' + item.url).join('\n\n')
      : 'لم يُسجل مرجع مباشر لهذا المفهوم في القاموس الحالي.');
    const refs = document.createElement('p');
    refs.className = 'muted';
    refs.textContent = 'معرف المفهوم: ' + concept.id + ' · سجل تعليمي أولي يحتاج توثيقاً موسعاً بالمراجع.';
    container.appendChild(refs);
  }

  function resolveConcept() {
    const term = $('concept-term').value.trim();
    const context = $('concept-context').value.trim();
    if (!term) {
      toast('أدخل المصطلح الذي تريد فهمه.');
      return;
    }
    renderConceptLookup(window.MidadCyberKnowledge.resolveTerm(term, context));
  }

  function compareConcepts() {
    const first = $('compare-first').value.trim();
    const second = $('compare-second').value.trim();
    const container = $('comparison-result');
    container.replaceChildren();
    if (!first || !second) {
      toast('أدخل المفهومين أولاً.');
      return;
    }
    const result = window.MidadCyberKnowledge.compareTerms(first, second);
    if (result.status !== 'compared') {
      container.textContent = 'تعذر تحديد أحد المفهومين. استخدم اسماً أدق أو افتحه أولاً في أداة تحديد المعنى.';
      return;
    }
    const heading = document.createElement('h3');
    heading.textContent = result.first.term + ' مقابل ' + result.second.term;
    container.appendChild(heading);
    const table = document.createElement('div');
    table.className = 'comparison-grid';
    [
      ['التعريف', result.comparison.definition],
      ['الفرق الأساسي', result.comparison.distinction],
      ['مثال', result.comparison.examples]
    ].forEach(([label, values]) => {
      const rowLabel = document.createElement('strong');
      rowLabel.className = 'comparison-label';
      rowLabel.textContent = label;
      const left = document.createElement('p');
      left.textContent = values[0];
      const right = document.createElement('p');
      right.textContent = values[1];
      table.append(rowLabel, left, right);
    });
    container.appendChild(table);
    const relation = document.createElement('p');
    relation.className = 'muted';
    relation.textContent = result.relation === 'explicit-contrast'
      ? 'القاموس يصنف المفهومين كحالتين متقابلتين.'
      : 'لم تُسجل علاقة تقابل صريحة بين المفهومين.';
    container.appendChild(relation);
  }

  async function initialize() {
    await loadPolicy();
    $('choose-project').addEventListener('click', chooseProject);
    $('run-scan').addEventListener('click', runScan);
    $('export-report').addEventListener('click', exportReport);
    $('export-sbom').addEventListener('click', exportSbom);
    $('policy-form').addEventListener('submit', savePolicy);
    $('nav-dashboard').addEventListener('click', () => showPage('dashboard'));
    $('nav-glossary').addEventListener('click', () => showPage('glossary'));
    $('resolve-concept').addEventListener('click', resolveConcept);
    $('compare-concepts').addEventListener('click', compareConcepts);
    $('nav-settings').addEventListener('click', () => showPage('settings'));
    $('open-settings').addEventListener('click', () => showPage('settings'));
    $('cancel-settings').addEventListener('click', () => showPage('dashboard'));
    updateScanButton();
  }

  initialize().catch(() => toast('تعذر تهيئة Midad Cyber.'));
})();
