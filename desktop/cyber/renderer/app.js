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
    const pages = ['dashboard', 'glossary', 'tools', 'assistant', 'settings'];
    const titles = {
      dashboard: 'لوحة الفحص الأمني',
      glossary: 'قاموس المفاهيم',
      tools: 'دليل الأدوات',
      assistant: 'المساعد المحلي',
      settings: 'سياسات التحكم'
    };
    pages.forEach((name) => {
      const element = $(name + '-page');
      if (element) element.classList.toggle('hidden', name !== page);
      const nav = $('nav-' + name);
      if (nav) nav.classList.toggle('active', name === page);
    });
    $('page-title').textContent = titles[page] || titles.dashboard;
    if (page === 'tools') searchTools();
    if (page === 'assistant') loadLocalModels();
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
    lastReport = null;
    $('export-report').disabled = true;
    $('export-sbom').disabled = true;
    renderDependencyInventory(null);
    $('results').replaceChildren();
    $('result-caption').textContent = 'تغيرت السياسات؛ نفّذ فحصاً جديداً للحصول على تقرير مطابق للإعدادات الحالية.';
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


  let localModels = [];

  function addToolText(parent, label, value) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tool-detail';
    const title = document.createElement('strong');
    title.textContent = label;
    const content = document.createElement('p');
    content.textContent = value || 'غير متوفر في السجل الحالي.';
    wrapper.append(title, content);
    parent.appendChild(wrapper);
  }

  function renderToolResults(result) {
    const container = $('tool-results');
    container.replaceChildren();
    $('tool-count').textContent = 'الإجمالي المطابق: ' + result.total + ' · المعروض: ' + result.results.length;
    if (!result.results.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'لم نعثر على أداة مطابقة. جرّب الاسم الإنجليزي أو التصنيف.';
      container.appendChild(empty);
      return;
    }
    result.results.forEach((tool) => {
      const card = document.createElement('article');
      card.className = 'tool-card';
      const header = document.createElement('div');
      header.className = 'tool-card-header';
      const name = document.createElement('h3');
      name.textContent = tool.name;
      const status = document.createElement('span');
      status.className = 'tool-status ' + (tool.knowledgeStatus === 'reviewed-summary' ? 'reviewed' : 'pending');
      status.textContent = tool.knowledgeStatus === 'reviewed-summary' ? 'ملخص مراجع' : 'بحاجة إلى مراجعة';
      header.append(name, status);
      const category = document.createElement('p');
      category.className = 'tool-category';
      category.textContent = tool.categoryName + ' · ' + tool.categoryEnglish;
      const summary = document.createElement('p');
      summary.textContent = tool.summary;
      card.append(header, category, summary);
      if (tool.purpose) addToolText(card, 'الغرض', tool.purpose);
      if (tool.inputs && tool.inputs.length) addToolText(card, 'المدخلات', tool.inputs.join('، '));
      if (tool.outputs && tool.outputs.length) addToolText(card, 'المخرجات', tool.outputs.join('، '));
      addToolText(card, 'العمل دون إنترنت', tool.offline);
      addToolText(card, 'الاتصال الشبكي', tool.network);
      addToolText(card, 'المخاطر والضوابط', tool.risk);
      addToolText(card, 'الحدود', tool.limits);
      if (tool.documentation) addToolText(card, 'مرجع التوثيق المسجل (لا يتم فتحه تلقائياً)', tool.documentation);
      const disabled = document.createElement('p');
      disabled.className = 'tool-execution-locked';
      disabled.textContent = 'تنفيذ الأداة من داخل مِداد: معطّل في هذه المرحلة.';
      card.appendChild(disabled);
      container.appendChild(card);
    });
  }

  async function loadToolCategories() {
    try {
      const result = await api.listToolCategories();
      if (!result.ok) throw new Error('tool-catalogue-unavailable');
      const select = $('tools-category');
      select.replaceChildren();
      const all = document.createElement('option');
      all.value = 'all';
      all.textContent = 'كل التصنيفات (' + result.totalTools + ')';
      select.appendChild(all);
      result.categories.forEach((category) => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name + ' (' + category.count + ')';
        select.appendChild(option);
      });
      $('tool-count').textContent = result.totalTools + ' أداة مسجلة · ' + result.reviewedTools + ' ملخصاً أولياً تمت مراجعته';
      await searchTools();
    } catch (_) {
      $('tool-count').textContent = 'تعذر تحميل سجل الأدوات المحلي.';
    }
  }

  async function searchTools() {
    try {
      const result = await api.searchTools({
        query: $('tools-search').value.trim(),
        category: $('tools-category').value || 'all',
        limit: 40
      });
      if (!result.ok) throw new Error('tool-search-failed');
      renderToolResults(result);
    } catch (_) {
      $('tool-results').textContent = 'تعذر البحث في سجل الأدوات.';
    }
  }

  async function loadLocalModels() {
    const status = $('model-status');
    const select = $('local-model');
    try {
      const result = await api.listLocalModels();
      select.replaceChildren();
      localModels = result.ok ? result.models : [];
      if (!localModels.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'لا يوجد نموذج محلي متاح';
        select.appendChild(option);
        status.textContent = 'خدمة Ollama غير متاحة أو لم يتم تثبيت نموذج. لا يوجد انتقال إلى السحابة.';
        return;
      }
      localModels.forEach((model) => {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = model.name;
        select.appendChild(option);
      });
      status.textContent = 'اتصال محلي فقط · عدد النماذج المكتشفة: ' + localModels.length;
    } catch (_) {
      localModels = [];
      status.textContent = 'تعذر الوصول إلى خدمة النموذج المحلية.';
    }
  }

  async function askLocalAssistant() {
    const question = $('assistant-question').value.trim();
    const model = $('local-model').value;
    const answerBox = $('assistant-answer');
    if (!question) {
      toast('اكتب سؤالاً أولاً.');
      return;
    }
    if (!model || !localModels.some((item) => item.name === model)) {
      toast('ثبّت نموذجاً محلياً وتأكد من تشغيل Ollama أولاً.');
      return;
    }
    $('ask-local').disabled = true;
    answerBox.textContent = 'يتم إرسال السؤال إلى النموذج المحلي على هذا الجهاز…';
    try {
      const result = await api.askLocalModel({model, question});
      answerBox.replaceChildren();
      if (!result.ok) {
        const error = document.createElement('p');
        error.className = 'muted';
        error.textContent = result.error === 'local-runtime-unavailable'
          ? 'خدمة النموذج المحلي غير متاحة. لم تتم محاولة الاتصال بخدمة خارجية.'
          : 'تعذر الحصول على إجابة محلية: ' + result.error;
        answerBox.appendChild(error);
        return;
      }
      const heading = document.createElement('strong');
      heading.textContent = 'إجابة النموذج المحلي · ' + result.model;
      const content = document.createElement('p');
      content.className = 'assistant-response-text';
      content.textContent = result.answer;
      const notice = document.createElement('p');
      notice.className = 'muted';
      notice.textContent = 'الإجابة مولدة محلياً وتحتاج إلى مراجعة الباحث والتحقق من المراجع. مِداد لم ينفذ أدوات أو أوامر.';
      answerBox.append(heading, content, notice);
    } catch (_) {
      answerBox.textContent = 'حدث خطأ أثناء الاتصال بخدمة النموذج المحلية.';
    } finally {
      $('ask-local').disabled = false;
    }
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
    $('nav-tools').addEventListener('click', () => showPage('tools'));
    $('nav-assistant').addEventListener('click', () => showPage('assistant'));
    $('search-tools').addEventListener('click', searchTools);
    $('tools-search').addEventListener('keydown', (event) => { if (event.key === 'Enter') searchTools(); });
    $('tools-category').addEventListener('change', searchTools);
    $('refresh-models').addEventListener('click', loadLocalModels);
    $('ask-local').addEventListener('click', askLocalAssistant);
    $('compare-concepts').addEventListener('click', compareConcepts);
    $('nav-settings').addEventListener('click', () => showPage('settings'));
    $('open-settings').addEventListener('click', () => showPage('settings'));
    $('cancel-settings').addEventListener('click', () => showPage('dashboard'));
    updateScanButton();
    await loadToolCategories();
    await loadLocalModels();
  }

  initialize().catch(() => toast('تعذر تهيئة Midad Cyber.'));
})();
