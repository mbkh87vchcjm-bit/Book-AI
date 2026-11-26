(function () {
  'use strict';
  var E = window.MidadEngine, A = window.MidadAnswer, OCR = window.MidadOcr, Neural = window.MidadNeural, SourceQuality = window.MidadSourceQuality;
  var $ = function (id) { return document.getElementById(id); };
  var Native = window.NativeBridge || null;
  var STORAGE_KEY = 'midad-state-v1';
  var MAX_FILE_BYTES = 60 * 1024 * 1024;
  var MAX_TEXT_CHARS = 3000000;
  var MAX_PAGES = 500;
  var MAX_OCR_PAGES = 80;
  var defaults = {mode: 'flexible', allowMath: true, maxSentences: 36, answerDepthVersion: 3, ocrEnabled: true, maxOcrPages: 40};
  var state;
  var learningStore = null;
  var processing = false, cancelProcessing = false, savingWarning = false, storageBlocked = false, modalKind = null, toastTimer;

  function uid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); }
  function icon(name) { return '<svg aria-hidden="true"><use href="#i-' + name + '"></use></svg>'; }
  function fmt(n) { try { return Number(n).toLocaleString('ar'); } catch (_) { return String(n); } }
  function messageText(text) { return esc(text).replace(/\*\*([^*\n]{1,200})\*\*/g, '<strong>$1</strong>'); }
  function emptyLearningData() {
    return {version: 2, experience: [], corrections: [], termWeights: {}, candidates: []};
  }
  function newSession() {
    return {id: uid(), title: 'دفتر جديد', created: Date.now(), documents: [], messages: [],
      semanticModelData: null, semanticModelStatus: 'pending', learningData: emptyLearningData()};
  }
  function isBusy() { return processing; }
  function activeSession() { return state.sessions.find(function (s) { return s.id === state.activeId; }) || state.sessions[0]; }

  // Pre-section-10 builds stored learning data globally. Migrate answer experiences
  // to the notebook that owns each assistant message; unlinked legacy learning state
  // stays with the notebook that was active when the old build last saved it.
  function migrateLearningData(obj) {
    var legacy = obj.learningData;
    var hasScopedData = obj.sessions.some(function (session) {
      return Object.prototype.hasOwnProperty.call(session, 'learningData');
    });
    if (legacy && typeof legacy === 'object' && !hasScopedData) {
      var ownerByMessage = Object.create(null), experiencesBySession = Object.create(null), orphaned = [];
      obj.sessions.forEach(function (session) {
        experiencesBySession[session.id] = [];
        session.messages.forEach(function (message) {
          if (message && message.role === 'assistant' && message.id) ownerByMessage[String(message.id)] = session.id;
        });
      });
      (Array.isArray(legacy.experience) ? legacy.experience : []).forEach(function (experience) {
        var owner = experience && ownerByMessage[String(experience.messageId || '')];
        if (owner) experiencesBySession[owner].push(experience);
        else orphaned.push(experience);
      });
      obj.sessions.forEach(function (session) {
        var isActive = session.id === obj.activeId;
        session.learningData = {
          version: 2,
          experience: (experiencesBySession[session.id] || []).concat(isActive ? orphaned : []),
          corrections: isActive && Array.isArray(legacy.corrections) ? legacy.corrections : [],
          termWeights: isActive && legacy.termWeights && typeof legacy.termWeights === 'object' && !Array.isArray(legacy.termWeights) ? legacy.termWeights : {},
          candidates: isActive && Array.isArray(legacy.candidates) ? legacy.candidates : []
        };
      });
      delete obj.learningData;
      return;
    }
    obj.sessions.forEach(function (session) {
      if (!session.learningData || typeof session.learningData !== 'object' || Array.isArray(session.learningData)) {
        session.learningData = emptyLearningData();
      }
    });
  }

  function persistLearningData() {
    var session = activeSession();
    if (session && learningStore) session.learningData = learningStore.exportData();
  }

  function activateLearningStore() {
    var session = activeSession();
    learningStore = window.MlkeLearning ? new window.MlkeLearning(session ? session.learningData : null) : null;
  }

  function loadState() {
    var raw = '';
    try {
      raw = Native ? Native.getState() : localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var obj = JSON.parse(raw);
        if (!obj || !Array.isArray(obj.sessions) || !obj.sessions.length || obj.sessions.some(function (s) {
          return !s || typeof s.id !== 'string' || !Array.isArray(s.documents) || !Array.isArray(s.messages);
        })) throw new Error('Invalid saved state');
        var savedDepthVersion = obj.settings && obj.settings.answerDepthVersion;
        obj.settings = Object.assign({}, defaults, obj.settings || {});
        // Upgrade older notebooks to the deeper evidence budget and broad-query fixes.
        if (savedDepthVersion !== 3) {
          obj.settings.maxSentences = 36;
          obj.settings.answerDepthVersion = 3;
        }
        obj.sessions.forEach(function (session) {
          if (!session.semanticModelStatus) session.semanticModelStatus = session.semanticModelData ? 'ready' : 'pending';
          if (session.semanticModelData && Neural && !Neural.restore(session.semanticModelData)) {
            session.semanticModelData = null;
            session.semanticModelStatus = 'pending';
          }
        });
        if (!obj.sessions.some(function (s) { return s.id === obj.activeId; })) obj.activeId = obj.sessions[0].id;
        migrateLearningData(obj);
        return obj;
      }
    } catch (_) {
      // Do not overwrite unreadable or partially invalid data with an empty notebook.
      storageBlocked = true;
      toast('تعذّر قراءة البيانات المحفوظة. أوقفنا الحفظ حتى لا تُستبدل.');
    }
    var s = newSession();
    return {version: 1, activeId: s.id, sessions: [s], settings: Object.assign({}, defaults)};
  }
  function saveState() {
    if (storageBlocked) { toast('الحفظ متوقف لحماية بياناتك السابقة غير المقروءة.'); return false; }
    try {
      var json = JSON.stringify(state);
      var ok = Native ? Native.saveState(json) : (localStorage.setItem(STORAGE_KEY, json), true);
      if (!ok) throw new Error('save failed');
      savingWarning = false;
      return true;
    } catch (_) {
      if (!savingWarning) toast('تعذّر حفظ التغييرات. تأكد من وجود مساحة كافية على الجهاز.');
      savingWarning = true;
      return false;
    }
  }

  function toast(text) {
    var node = $('toast');
    if (!node) return;
    node.textContent = text; node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.hidden = true; }, 4200);
  }
  function closeDrawers() { $('rail').classList.remove('open'); $('sources-panel').classList.remove('open'); $('drawer-backdrop').hidden = true; }
  function openDrawer(which) { closeDrawers(); $(which).classList.add('open'); $('drawer-backdrop').hidden = false; }
  function openModal(html, kind) {
    closeDrawers(); modalKind = kind || 'other';
    $('modal-root').innerHTML = html; $('modal-root').hidden = false;
    var close = $('modal-close'); if (close) close.addEventListener('click', closeModal);
    $('modal-root').onclick = function (ev) { if (ev.target === $('modal-root')) closeModal(); };
  }
  function closeModal() { $('modal-root').hidden = true; $('modal-root').innerHTML = ''; modalKind = null; }
  function modalShell(title, subtitle, content, footer) {
    return '<section class="modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><header class="modal-header"><div><h2>' + esc(title) + '</h2>' + (subtitle ? '<p>' + esc(subtitle) + '</p>' : '') + '</div><button class="icon-button" id="modal-close" aria-label="إغلاق">' + icon('close') + '</button></header><div class="modal-content">' + content + '</div>' + (footer ? '<footer class="modal-footer">' + footer + '</footer>' : '') + '</section>';
  }
  function confirmAction(title, text, label, onConfirm, danger) {
    openModal(modalShell(title, '', '<p class="excerpt-note">' + esc(text) + '</p>', '<button class="button-secondary" id="confirm-no">إلغاء</button><button class="' + (danger ? 'button-danger' : 'button-primary') + '" id="confirm-yes">' + esc(label) + '</button>'), 'confirm');
    $('confirm-no').onclick = closeModal; $('confirm-yes').onclick = function () { closeModal(); onConfirm(); };
  }
  function renderSessions() {
    $('session-count').textContent = fmt(state.sessions.length);
    $('session-list').innerHTML = state.sessions.map(function (s) {
      return '<button class="session-button ' + (s.id === state.activeId ? 'active' : '') + '" data-session="' + esc(s.id) + '"' + (isBusy() ? ' disabled' : '') + '>' + icon('chat') + '<span>' + esc(s.title || 'دفتر جديد') + '</span></button>';
    }).join('');
    $('session-list').querySelectorAll('[data-session]').forEach(function (el) {
      el.onclick = function () { if (isBusy()) return; persistLearningData(); state.activeId = el.dataset.session; activateLearningStore(); saveState(); closeDrawers(); renderAll(); scrollBottom(); };
    });
    $('breadcrumb-title').textContent = activeSession().title;
    $('new-session').disabled = isBusy();
  }
  function renderSources() {
    var session = activeSession(), docs = session.documents;
    $('source-count').textContent = fmt(docs.length);
    $('mobile-source-count').textContent = docs.length ? fmt(docs.length) + (docs.length === 1 ? ' مصدر مضاف' : ' مصادر مضافة') : 'لا توجد مصادر بعد';
    $('source-empty').hidden = docs.length > 0;
    $('welcome-upload').innerHTML = icon('plus') + (docs.length ? ' إضافة مصدر آخر' : ' أضف مصدرك الأول');
    $('source-list').innerHTML = docs.map(function (d) {
      var detail = d.type === 'pdf' ? fmt(d.pages.length) + ' صفحة معالجة من ' + fmt(d.totalPages || d.pages.length) + ((d.extraction && d.extraction.skippedOcrPages) ? ' · OCR متجاوز: ' + fmt(d.extraction.skippedOcrPages) : '') + ((d.extraction && d.extraction.lowConfidenceOcrPages) ? ' · OCR يحتاج مراجعة: ' + fmt(d.extraction.lowConfidenceOcrPages) : '') + ((d.extraction && d.extraction.previewOmittedPages) ? ' · معاينات غير محفوظة: ' + fmt(d.extraction.previewOmittedPages) : '') : (d.type === 'image' ? 'صورة مفردة' + (d.pages[0] && d.pages[0].text ? ' · نص مقروء' : ' · تحتاج إدخال النص') : 'نص مضاف');
      return '<div class="source-item"><div class="source-file-icon ' + (d.type !== 'pdf' ? 'text' : '') + '">' + icon('file') + '</div><button class="source-item-copy" data-source="' + esc(d.id) + '"><strong dir="auto">' + esc(d.name) + '</strong><small>' + detail + '</small></button><button class="source-delete" data-delete="' + esc(d.id) + '" aria-label="حذف المصدر">' + icon('trash') + '</button></div>';
    }).join('');
    $('source-list').querySelectorAll('[data-source]').forEach(function (el) { el.onclick = function () { openDocument(el.dataset.source, 1); }; });
    $('source-list').querySelectorAll('[data-delete]').forEach(function (el) { el.onclick = function () {
      if (isBusy()) { toast('انتظر حتى تنتهي العملية الحالية.'); return; }
      var id = el.dataset.delete, doc = session.documents.find(function (d) { return d.id === id; });
      if (!doc) return;
      confirmAction('حذف المصدر', 'سيُحذف النص المستخرج من هذا الدفتر. ستبقى الاقتباسات المحفوظة في المحادثة.', 'حذف المصدر', function () {
        var oldDocuments = session.documents;
        var oldModelData = session.semanticModelData || null;
        var oldModelStatus = session.semanticModelStatus || 'pending';
        session.documents = session.documents.filter(function (d) { return d.id !== id; });
        session.semanticModelData = null;
        session.semanticModelStatus = 'pending';
        if (!saveState()) {
          session.documents = oldDocuments;
          session.semanticModelData = oldModelData;
          session.semanticModelStatus = oldModelStatus;
          return;
        }
        renderAll(); toast('تم حذف المصدر وإعادة تهيئة التعلم الدلالي.');
      }, true);
    }; });
  }
  function refMarkup(msg) {
    if (!msg.references || !msg.references.length) return '';
    return '<div class="references"><div class="reference-heading">' + icon('book') + 'جمل منتقاة من مراجعك</div><div class="reference-list">' + msg.references.map(function (r, index) {
      var page = r.type === 'pdf' ? 'صفحة ' + fmt(r.page) : (r.type === 'image' ? 'صورة' : 'نص');
      if (r.ocr) page += ' · من صورة، راجعها';
      if (r.edited) page += ' · مصحح يدويًا';
      if (r.ocrStats && Number.isFinite(Number(r.ocrStats.recognitionRate))) page += ' · قبول قاموس OCR ' + fmt(Math.round(Number(r.ocrStats.recognitionRate) * 100)) + '%';
      return '<button class="reference-card" data-message="' + esc(msg.id) + '" data-reference="' + index + '"><span class="reference-number">' + fmt(index + 1) + '</span><span class="reference-info"><strong dir="auto">' + esc(r.docName) + '</strong><small>' + esc(page) + '</small></span></button>';
    }).join('') + '</div><div class="reference-disclaimer">الجمل منتقاة آليًا؛ راجع الصفحة، خصوصًا النص المقروء من الصور.</div></div>';
  }
  function originMarkup(msg) {
    var text, css = msg.origin || '';
    if (msg.origin === 'source' || msg.origin === 'extract') text = 'إجابة مبنية على أدلة المراجع';
    else if (msg.origin === 'calculation') text = 'حساب محلي، ليس من مرجع';
    else if (msg.origin === 'miss') text = 'لم يجد البحث نصًا مناسبًا';
    else if (msg.origin === 'error') text = 'تعذّر إكمال الإجابة';
    else if (msg.origin === 'general') text = 'إجابة سابقة من نموذج';
    else return '';
    return '<div class="origin-label ' + esc(css) + '">' + icon(msg.origin === 'source' || msg.origin === 'extract' ? 'book' : 'spark') + esc(text) + '</div>';
  }
  function renderMessages() {
    var session = activeSession();
    $('welcome').hidden = session.messages.length > 0;
    $('messages').innerHTML = session.messages.map(function (m) {
      var user = m.role === 'user';
      var body = m.text ? messageText(m.text) : '';
      var experience = !user && m.experienceId && learningStore && learningStore.getExperience
        ? learningStore.getExperience(m.experienceId) : null;
      var positiveLabel = experience && experience.userRating === 'positive' ? 'مفيدة ✓' : 'مفيدة';
      var negativeLabel = experience && experience.userRating === 'negative' ? 'غير مفيدة ✓' : 'غير مفيدة';
      var feedbackMarkup = experience
        ? '<button data-feedback="positive" data-message="' + esc(m.id) + '" aria-pressed="' + (experience.userRating === 'positive') + '">' + positiveLabel + '</button>' +
          '<button data-feedback="negative" data-message="' + esc(m.id) + '" aria-pressed="' + (experience.userRating === 'negative') + '">' + negativeLabel + '</button>'
        : '';
      return '<article class="message ' + (user ? 'user' : 'assistant') + '" data-message-id="' + esc(m.id) + '"><div class="' + (user ? 'user-avatar' : 'assistant-avatar') + '">' + (user ? 'أنت' : icon('spark')) + '</div><div class="message-body"><div class="message-meta"><strong>' + (user ? 'أنت' : 'مداد') + '</strong>' + '</div><div class="message-text" dir="auto">' + body + '</div>' + (!user ? originMarkup(m) + refMarkup(m) + '<div class="message-actions"><button data-copy="' + esc(m.id) + '">' + icon('copy') + ' نسخ</button>' + feedbackMarkup + '</div>' : '') + '</div></article>';
    }).join('');
    $('messages').querySelectorAll('[data-reference]').forEach(function (el) { el.onclick = function () { openReference(el.dataset.message, Number(el.dataset.reference)); }; });
    $('messages').querySelectorAll('[data-copy]').forEach(function (el) { el.onclick = function () {
      var msg = session.messages.find(function (m) { return m.id === el.dataset.copy; });
      if (!msg) return;
      if (Native && Native.copyText) { Native.copyText(msg.text); toast('تم نسخ النص.'); }
      else if (navigator.clipboard) navigator.clipboard.writeText(msg.text).then(function () { toast('تم نسخ النص.'); }).catch(function () { toast('تعذّر النسخ.'); });
    }; });
    $('messages').querySelectorAll('[data-feedback]').forEach(function (el) { el.onclick = function () {
      var msg = session.messages.find(function (m) { return m.id === el.dataset.message; });
      var experience = msg && learningStore && learningStore.getExperience
        ? learningStore.getExperience(msg.experienceId) : null;
      if (!msg || !experience || !learningStore.rateExperience || !E.baseWords) {
        toast('تعذر العثور على سجل هذه الإجابة.');
        return;
      }
      var result = learningStore.rateExperience(msg.experienceId, el.dataset.feedback, E.baseWords(experience.question));
      if (!result.changed) {
        toast(result.reason === 'unchanged' ? 'هذا التقييم مسجل بالفعل.' : 'تعذر تسجيل التقييم.');
        return;
      }
      persistLearningData();
      var saved = saveState();
      renderMessages();
      if (saved) toast('حُفظ تقييمك محليًا، وسيؤثر بقدر محدود في ترتيب نتائج البحث اللاحقة.');
    }; });
    $('typing').hidden = !processing;
    if (processing && !cancelProcessing) $('typing-text').textContent = 'أستخرج النص من المصدر';
    $('send-btn').hidden = processing;
    $('stop-btn').hidden = !processing;
    $('question').disabled = processing;
    $('send-btn').disabled = processing;
    $('mode-shortcut').innerHTML = (state.settings.mode === 'strict' ? 'المصادر فقط' : 'المصادر + الحساب') + ' <span>⌄</span>';
  }
  function renderAll() { renderSessions(); renderSources(); renderMessages(); }
  function scrollBottom() { requestAnimationFrame(function () { $('conversation-scroll').scrollTop = $('conversation-scroll').scrollHeight; }); }

  function openDocument(id, pageNumber) {
    var doc = activeSession().documents.find(function (d) { return d.id === id; });
    if (!doc) { toast('هذا المصدر لم يعد موجودًا.'); return; }
    var page = doc.pages.find(function (p) { return p.page === pageNumber; }) || doc.pages[0];
    if (!page) return;
    var content = '<div class="excerpt-badge">' + icon('file') + (doc.type === 'pdf' ? 'الصفحة ' + fmt(page.page) + ' من ' + fmt(doc.totalPages || doc.pages.length) : (doc.type === 'image' ? 'صورة مفردة' : 'النص المستخرج')) + '</div>';
    if (page.ocr) {
      content += '<p class="excerpt-note">النص قُرئ من صورة آليًا وقد يحتوي على أخطاء أو كلمات غير واضحة (□). قارن بالصورة وصححه قبل الاعتماد عليه.</p>';
      if (page.ocrStats && Number.isFinite(Number(page.ocrStats.recognitionRate))) content += '<p class="excerpt-note">قبول قاموس OCR: ' + fmt(Math.round(Number(page.ocrStats.recognitionRate) * 100)) + '%؛ هذه نسبة مطابقة معجمية وليست قياسًا لدقة OCR.</p>';
      if (page.ocrSkipped) content += '<p class="excerpt-note">لم تتم محاولة OCR لهذه الصفحة؛ الصورة محفوظة ويمكنك إدخال النص يدويًا.</p>';
      if (page.ocrFailed) content += '<p class="excerpt-note">فشلت القراءة الآلية؛ الصورة محفوظة ويمكنك إدخال النص يدويًا.</p>';
      if (page.edited) content += '<p class="excerpt-note">تم تصحيح نص هذه الصفحة يدويًا.</p>';
      if (typeof page.preview === 'string' && page.preview.length < 1600000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(page.preview))
        content += '<img class="ocr-preview" src="' + esc(page.preview) + '" alt="صورة الصفحة المصوّرة">';
      else if (page.previewOmitted) content += '<p class="excerpt-note">لم تُحفظ معاينة هذه الصفحة بسبب حد التخزين المحلي. النص المستخرج متاح للمراجعة، لكن المقارنة البصرية تتطلب إعادة استيراد المصدر.</p>';
    }
    content += '<div class="excerpt-text" dir="auto">' + esc(page.text || 'لا يوجد نص قابل للاستخراج في هذه الصفحة.') + '</div><div class="excerpt-note">هذه نسخة نصية محلية وقد يختلف ترتيبها عن الملف الأصلي.</div>';
    content += '<div class="model-actions"><button class="button-secondary" id="edit-page">تصحيح نص الصفحة</button>';
    if (doc.type === 'pdf' && doc.pages.length > 1) content += '<button class="button-secondary" id="prev-page">الصفحة السابقة</button><button class="button-secondary" id="next-page">الصفحة التالية</button>';
    content += '</div>';
    openModal(modalShell(doc.name, 'نص المصدر المحفوظ في هذا الدفتر', content, ''), 'document');
    $('edit-page').onclick = function () { editPage(id, page.page); };
    if ($('prev-page')) { $('prev-page').disabled = page.page <= 1; $('prev-page').onclick = function () { openDocument(id, page.page - 1); }; }
    if ($('next-page')) { $('next-page').disabled = page.page >= doc.pages.length; $('next-page').onclick = function () { openDocument(id, page.page + 1); }; }
  }
  function editPage(id, pageNumber) {
    if (isBusy()) return;
    var doc = activeSession().documents.find(function (d) { return d.id === id; });
    var page = doc && doc.pages.find(function (p) { return p.page === pageNumber; });
    if (!page) return;
    var content = '<p class="excerpt-note">صحّح النص بعد مقارنته بالصفحة الأصلية. ستستخدم الأسئلة اللاحقة النص المصحح؛ لن تتغير الاقتباسات السابقة.</p>';
    if (page.ocr && typeof page.preview === 'string' && page.preview.length < 1600000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(page.preview))
      content += '<img class="ocr-preview" src="' + esc(page.preview) + '" alt="صورة الصفحة المصوّرة للمراجعة">';
    else if (page.previewOmitted) content += '<p class="excerpt-note">لم تُحفظ معاينة هذه الصفحة بسبب حد التخزين المحلي. أعد استيراد المصدر بعد تحرير مساحة المعاينات لمراجعتها بصريًا.</p>';
    content += '<label class="field"><span>النص</span><textarea id="page-edit" style="min-height:220px" dir="auto">' + esc(page.text || '') + '</textarea></label>';
    openModal(modalShell('تصحيح النص', doc.name + ' · الصفحة ' + fmt(page.page), content, '<button class="button-secondary" id="edit-cancel">إلغاء</button><button class="button-primary" id="edit-save">حفظ</button>'), 'edit-page');
    $('edit-cancel').onclick = function () { openDocument(id, pageNumber); };
    $('edit-save').onclick = function () {
      var text = $('page-edit').value.trim();
      if (text.length > MAX_TEXT_CHARS) { toast('النص كبير جدًا.'); return; }
      var old = page.text, wasEdited = page.edited; page.text = text; page.edited = true;
      if (!saveState()) { page.text = old; page.edited = wasEdited; return; }
      openDocument(id, pageNumber); toast('حُفظ التصحيح.');
    };
  }
  function openReference(messageId, index) {
    var msg = activeSession().messages.find(function (m) { return m.id === messageId; });
    var ref = msg && msg.references && msg.references[index];
    if (!ref) return;
    var doc = activeSession().documents.find(function (d) { return d.id === ref.docId; });
    var label = ref.type === 'pdf' ? 'الصفحة ' + fmt(ref.page) : (ref.type === 'image' ? 'الصورة' : 'نص');
    var note = ref.edited ? 'هذا النص صُحح يدويًا.' : (ref.ocr ? 'هذا نص مقروء من صورة وقد يكون غير دقيق. افتح الصفحة وقارنه بالصورة.' : 'جملة منتقاة آليًا من النص المحلي. تحقق من الصفحة الأصلية.');
    if (ref.ocrStats && Number.isFinite(Number(ref.ocrStats.recognitionRate))) note += ' قبول قاموس OCR: ' + fmt(Math.round(Number(ref.ocrStats.recognitionRate) * 100)) + '%؛ ليس قياسًا لدقة OCR.';
    var content = '<div class="excerpt-badge">' + icon('book') + esc(label) + '</div><div class="excerpt-text" dir="auto">' + esc(ref.excerpt) + '</div><p class="excerpt-note">' + esc(note) + '</p>';
    var footer = doc ? '<button id="open-full-page" class="button-secondary">عرض نص الصفحة</button>' : '';
    openModal(modalShell(ref.docName, 'المصدر ' + fmt(index + 1) + ' · ' + label, content, footer), 'reference');
    if ($('open-full-page')) $('open-full-page').onclick = function () { openDocument(ref.docId, ref.page); };
  }
  function openLearningCenter() {
    if (processing) { toast('انتظر حتى تنتهي العملية الحالية.'); return; }
    var exCount = learningStore ? learningStore.experience.length : 0;
    var corrCount = learningStore ? learningStore.corrections.length : 0;
    var candCount = learningStore ? learningStore.candidates.filter(function (c) { return c.status === 'candidate'; }).length : 0;
    var lexCount = state.userLexicon ? state.userLexicon.length : 0;

    var content = '<section class="settings-section"><h3>إحصائيات التعلم والتطور التراكمي</h3>' +
      '<div class="setting-row"><div><strong>سجل الخبرة والتفاعلات</strong><small>الأسئلة والتقييمات المسجلة محليًا</small></div><span>' + fmt(exCount) + '</span></div>' +
      '<div class="setting-row"><div><strong>التصحيحات المعتمدة</strong><small>ترجمات وتصحيحات حفظها المستخدم</small></div><span>' + fmt(corrCount) + '</span></div>' +
      '<div class="setting-row"><div><strong>المصطلحات المكتسبة يدويًا</strong><small>المضافة إلى القاموس التقني المحلي</small></div><span>' + fmt(lexCount) + '</span></div>' +
      '<div class="setting-row"><div><strong>مفاهيم بانتظار الاعتماد</strong><small>مفاهيم مرشحة من المراجع</small></div><span>' + fmt(candCount) + '</span></div>' +
      '</section>' +
      '<section class="settings-section"><h3>التحكم في الذاكرة التكيفية</h3>' +
      '<button class="button-secondary" id="reset-weights-btn" style="width:100%;margin-bottom:8px">إعادة ضبط أوزان البحث المتعلمة</button>' +
      '<p class="field-help">جميع البيانات والتصحيحات محفوظة على ذاكرة هاتفك فقط، دون أي اتصال بالإنترنت.</p></section>';

    openModal(modalShell('مركز التعلم والتطور', 'متابعة المعرفة التراكمية للمحرك.', content, '<button class="button-primary" id="learning-ok">حسنًا</button>'), 'learning-center');
    $('learning-ok').onclick = closeModal;
    $('reset-weights-btn').onclick = function () {
      if (learningStore) learningStore.resetWeights();
      persistLearningData();
      saveState();
      toast('تمت إعادة ضبط أوزان البحث.');
      closeModal();
    };
  }

  function openLexiconManager() {
    if (processing) { toast('انتظر حتى تنتهي العملية الحالية.'); return; }
    var content = '<section class="settings-section"><h3>توسيع القاموس التقني المزدوج</h3><p>أضف مصطلحات تقنية جديدة أو صحح مصطلحات حالية لربط البحث والاستعلامات بين العربية والإنجليزية محليًا.</p></section>' +
      '<label class="field"><span>المصطلح بالعربية</span><input class="prompt-box" id="lex-ar" placeholder="مثال: تبديل الحزم"></label>' +
      '<label class="field"><span>المصطلح بالإنجليزية</span><input class="prompt-box" id="lex-en" placeholder="مثال: Packet Switching"></label>' +
      '<label class="field"><span>الاختصار (إن وجد)</span><input class="prompt-box" id="lex-abbr" placeholder="مثال: PS"></label>' +
      '<label class="field"><span>المجال التقني</span><select id="lex-domain"><option value="networking">شبكات الحاسوب (Networking)</option><option value="databases">قواعد البيانات (Databases)</option><option value="operating-systems">أنظمة التشغيل (OS)</option><option value="architecture">معمارية الحاسوب (Architecture)</option><option value="cybersecurity">الأمن السيبراني (Cybersecurity)</option></select></label>' +
      '<label class="field"><span>التعريف المباشر بالعربية</span><textarea id="lex-def" style="min-height:80px" placeholder="تعريف مختصر للمصطلح..."></textarea></label>';
    openModal(modalShell('إضافة مصطلح للقاموس', 'توسيع المعرفة المحلية بدون إنترنت.', content, '<button class="button-secondary" id="lex-cancel">إلغاء</button><button class="button-primary" id="lex-save">حفظ المصطلح</button>'), 'lexicon');
    $('lex-cancel').onclick = closeModal;
    $('lex-save').onclick = function () {
      var ar = $('lex-ar').value.trim(), en = $('lex-en').value.trim(), abbr = $('lex-abbr').value.trim(), dom = $('lex-domain').value, def = $('lex-def').value.trim();
      if (!ar && !en) { toast('أدخل المصطلح بالعربية أو بالإنجليزية.'); return; }
      if (!state.userLexicon) state.userLexicon = [];
      state.userLexicon.push({
        id: 'user-' + Date.now(),
        term_ar: ar,
        term_en: en,
        abbreviation: abbr,
        domain: dom,
        definition_ar: def,
        verified: true
      });
      saveState();
      closeModal();
      toast('تمت إضافة المصطلح للقاموس المحلي.');
    };
  }

  function openSettings() {
    if (processing) { toast('انتظر انتهاء قراءة المصدر أولًا.'); return; }
    var s = state.settings;
    var content = '<section class="settings-section"><h3>المحرّك المحلي</h3><p>يجمع أدلة من صفحات متعددة وينظمها حسب التعريف والوظيفة والخطوات والأسباب والأمثلة. ويتدرب محليًا على نصوص الدفتر بعد فصل الجمل عن بعضها، ثم يستخدم تمثيلًا موزونًا للكلمات لتقليل أثر الكلمات الشائعة. هذه شبكة تشابه لترتيب المقاطع وليست نموذجًا لغويًا مولدًا.</p><p class="field-help">حالة التعلم الدلالي: ' + (activeSession().semanticModelStatus === 'ready' ? 'مدرّب على هذا الدفتر' : (activeSession().semanticModelStatus === 'insufficient' ? 'المحتوى الحالي غير كافٍ' : 'سيحاول التدريب عند أول سؤال')) + '</p></section>' +
      '<section class="settings-section"><h3>القيود وطريقة الإجابة</h3><div class="setting-row"><div><strong>المصادر فقط</strong><small>يعرض جملًا من المراجع فقط، ولا يحسب من السؤال بصورة مستقلة.</small></div><label class="switch"><input type="checkbox" id="strict-mode" ' + (s.mode === 'strict' ? 'checked' : '') + '><span></span></label></div>' +
      '<div class="setting-row"><div><strong>السماح بالحساب المحلي</strong><small>للعمليات والمعادلات الخطية البسيطة عند إيقاف وضع المصادر فقط.</small></div><label class="switch"><input type="checkbox" id="allow-math" ' + (s.allowMath !== false ? 'checked' : '') + '><span></span></label></div>' +
      '<label class="field"><span>عمق الإجابة وعدد المقاطع المرجعية</span><select id="max-sentences"><option value="24">مفصل</option><option value="36">موسع — الافتراضي</option><option value="48">عميق</option><option value="60">شامل حسب محتوى المرجع</option></select></label></section>' +
      '<section class="settings-section"><h3>قراءة الصفحات المصوّرة</h3><div class="setting-row"><div><strong>محاولة قراءة النص المطبوع من الصورة</strong><small>قوالب وقاموس محليان، وتشمل صور PNG/JPEG/WebP المنفصلة.</small></div><label class="switch"><input type="checkbox" id="ocr-enabled" ' + (s.ocrEnabled !== false ? 'checked' : '') + '><span></span></label></div><label class="field"><span>الحد الأقصى لصفحات OCR في كل PDF</span><select id="ocr-page-limit"><option value="15">15 صفحة</option><option value="40">40 صفحة</option><option value="80">80 صفحة</option></select></label><p class="field-help">OCR تجريبي للخطوط المطبوعة الواضحة فقط؛ لا يقرأ الخط اليدوي أو يفهم الرسوم والجداول المعقدة. عند تجاوز الحد تحفظ معاينات الصور للمراجعة اليدوية. نسبة القبول المعجمية ليست نسبة دقة. تُحفظ معاينات الصور ضمن ميزانية تخزين حتى لا يتعطل حفظ بقية الدفتر؛ إذا تجاوزت الحد يحتفظ التطبيق بالنص المتاح ويبلغك بالصفحات التي لا تتوفر لها معاينة.</p></section>' +
      '<section class="settings-section"><h3>الخصوصية والتطوير</h3><p>المصادر والمحادثات محلية، ولا يطلب التطبيق صلاحية الإنترنت. البحث والتلخيص اقتباسيان، ولا يتعامل المحرك مع كل أنواع الأسئلة.</p><p style="margin-top:8px;font-size:0.85em;color:var(--text-secondary)">المطور محمد الفقيه</p></section>';
    openModal(modalShell('الإعدادات والتحكم', 'اضبط القيود المناسبة لك.', content, '<button class="button-secondary" id="cancel-settings">إلغاء</button><button class="button-primary" id="save-settings">حفظ الإعدادات</button>'), 'settings');
    $('max-sentences').value = String(s.maxSentences || 36);
    $('ocr-page-limit').value = String([15,40,80].indexOf(Number(s.maxOcrPages)) >= 0 ? Number(s.maxOcrPages) : 40);
    $('cancel-settings').onclick = closeModal;
    $('save-settings').onclick = function () {
      state.settings = {mode: $('strict-mode').checked ? 'strict' : 'flexible', allowMath: $('allow-math').checked, maxSentences: Number($('max-sentences').value), answerDepthVersion: 3, ocrEnabled: $('ocr-enabled').checked, maxOcrPages: Number($('ocr-page-limit').value)};
      saveState(); closeModal(); renderAll(); toast('تم حفظ الإعدادات.');
    };
  }

  function openPaste() {
    if (isBusy()) { toast('انتظر حتى تنتهي العملية الحالية.'); return; }
    var content = '<label class="field"><span>اسم المصدر</span><input class="prompt-box" id="paste-name" maxlength="100" placeholder="مثال: ملخص المحاضرة"></label><label class="field"><span>النص</span><textarea id="paste-content" style="min-height:190px" placeholder="الصق النص هنا..."></textarea></label><p class="field-help">يُحفظ النص على جهازك في هذا الدفتر فقط.</p>';
    openModal(modalShell('إضافة نص', 'الصق محتوى المرجع مباشرة.', content, '<button class="button-secondary" id="paste-cancel">إلغاء</button><button class="button-primary" id="paste-save">إضافة النص</button>'), 'paste');
    $('paste-cancel').onclick = closeModal;
    $('paste-save').onclick = function () {
      var text = $('paste-content').value.trim(), name = $('paste-name').value.trim() || 'نص مضاف';
      if (!text) { toast('الصق النص أولًا.'); return; }
      if (text.length > MAX_TEXT_CHARS) { toast('النص كبير جدًا. الحد الأقصى ثلاثة ملايين حرف.'); return; }
      var pasteSession = activeSession();
      var oldModelData = pasteSession.semanticModelData || null;
      var oldModelStatus = pasteSession.semanticModelStatus || 'pending';
      pasteSession.documents.push({id: uid(), name: name, type: 'text', pages: [{page: 1, text: text}], totalPages: 1});
      pasteSession.semanticModelData = null;
      pasteSession.semanticModelStatus = 'pending';
      if (!saveState()) {
        pasteSession.documents.pop();
        pasteSession.semanticModelData = oldModelData;
        pasteSession.semanticModelStatus = oldModelStatus;
        return;
      }
      closeModal(); renderAll(); toast('أُضيف النص إلى مصادرك.');
    };
  }
  function chooseFiles() {
    if (isBusy()) { toast('انتظر حتى تنتهي العملية الحالية.'); return; }
    closeDrawers(); $('file-input').click();
  }
  function readTextFile(buffer) {
    var bytes = new Uint8Array(buffer);
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
    return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
  }
  function selectedOcrPageLimit() {
    var value = Number(state && state.settings && state.settings.maxOcrPages) || 40;
    return [15, 40, 80].indexOf(value) >= 0 ? value : 40;
  }

  function storedPreviewChars() {
    var total = 0;
    (state && Array.isArray(state.sessions) ? state.sessions : []).forEach(function (session) {
      (session.documents || []).forEach(function (doc) {
        (doc.pages || []).forEach(function (page) { total += String(page.preview || '').length; });
      });
    });
    return total;
  }

  function createPreviewBudget() {
    // Native Android storage allows a larger atomic JSON state than browser localStorage.
    var maximum = Native ? 36 * 1024 * 1024 : Math.floor(1.5 * 1024 * 1024);
    return {remaining: Math.max(0, maximum - storedPreviewChars()), omittedPages: 0};
  }

  function imagePreview(canvas, budget) {
    if (!budget || budget.remaining < 8000) { if (budget) budget.omittedPages++; return null; }
    var preview = document.createElement('canvas');
    var maxPageChars = Math.min(budget.remaining, Native ? 220 * 1024 : 120 * 1024);
    var maxSide = Native ? 1200 : 1000;
    var ratio = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
    var width = Math.max(1, Math.round(canvas.width * ratio));
    var height = Math.max(1, Math.round(canvas.height * ratio));
    function renderAt(w, h) {
      preview.width = w; preview.height = h;
      var context = preview.getContext('2d', {alpha: false});
      context.fillStyle = '#fff'; context.fillRect(0, 0, w, h);
      context.drawImage(canvas, 0, 0, w, h);
    }
    renderAt(width, height);
    var data = preview.toDataURL('image/jpeg', Native ? 0.54 : 0.46);
    if (data.length > maxPageChars) {
      var reduction = Math.max(0.25, Math.sqrt(maxPageChars / data.length) * 0.88);
      width = Math.max(240, Math.round(width * reduction));
      height = Math.max(240, Math.round(height * reduction));
      renderAt(width, height);
      data = preview.toDataURL('image/jpeg', Native ? 0.42 : 0.36);
    }
    if (data.length > maxPageChars && Math.max(width, height) > 420) {
      var finalScale = 420 / Math.max(width, height);
      width = Math.max(240, Math.round(width * finalScale));
      height = Math.max(240, Math.round(height * finalScale));
      renderAt(width, height);
      data = preview.toDataURL('image/jpeg', 0.32);
    }
    preview.width = preview.height = 1;
    if (data.length > maxPageChars || data.length > budget.remaining) { budget.omittedPages++; return null; }
    budget.remaining -= data.length;
    return data;
  }

  async function imageFileToCanvas(file) {
    var bitmap = null, source = null, objectUrl = null;
    try {
      if (typeof createImageBitmap === 'function') {
        bitmap = await createImageBitmap(file);
        source = bitmap;
      } else {
        objectUrl = URL.createObjectURL(file);
        source = await new Promise(function (resolve, reject) {
          var image = new Image();
          image.onload = function () { resolve(image); };
          image.onerror = function () { reject(new Error('تعذر فك ترميز الصورة.')); };
          image.src = objectUrl;
        });
      }
      var width = Number(source.width || source.naturalWidth), height = Number(source.height || source.naturalHeight);
      if (!width || !height || width * height > 60000000) throw new Error('أبعاد الصورة غير صالحة أو كبيرة جدًا.');
      var scale = Math.min(2, Math.sqrt(4000000 / (width * height)), 2200 / Math.max(width, height));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(width * scale));
      canvas.height = Math.max(1, Math.ceil(height * scale));
      var context = canvas.getContext('2d', {willReadFrequently: true, alpha: false});
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      return canvas;
    } finally {
      if (bitmap && typeof bitmap.close === 'function') bitmap.close();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  async function recognizeCanvas(canvas, pageLabel) {
    return OCR.recognize(canvas, {
      shouldStop: function () { return cancelProcessing; },
      onProgress: function (line, lines) {
        $('typing-text').textContent = 'أقرأ صورة ' + pageLabel + ' · سطر ' + fmt(line) + ' من ' + fmt(lines);
      }
    });
  }

  async function extractFile(file, previewBudget) {
    if (file.size > MAX_FILE_BYTES) throw new Error('حجم الملف يتجاوز ٦٠ ميغابايت.');
    var lower = String(file.name || '').toLowerCase();
    var pdf = lower.endsWith('.pdf') || file.type === 'application/pdf';
    var imageFile = /\.(?:png|jpe?g|webp)$/i.test(lower) || /^image\/(?:png|jpeg|webp)$/i.test(file.type);
    var textFile = /\.(txt|md|markdown)$/.test(lower) || /^text\//.test(file.type);
    if (!pdf && !textFile && !imageFile) throw new Error('الملف غير مدعوم؛ اختر PDF أو TXT أو Markdown أو صورة PNG/JPEG/WebP.');
    if (textFile && !pdf && !imageFile) {
      var textBuffer = await new Promise(function (resolve, reject) {
        var reader = new FileReader(); reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { reject(new Error('تعذّر قراءة الملف.')); };
        reader.readAsArrayBuffer(file);
      });
      var plainText = readTextFile(textBuffer).trim();
      if (!plainText) throw new Error('الملف النصي فارغ.');
      if (plainText.length > MAX_TEXT_CHARS) throw new Error('النص يتجاوز الحد الأقصى (٣ ملايين حرف).');
      return {doc: {id: uid(), name: file.name, type: 'text', pages: [{page: 1, text: plainText, extractionMethod: 'text-file'}], totalPages: 1, extraction: {totalPages: 1, processedPages: 1, searchablePages: 1}}, warning: ''};
    }

    if (imageFile) {
      if (!OCR) throw new Error('محرك قراءة الصور المحلي غير متاح.');
      var imageCanvas = await imageFileToCanvas(file);
      var imagePage = {page: 1, text: '', ocr: true, extractionMethod: 'image-ocr'};
      var imageWarnings = [];
      try {
        imagePage.preview = imagePreview(imageCanvas, previewBudget);
        if (!imagePage.preview) { imagePage.previewOmitted = true; imageWarnings.push('لم تُحفظ معاينة الصورة بسبب بلوغ مساحة الصور المخصصة للتخزين المحلي.'); }
        if (state.settings.ocrEnabled === false) {
          imagePage.ocrSkipped = true;
          imageWarnings.push('تم حفظ صورة الملف، لكن قراءة النص متوقفة في الإعدادات. فعّل قراءة الصور إذا كنت تريد محاولة OCR؛ ويمكنك أيضًا إدخال النص يدويًا.');
        } else {
          $('typing-text').textContent = 'أقرأ الصورة ' + file.name;
          var imageResult = await recognizeCanvas(imageCanvas, file.name);
          if (cancelProcessing) throw new Error('أُوقفت القراءة؛ لم يُحفظ الملف الحالي.');
          imagePage.text = String(imageResult.text || '');
          imagePage.ocrStats = {recognized: imageResult.recognized, uncertain: imageResult.uncertain, total: imageResult.totalWords, recognitionRate: imageResult.recognitionRate};
          if (imageResult.truncated) imageWarnings.push('توقف OCR بعد ٣٥٠ كلمة لهذه الصورة.');
          if (imageResult.uncertain) imageWarnings.push('توجد كلمات غير واضحة ممثلة بالرمز □.');
          if (imageResult.totalWords >= 5 && imageResult.recognitionRate < 0.55) imageWarnings.push('قبول قاموس OCR منخفض؛ استُبعد النص من البحث حتى تصحيحه يدويًا.');
          if (!imagePage.text.trim()) imageWarnings.push('لم يتمكن OCR من استخراج كلمات من الصورة. احتفظنا بالصورة لتتمكن من إدخال النص يدويًا.');
        }
      } catch (error) {
        if (cancelProcessing) throw error;
        imagePage.ocrFailed = true;
        imageWarnings.push('تعذرت قراءة النص آليًا؛ الصورة محفوظة ويمكن تصحيح نصها يدويًا.');
      } finally { imageCanvas.width = imageCanvas.height = 1; }
      return {doc: {id: uid(), name: file.name, type: 'image', pages: [imagePage], totalPages: 1, extraction: {totalPages: 1, processedPages: 1, ocrAttemptedPages: imagePage.ocrStats ? 1 : 0, skippedOcrPages: imagePage.ocrSkipped ? 1 : 0, ocrFailedPages: imagePage.ocrFailed ? 1 : 0, lowConfidenceOcrPages: imagePage.ocrStats && imagePage.ocrStats.recognitionRate < 0.55 ? 1 : 0, warnings: imageWarnings}}, warning: imageWarnings.join(' ')};
    }

    if (!window.pdfjsLib) throw new Error('تعذّر تشغيل قارئ PDF المحلي.');
    var buffer = await new Promise(function (resolve, reject) {
      var reader = new FileReader(); reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('تعذّر قراءة الملف.')); };
      reader.readAsArrayBuffer(file);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    var loading = window.pdfjsLib.getDocument({data: new Uint8Array(buffer), cMapUrl: 'vendor/cmaps/', cMapPacked: true, standardFontDataUrl: 'vendor/standard_fonts/', isEvalSupported: false, useSystemFonts: true});
    var pdfDoc;
    try { pdfDoc = await loading.promise; } catch (e) {
      if (e && (e.name === 'PasswordException' || /password/i.test(e.message || ''))) throw new Error('الملف محمي بكلمة مرور؛ أزل الحماية ثم أعد إضافته.');
      throw new Error('تعذّرت قراءة PDF. تأكد أن الملف سليم وغير محمي.');
    }
    var totalPages = pdfDoc.numPages, pages = [], count = Math.min(totalPages, MAX_PAGES), totalChars = 0;
    var maxOcrPages = selectedOcrPageLimit();
    var empty = 0, truncated = false, ocrCount = 0, skipped = 0, ocrFailed = 0, uncertain = 0, recognized = 0, lowRecognitionPages = 0, limited = 0, textLayerPages = 0, imagePages = 0, previewOmittedPages = 0;
    try {
      for (var i = 1; i <= count; i++) {
        if (cancelProcessing) throw new Error('أُوقفت القراءة؛ لم يُحفظ الملف الحالي.');
        $('typing-text').textContent = 'أقرأ الصفحة ' + fmt(i) + ' من ' + fmt(count);
        var page = await pdfDoc.getPage(i);
        try {
          var tc = await page.getTextContent({disableCombineTextItems: false});
          var pageText = E.extractPdfText(tc.items), imagePage = !pageText.trim();
          if (page.getOperatorList && pageText.trim().length < 600) {
            try {
              var ops = await page.getOperatorList();
              var imageOps = [window.pdfjsLib.OPS.paintImageXObject, window.pdfjsLib.OPS.paintInlineImageXObject, window.pdfjsLib.OPS.paintJpegXObject].filter(function (v) { return v != null; });
              if (ops && Array.isArray(ops.fnArray) && ops.fnArray.some(function (fn) { return imageOps.indexOf(fn) !== -1; })) imagePage = true;
            } catch (_) { /* Text extraction remains usable if image-operator inspection is unavailable. */ }
          }
          var pageData = {page: i, text: pageText, extractionMethod: pageText.trim() ? 'text-layer' : 'empty'};
          if (imagePage && pageText.trim()) pageData.textLayerText = pageText;
          if (pageText.trim()) textLayerPages++;
          if (imagePage) {
            imagePages++; pageData.ocr = true;
            var base = page.getViewport({scale: 1});
            var scale = Math.min(2, Math.sqrt(4000000 / (base.width * base.height)), 2200 / Math.max(base.width, base.height));
            var viewport = page.getViewport({scale: scale});
            var canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height));
            var context = canvas.getContext('2d', {willReadFrequently: true, alpha: false});
            context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({canvasContext: context, viewport: viewport, background: '#fff'}).promise;
            if (cancelProcessing) throw new Error('أُوقفت القراءة؛ لم يُحفظ الملف الحالي.');
            pageData.preview = imagePreview(canvas, previewBudget);
            if (!pageData.preview) { pageData.previewOmitted = true; previewOmittedPages++; }
            if (state.settings.ocrEnabled !== false && ocrCount < maxOcrPages) {
              ocrCount++; pageData.extractionMethod = pageText.trim() ? 'text-layer+ocr' : 'image-ocr';
              $('typing-text').textContent = 'أحاول قراءة صورة الصفحة ' + fmt(i) + ' من ' + fmt(count);
              try {
                var found = await recognizeCanvas(canvas, 'الصفحة ' + fmt(i));
                if (cancelProcessing) throw new Error('أُوقفت القراءة؛ لم يُحفظ الملف الحالي.');
                pageData.text = SourceQuality ? SourceQuality.mergeTextLayers(pageText, found.text) : [pageText, found.text].filter(Boolean).join('\n');
                recognized += Number(found.recognized) || 0; uncertain += Number(found.uncertain) || 0;
                pageData.ocrStats = {recognized: found.recognized, uncertain: found.uncertain, total: found.totalWords, recognitionRate: found.recognitionRate};
                if (found.totalWords >= 5 && found.recognitionRate < 0.55) lowRecognitionPages++;
                if (found.truncated) limited++;
              } catch (err) {
                if (cancelProcessing) throw err;
                pageData.ocrFailed = true; ocrFailed++;
              }
            } else {
              pageData.ocrSkipped = true; skipped++;
              pageData.extractionMethod = pageText.trim() ? 'text-layer-image-ocr-skipped' : 'ocr-skipped';
            }
            canvas.width = canvas.height = 1;
          }
          if (totalChars + pageData.text.length > MAX_TEXT_CHARS) { truncated = true; break; }
          if (!pageData.text || !pageData.text.replace(/[□\s]/g, '')) empty++;
          pages.push(pageData); totalChars += pageData.text.length;
        } finally { if (page.cleanup) page.cleanup(); }
      }
    } finally { if (pdfDoc.destroy) await pdfDoc.destroy(); }
    if (cancelProcessing) throw new Error('أُوقفت القراءة؛ لم يُحفظ الملف الحالي.');
    if (!pages.length) throw new Error('لم يتم استخراج أي صفحة من الملف.');
    var warnings = [];
    if (imagePages) warnings.push('عُثر على ' + fmt(imagePages) + ' صفحة تحتوي صورًا أو صفحات ممسوحة ضوئيًا.');
    if (ocrCount) warnings.push('حاولت قراءة ' + fmt(ocrCount) + ' صفحة مصوّرة. قراءة OCR تجريبية وليست ضمانًا لصحة الكلمات؛ راجع صورة الصفحة والنص.');
    if (previewOmittedPages) warnings.push('لم تُحفظ معاينة صور ' + fmt(previewOmittedPages) + ' صفحة بسبب مساحة تخزين المعاينات؛ قد لا تتاح مراجعتها بصريًا داخل الدفتر.');
    if (uncertain) warnings.push('الرمز □ يمثل كلمات لم تُعرف بثقة (' + fmt(uncertain) + ').');
    if (lowRecognitionPages) warnings.push('صفحات OCR منخفضة القبول المعجمي (' + fmt(lowRecognitionPages) + ') استُبعدت من البحث حتى تصحيحها يدويًا.');
    if (empty) warnings.push(fmt(empty) + ' صفحة بلا نص مستخرج قابل للبحث؛ احتفظنا بمعاينتها إن كانت مصورة.');
    if (ocrFailed) warnings.push('تعذّرت القراءة الآلية في ' + fmt(ocrFailed) + ' صفحة؛ افتح صورة الصفحة وأدخل النص يدويًا.');
    if (limited) warnings.push('وصل OCR إلى حد ٣٥٠ كلمة في ' + fmt(limited) + ' صفحة.');
    if (state.settings.ocrEnabled === false) warnings.push('فعّل قراءة الصور من الإعدادات إذا كنت تريد محاولة OCR للصفحات المصوّرة.');
    if (skipped) warnings.push('لم تتم محاولة OCR في ' + fmt(skipped) + ' صفحة بسبب الإعداد أو حد ' + fmt(maxOcrPages) + ' صفحة لكل ملف؛ بقيت معاينات الصفحات للمراجعة اليدوية.');
    if (totalPages > MAX_PAGES || truncated) warnings.push('لم تُعالج كل الصفحات؛ عولجت ' + fmt(pages.length) + ' صفحة من ' + fmt(totalPages) + ' بسبب حدود الصفحات أو النص.');
    var extraction = {totalPages: totalPages, processedPages: pages.length, textLayerPages: textLayerPages, imagePages: imagePages, ocrAttemptedPages: ocrCount, skippedOcrPages: skipped, ocrFailedPages: ocrFailed, lowConfidenceOcrPages: lowRecognitionPages, previewOmittedPages: previewOmittedPages, emptyPages: empty, recognizedWords: recognized, uncertainWords: uncertain, ocrPageLimit: maxOcrPages, pageLimitReached: totalPages > MAX_PAGES, textLimitReached: truncated, warnings: warnings};
    return {doc: {id: uid(), name: file.name, type: 'pdf', pages: pages, totalPages: totalPages, extraction: extraction}, warning: warnings.join(' ')};
  }
  async function importFiles(fileList) {
    if (!fileList || !fileList.length || isBusy()) return;
    processing = true; cancelProcessing = false; renderAll(); scrollBottom();
    var session = activeSession(), added = 0, notices = [], previewBudget = createPreviewBudget();
    for (var i = 0; i < fileList.length; i++) {
      try {
        var result = await extractFile(fileList[i], previewBudget);
        var oldModelData = session.semanticModelData || null;
        var oldModelStatus = session.semanticModelStatus || 'pending';
        session.documents.push(result.doc);
        session.semanticModelData = null;
        session.semanticModelStatus = 'pending';
        if (!saveState()) {
          session.documents.pop();
          session.semanticModelData = oldModelData;
          session.semanticModelStatus = oldModelStatus;
          notices.push(fileList[i].name + ': تعذّر حفظ المصدر.');
          continue;
        }
        added++;
        if (result.warning) notices.push(fileList[i].name + ': ' + result.warning);
      } catch (err) { notices.push(fileList[i].name + ': ' + (err && err.message ? err.message : 'تعذّرت قراءة الملف.')); }
      if (cancelProcessing) break;
    }
    if (previewBudget.omittedPages && !notices.some(function (item) { return item.indexOf('معاينة') >= 0; })) notices.push('تم تجاوز مساحة تخزين معاينات الصور لعدد ' + fmt(previewBudget.omittedPages) + ' صفحة. النص المستخرج يبقى محفوظًا عند نجاح الحفظ.');
    processing = false; renderAll();
    if (notices.length) openModal(modalShell('نتيجة إضافة المصادر', added ? 'تمت إضافة ' + fmt(added) + ' من الملفات.' : 'لم تتم إضافة أي ملف.', '<p class="excerpt-note" style="white-space:pre-wrap">' + esc(notices.join('\n\n')) + '</p>', '<button class="button-primary" id="import-ok">حسنًا</button>'), 'import');
    else if (added) toast('أُضيفت المصادر إلى دفترك.');
    if ($('import-ok')) $('import-ok').onclick = closeModal;
  }

  async function sendQuestion(raw) {
    var question = String(raw == null ? $('question').value : raw).trim();
    if (!question || isBusy()) return;
    if (question.length > 3000) { toast('السؤال طويل جدًا؛ اختصره ثم أعد المحاولة.'); return; }
    var session = activeSession();
    var prior = session.messages.slice().reverse().find(function (m) { return m.role === 'user'; });
    session.messages.push({id: uid(), role: 'user', text: question});
    if (session.title === 'دفتر جديد') session.title = E.shorten(question.replace(/\s+/g, ' '), 29);
    $('question').value = ''; $('question').style.height = '';
    processing = true;
    renderAll(); scrollBottom();
    try {
      var semanticModel = Neural && session.semanticModelData ? Neural.restore(session.semanticModelData) : null;
      if (Neural && session.documents.length && !semanticModel && session.semanticModelStatus !== 'insufficient') {
        toast('يجري تدريب أداة تشابه محلية صغيرة على نصوص هذا الدفتر.');
        try {
          var trainedModel = await Neural.train(session.documents, {
            dimension: 24, window: 2, negatives: 2, epochs: 1, maxSequenceTokens: 64,
            maxVocabulary: 1600, maxTokens: 24000, minCount: 2, maxChars: 360000
          });
          if (trainedModel) {
            session.semanticModelData = trainedModel.exportData();
            session.semanticModelStatus = 'ready';
            semanticModel = trainedModel;
            toast('اكتمل تدريب أداة التشابه المحلية؛ ستساعد في ترتيب المقاطع المتقاربة دلاليًا.');
          } else {
            session.semanticModelData = null;
            session.semanticModelStatus = 'insufficient';
            toast('نصوص الدفتر قصيرة أو قليلة لتدريب الأداة؛ يستمر البحث النصي دونها.');
          }
          saveState();
        } catch (trainingError) {
          session.semanticModelData = null;
          session.semanticModelStatus = 'insufficient';
          toast('تعذر التدريب المحلي؛ سيعمل البحث النصي المعتاد دون تعطيل الإجابة.');
        }
      }
      var reply = A.answer({
        question: question,
        documents: session.documents,
        priorQuestion: prior && prior.text,
        mode: state.settings.mode,
        allowMath: state.settings.allowMath,
        maxSentences: state.settings.maxSentences || 24,
        userLexicon: state.userLexicon,
        learningStore: learningStore,
        semanticModel: semanticModel
      });
      var assistantMessage = {
        id: uid(), role: 'assistant', text: reply.text, origin: reply.origin,
        references: reply.references, intent: reply.intent,
        semanticUsed: !!reply.semanticUsed, evidenceCount: reply.evidenceCount || 0
      };
      session.messages.push(assistantMessage);
      if (learningStore) {
        assistantMessage.experienceId = learningStore.recordExperience({
          messageId: assistantMessage.id, question: question,
          intent: reply.intent, answerText: reply.text, references: reply.references
        });
        persistLearningData();
      }
    } catch (_) {
      session.messages.push({id: uid(), role: 'assistant',
        text: 'تعذّر تحليل هذا السؤال محليًا. جرّب صياغة أخرى أو راجع النص المستخرج من الملف.',
        origin: 'error', references: []});
    } finally {
      processing = false;
      saveState(); renderAll(); scrollBottom();
    }
  }

  function openSessionOptions() {
    var session = activeSession();
    var content = '<div class="model-actions"><button class="button-secondary" id="rename-session">' + icon('edit') + ' تغيير الاسم</button><button class="button-danger" id="delete-session">' + icon('trash') + ' حذف الدفتر</button></div><p class="excerpt-note">كل دفتر يحتفظ بمصادره ومحادثاته بشكل مستقل.</p>';
    openModal(modalShell('خيارات الدفتر', session.title, content, ''), 'session');
    $('rename-session').onclick = function () {
      openModal(modalShell('تغيير اسم الدفتر', '', '<label class="field"><span>الاسم</span><input class="prompt-box" id="session-name" maxlength="80" value="' + esc(session.title) + '"></label>', '<button class="button-secondary" id="rename-cancel">إلغاء</button><button class="button-primary" id="rename-save">حفظ</button>'), 'rename');
      $('rename-cancel').onclick = closeModal; $('rename-save').onclick = function () { var name = $('session-name').value.trim(); if (!name) { toast('أدخل اسمًا للدفتر.'); return; } session.title = name; saveState(); closeModal(); renderAll(); };
    };
    $('delete-session').onclick = function () {
      confirmAction('حذف الدفتر', 'سيُحذف الدفتر ومصادره ومحادثاته من هذا الجهاز نهائيًا.', 'حذف الدفتر', function () {
        persistLearningData();
        state.sessions = state.sessions.filter(function (s) { return s.id !== session.id; });
        if (!state.sessions.length) state.sessions.push(newSession());
        state.activeId = state.sessions[0].id; activateLearningStore(); saveState(); renderAll(); toast('تم حذف الدفتر.');
      }, true);
    };
  }

  function init() {
    state = loadState();
    if (window.MlkeLearning) {
      activateLearningStore();
    }
    // A killed process cannot resume a native generation. Do not leave a fake streaming message.
    state.sessions.forEach(function (s) { s.messages.forEach(function (m) { if (m.streaming) { m.streaming = false; m.origin = 'error'; m.references = []; m.text = m.text ? m.text + '\n\n[انقطع التوليد]' : 'انقطع التوليد قبل اكتماله. حاول مجددًا.'; } }); });
    renderAll();
    $('menu-btn').onclick = function () { openDrawer('rail'); }; $('close-rail').onclick = closeDrawers;
    $('mobile-sources').onclick = function () { openDrawer('sources-panel'); }; $('close-sources').onclick = closeDrawers; $('drawer-backdrop').onclick = closeDrawers;
    $('settings-btn').onclick = openSettings; $('top-settings').onclick = openSettings; $('mode-shortcut').onclick = openSettings;
    if ($('lexicon-btn')) $('lexicon-btn').onclick = openLexiconManager;
    if ($('learning-center-btn')) $('learning-center-btn').onclick = openLearningCenter;
    $('new-session').onclick = function () { if (isBusy()) return; persistLearningData(); var s = newSession(); state.sessions.unshift(s); state.activeId = s.id; activateLearningStore(); saveState(); closeDrawers(); renderAll(); };
    $('session-more').onclick = function () { if (isBusy()) { toast('انتظر حتى تنتهي العملية الحالية.'); return; } openSessionOptions(); };
    ['add-source', 'mobile-add', 'welcome-upload', 'attach-btn'].forEach(function (id) { $(id).onclick = chooseFiles; });
    $('paste-source').onclick = openPaste;
    $('file-input').onchange = function () { var files = Array.prototype.slice.call(this.files || []); this.value = ''; importFiles(files); };
    $('send-btn').onclick = function () { sendQuestion(); };
    $('stop-btn').onclick = function () { if (processing) { cancelProcessing = true; $('typing-text').textContent = 'جارٍ إيقاف القراءة'; } };
    $('question').addEventListener('input', function () { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 120) + 'px'; });
    $('question').addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); sendQuestion(); } });
    $('suggestions').querySelectorAll('button').forEach(function (el) { el.onclick = function () { sendQuestion(el.dataset.question); }; });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { if (!$('modal-root').hidden) closeModal(); else closeDrawers(); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
