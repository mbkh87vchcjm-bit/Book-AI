(function () {
  'use strict';
  var E = window.MidadEngine, A = window.MidadAnswer, OCR = window.MidadOcr;
  var $ = function (id) { return document.getElementById(id); };
  var Native = window.NativeBridge || null;
  var STORAGE_KEY = 'midad-state-v1';
  var MAX_FILE_BYTES = 60 * 1024 * 1024;
  var MAX_TEXT_CHARS = 3000000;
  var MAX_PAGES = 500;
  var MAX_OCR_PAGES = 15;
  var defaults = {mode: 'flexible', allowMath: true, maxSentences: 3, ocrEnabled: true};
  var state;
  var processing = false, cancelProcessing = false, savingWarning = false, storageBlocked = false, modalKind = null, toastTimer;

  function uid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); }
  function icon(name) { return '<svg aria-hidden="true"><use href="#i-' + name + '"></use></svg>'; }
  function fmt(n) { try { return Number(n).toLocaleString('ar'); } catch (_) { return String(n); } }
  function messageText(text) { return esc(text).replace(/\*\*([^*\n]{1,200})\*\*/g, '<strong>$1</strong>'); }
  function newSession() { return {id: uid(), title: 'دفتر جديد', created: Date.now(), documents: [], messages: []}; }
  function isBusy() { return processing; }
  function activeSession() { return state.sessions.find(function (s) { return s.id === state.activeId; }) || state.sessions[0]; }

  function loadState() {
    var raw = '';
    try {
      raw = Native ? Native.getState() : localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var obj = JSON.parse(raw);
        if (!obj || !Array.isArray(obj.sessions) || !obj.sessions.length || obj.sessions.some(function (s) {
          return !s || typeof s.id !== 'string' || !Array.isArray(s.documents) || !Array.isArray(s.messages);
        })) throw new Error('Invalid saved state');
        obj.settings = Object.assign({}, defaults, obj.settings || {});
        if (!obj.sessions.some(function (s) { return s.id === obj.activeId; })) obj.activeId = obj.sessions[0].id;
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
      el.onclick = function () { if (isBusy()) return; state.activeId = el.dataset.session; saveState(); closeDrawers(); renderAll(); scrollBottom(); };
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
      var detail = d.type === 'pdf' ? fmt(d.pages.length) + ' صفحة محفوظة' + (d.pages.some(function (p) { return p.ocr; }) ? ' · يتضمن قراءة صور' : '') : 'نص مضاف';
      return '<div class="source-item"><div class="source-file-icon ' + (d.type !== 'pdf' ? 'text' : '') + '">' + icon('file') + '</div><button class="source-item-copy" data-source="' + esc(d.id) + '"><strong dir="auto">' + esc(d.name) + '</strong><small>' + detail + '</small></button><button class="source-delete" data-delete="' + esc(d.id) + '" aria-label="حذف المصدر">' + icon('trash') + '</button></div>';
    }).join('');
    $('source-list').querySelectorAll('[data-source]').forEach(function (el) { el.onclick = function () { openDocument(el.dataset.source, 1); }; });
    $('source-list').querySelectorAll('[data-delete]').forEach(function (el) { el.onclick = function () {
      if (isBusy()) { toast('انتظر حتى تنتهي العملية الحالية.'); return; }
      var id = el.dataset.delete, doc = session.documents.find(function (d) { return d.id === id; });
      if (!doc) return;
      confirmAction('حذف المصدر', 'سيُحذف النص المستخرج من هذا الدفتر. ستبقى الاقتباسات المحفوظة في المحادثة.', 'حذف المصدر', function () {
        session.documents = session.documents.filter(function (d) { return d.id !== id; }); saveState(); renderAll(); toast('تم حذف المصدر.');
      }, true);
    }; });
  }
  function refMarkup(msg) {
    if (!msg.references || !msg.references.length) return '';
    return '<div class="references"><div class="reference-heading">' + icon('book') + 'جمل منتقاة من مراجعك</div><div class="reference-list">' + msg.references.map(function (r, index) {
      var page = r.type === 'pdf' ? 'صفحة ' + fmt(r.page) : 'نص';
      if (r.ocr) page += ' · من صورة، راجعها';
      return '<button class="reference-card" data-message="' + esc(msg.id) + '" data-reference="' + index + '"><span class="reference-number">' + fmt(index + 1) + '</span><span class="reference-info"><strong dir="auto">' + esc(r.docName) + '</strong><small>' + esc(page) + '</small></span></button>';
    }).join('') + '</div><div class="reference-disclaimer">الجمل منتقاة آليًا؛ راجع الصفحة، خصوصًا النص المقروء من الصور.</div></div>';
  }
  function originMarkup(msg) {
    var text, css = msg.origin || '';
    if (msg.origin === 'source' || msg.origin === 'extract') text = 'جمل مختارة من المرجع';
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
      return '<article class="message ' + (user ? 'user' : 'assistant') + '" data-message-id="' + esc(m.id) + '"><div class="' + (user ? 'user-avatar' : 'assistant-avatar') + '">' + (user ? 'أنت' : icon('spark')) + '</div><div class="message-body"><div class="message-meta"><strong>' + (user ? 'أنت' : 'مداد') + '</strong>' + '</div><div class="message-text" dir="auto">' + body + '</div>' + (!user ? originMarkup(m) + refMarkup(m) + '<div class="message-actions"><button data-copy="' + esc(m.id) + '">' + icon('copy') + ' نسخ</button></div>' : '') + '</div></article>';
    }).join('');
    $('messages').querySelectorAll('[data-reference]').forEach(function (el) { el.onclick = function () { openReference(el.dataset.message, Number(el.dataset.reference)); }; });
    $('messages').querySelectorAll('[data-copy]').forEach(function (el) { el.onclick = function () {
      var msg = session.messages.find(function (m) { return m.id === el.dataset.copy; });
      if (!msg) return;
      if (Native && Native.copyText) { Native.copyText(msg.text); toast('تم نسخ النص.'); }
      else if (navigator.clipboard) navigator.clipboard.writeText(msg.text).then(function () { toast('تم نسخ النص.'); }).catch(function () { toast('تعذّر النسخ.'); });
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
    var content = '<div class="excerpt-badge">' + icon('file') + (doc.type === 'pdf' ? 'الصفحة ' + fmt(page.page) + ' من ' + fmt(doc.totalPages || doc.pages.length) : 'النص المستخرج') + '</div>';
    if (page.ocr) {
      content += '<p class="excerpt-note">النص قُرئ من صورة آليًا وقد يحتوي على أخطاء أو كلمات غير واضحة (□). قارن بالصورة وصححه قبل الاعتماد عليه.</p>';
      if (typeof page.preview === 'string' && page.preview.length < 1600000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(page.preview))
        content += '<img class="ocr-preview" src="' + esc(page.preview) + '" alt="صورة الصفحة المصوّرة">';
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
    var label = ref.type === 'pdf' ? 'الصفحة ' + fmt(ref.page) : 'نص';
    var note = ref.ocr ? 'هذا نص مقروء من صورة وقد يكون غير دقيق. افتح الصفحة وقارنه بالصورة.' : 'جملة منتقاة آليًا من النص المحلي. تحقق من الصفحة الأصلية.';
    var content = '<div class="excerpt-badge">' + icon('book') + esc(label) + '</div><div class="excerpt-text" dir="auto">' + esc(ref.excerpt) + '</div><p class="excerpt-note">' + esc(note) + '</p>';
    var footer = doc ? '<button id="open-full-page" class="button-secondary">عرض نص الصفحة</button>' : '';
    openModal(modalShell(ref.docName, 'المصدر ' + fmt(index + 1) + ' · ' + label, content, footer), 'reference');
    if ($('open-full-page')) $('open-full-page').onclick = function () { openDocument(ref.docId, ref.page); };
  }
  function openSettings() {
    if (processing) { toast('انتظر انتهاء قراءة المصدر أولًا.'); return; }
    var s = state.settings;
    var content = '<section class="settings-section"><h3>المحرّك المحلي</h3><p>لا يحتاج التطبيق إلى استيراد نموذج. ينتقي جملًا من المراجع ويجري عمليات حسابية ومعادلات خطية بسيطة بقواعد مبرمجة؛ ليس نموذجًا لغويًا عامًا.</p></section>' +
      '<section class="settings-section"><h3>القيود وطريقة الإجابة</h3><div class="setting-row"><div><strong>المصادر فقط</strong><small>يعرض جملًا من المراجع فقط، ولا يحسب من السؤال بصورة مستقلة.</small></div><label class="switch"><input type="checkbox" id="strict-mode" ' + (s.mode === 'strict' ? 'checked' : '') + '><span></span></label></div>' +
      '<div class="setting-row"><div><strong>السماح بالحساب المحلي</strong><small>للعمليات والمعادلات الخطية البسيطة عند إيقاف وضع المصادر فقط.</small></div><label class="switch"><input type="checkbox" id="allow-math" ' + (s.allowMath !== false ? 'checked' : '') + '><span></span></label></div>' +
      '<label class="field"><span>عدد الجمل المنتقاة</span><select id="max-sentences"><option value="1">جملة واحدة</option><option value="3">٣ جمل</option><option value="5">٥ جمل</option></select></label></section>' +
      '<section class="settings-section"><h3>قراءة الصفحات المصوّرة</h3><div class="setting-row"><div><strong>محاولة قراءة النص المطبوع من الصورة</strong><small>قوالب وقاموس محليان، حتى ١٥ صفحة مصوّرة لكل ملف.</small></div><label class="switch"><input type="checkbox" id="ocr-enabled" ' + (s.ocrEnabled !== false ? 'checked' : '') + '><span></span></label></div><p class="field-help">تجريبية ومحدودة الخطوط؛ قد تخطئ أو لا تتعرف على كلمات. لا تفهم الرسومات أو الخط اليدوي. صحّح النص بمقارنته بصورة الصفحة.</p></section>' +
      '<section class="settings-section"><h3>الخصوصية</h3><p>المصادر والمحادثات محلية، ولا يطلب التطبيق صلاحية الإنترنت. البحث والتلخيص اقتباسيان، ولا يتعامل المحرك مع كل أنواع الأسئلة.</p></section>';
    openModal(modalShell('الإعدادات والتحكم', 'اضبط القيود المناسبة لك.', content, '<button class="button-secondary" id="cancel-settings">إلغاء</button><button class="button-primary" id="save-settings">حفظ الإعدادات</button>'), 'settings');
    $('max-sentences').value = String(s.maxSentences || 3);
    $('cancel-settings').onclick = closeModal;
    $('save-settings').onclick = function () {
      state.settings = {mode: $('strict-mode').checked ? 'strict' : 'flexible', allowMath: $('allow-math').checked, maxSentences: Number($('max-sentences').value), ocrEnabled: $('ocr-enabled').checked};
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
      activeSession().documents.push({id: uid(), name: name, type: 'text', pages: [{page: 1, text: text}], totalPages: 1});
      if (!saveState()) { activeSession().documents.pop(); return; }
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
  async function extractFile(file) {
    if (file.size > MAX_FILE_BYTES) throw new Error('حجم الملف يتجاوز ٦٠ ميغابايت.');
    var lower = file.name.toLowerCase(), pdf = lower.endsWith('.pdf') || file.type === 'application/pdf';
    var textFile = /\.(txt|md|markdown)$/.test(lower) || /^text\//.test(file.type);
    if (!pdf && !textFile) throw new Error('الملف غير مدعوم؛ اختر PDF أو TXT أو Markdown.');
    var buffer = await new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(reader.result); }; reader.onerror = function () { reject(new Error('تعذّر قراءة الملف.')); }; reader.readAsArrayBuffer(file); });
    if (!pdf) {
      var text = readTextFile(buffer).trim();
      if (!text) throw new Error('الملف النصي فارغ.');
      if (text.length > MAX_TEXT_CHARS) throw new Error('النص يتجاوز الحد الأقصى (٣ ملايين حرف).');
      return {doc: {id: uid(), name: file.name, type: 'text', pages: [{page: 1, text: text}], totalPages: 1}, warning: ''};
    }
    if (!window.pdfjsLib) throw new Error('تعذّر تشغيل قارئ PDF المحلي.');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    var loading = window.pdfjsLib.getDocument({data: new Uint8Array(buffer), cMapUrl: 'vendor/cmaps/', cMapPacked: true, standardFontDataUrl: 'vendor/standard_fonts/', isEvalSupported: false, useSystemFonts: true});
    var pdfDoc;
    try { pdfDoc = await loading.promise; } catch (e) {
      if (e && (e.name === 'PasswordException' || /password/i.test(e.message || ''))) throw new Error('الملف محمي بكلمة مرور؛ أزل الحماية ثم أعد إضافته.');
      throw new Error('تعذّرت قراءة PDF. تأكد أن الملف سليم وغير محمي.');
    }
    var totalPages = pdfDoc.numPages;
    var pages = [], count = Math.min(totalPages, MAX_PAGES), totalChars = 0;
    var empty = 0, truncated = false, ocrCount = 0, skipped = 0, ocrFailed = 0, uncertain = 0, limited = 0;
    try {
      for (var i = 1; i <= count; i++) {
        if (cancelProcessing) throw new Error('أُوقفت القراءة؛ لم يُحفظ الملف الحالي.');
        $('typing-text').textContent = 'أقرأ الصفحة ' + fmt(i) + ' من ' + fmt(count);
        var page = await pdfDoc.getPage(i), pageData;
        try {
          var tc = await page.getTextContent({disableCombineTextItems: false});
          var pageText = E.extractPdfText(tc.items), imagePage = !pageText.trim();
          // Some scans contain only a page number or watermark in a text layer.
          // In that case, attempt OCR if the page also paints an image.
          if (!imagePage && pageText.trim().length < 30 && page.getOperatorList) {
            var ops = await page.getOperatorList(), imageOps = [window.pdfjsLib.OPS.paintImageXObject,
              window.pdfjsLib.OPS.paintInlineImageXObject, window.pdfjsLib.OPS.paintJpegXObject].filter(function (v) { return v != null; });
            imagePage = ops.fnArray.some(function (fn) { return imageOps.indexOf(fn) !== -1; });
          }
          pageData = {page: i, text: pageText};
          if (imagePage && state.settings.ocrEnabled !== false && ocrCount < MAX_OCR_PAGES) {
            ocrCount++;
            $('typing-text').textContent = 'أحاول قراءة صورة الصفحة ' + fmt(i) + ' من ' + fmt(count);
            var base = page.getViewport({scale: 1});
            var scale = Math.min(2, Math.sqrt(4000000 / (base.width * base.height)), 2200 / Math.max(base.width, base.height));
            var viewport = page.getViewport({scale: scale});
            var canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height));
            var context = canvas.getContext('2d', {willReadFrequently: true, alpha: false});
            context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({canvasContext: context, viewport: viewport, background: '#fff'}).promise;
            if (cancelProcessing) throw new Error('أُوقفت القراءة؛ لم يُحفظ الملف الحالي.');
            // Keep a reduced image so the user can compare and correct OCR locally.
            var preview = document.createElement('canvas'), ratio = Math.min(1, 1400 / Math.max(canvas.width, canvas.height));
            preview.width = Math.max(1, Math.round(canvas.width * ratio)); preview.height = Math.max(1, Math.round(canvas.height * ratio));
            var pctx = preview.getContext('2d', {alpha: false}); pctx.fillStyle = '#fff'; pctx.fillRect(0, 0, preview.width, preview.height);
            pctx.drawImage(canvas, 0, 0, preview.width, preview.height);
            pageData.preview = preview.toDataURL('image/jpeg', 0.68);
            if (pageData.preview.length >= 1500000) {
              preview.width = Math.max(1, Math.round(canvas.width * Math.min(1, 900 / Math.max(canvas.width, canvas.height))));
              preview.height = Math.max(1, Math.round(canvas.height * Math.min(1, 900 / Math.max(canvas.width, canvas.height))));
              pctx = preview.getContext('2d', {alpha: false}); pctx.fillStyle = '#fff'; pctx.fillRect(0, 0, preview.width, preview.height);
              pctx.drawImage(canvas, 0, 0, preview.width, preview.height); pageData.preview = preview.toDataURL('image/jpeg', 0.55);
            }
            pageData.ocr = true;
            try {
              var found = await OCR.recognize(canvas, {
                shouldStop: function () { return cancelProcessing; },
                onProgress: function (line, lines) { $('typing-text').textContent = 'أقرأ صورة الصفحة ' + fmt(i) + ' · سطر ' + fmt(line) + ' من ' + fmt(lines); }
              });
              if (cancelProcessing) throw new Error('أُوقفت القراءة؛ لم يُحفظ الملف الحالي.');
              if (found.text) pageData.text = (pageText ? pageText + '\n' : '') + found.text;
              uncertain += found.uncertain; if (found.truncated) limited++;
            } catch (err) {
              if (cancelProcessing) throw err;
              ocrFailed++;
            } finally { canvas.width = canvas.height = preview.width = preview.height = 1; }
          } else if (imagePage && state.settings.ocrEnabled !== false) skipped++;
          if (totalChars + pageData.text.length > MAX_TEXT_CHARS) { truncated = true; break; }
          if (!pageData.text || !pageData.text.replace(/[□\s]/g, '')) empty++;
          pages.push(pageData); totalChars += pageData.text.length;
        } finally { if (page.cleanup) page.cleanup(); }
      }
    } finally { if (pdfDoc.destroy) await pdfDoc.destroy(); }
    if (cancelProcessing) throw new Error('أُوقفت القراءة؛ لم يُحفظ الملف الحالي.');
    if (!totalChars && !ocrCount) throw new Error('لم أجد نصًا في الملف. إن كانت الصفحات صورًا، فعّل قراءة الصور في الإعدادات ثم أعد المحاولة.');
    var warnings = [];
    if (ocrCount) warnings.push('حاولت قراءة ' + fmt(ocrCount) + ' صفحة مصوّرة. النتائج تجريبية وقد تحتوي أخطاء حتى في الكلمات الظاهرة؛ افتح المصدر وقارن الصورة وصحح النص.');
    if (uncertain) warnings.push('الرمز □ يمثل كلمات لم تُعرف بثقة (' + fmt(uncertain) + ').');
    if (empty) warnings.push(fmt(empty) + ' صفحة بلا نص معروف؛ يمكنك تصحيح النص يدويًا.');
    if (ocrFailed) warnings.push('تعذّرت القراءة الآلية في ' + fmt(ocrFailed) + ' صفحة؛ ما زالت صورة الصفحة متاحة للتصحيح.');
    if (limited) warnings.push('توقف القارئ بعد ٣٥٠ كلمة في ' + fmt(limited) + ' صفحة.');
    if (skipped) warnings.push('لم تُقرأ ' + fmt(skipped) + ' صفحة مصوّرة بسبب حد ١٥ صفحة لكل ملف.');
    if (totalPages > MAX_PAGES || truncated) warnings.push('استُخرجت أول ' + fmt(pages.length) + ' صفحة فقط بسبب حد الحجم.');
    return {doc: {id: uid(), name: file.name, type: 'pdf', pages: pages, totalPages: totalPages}, warning: warnings.join(' ')};
  }
  async function importFiles(fileList) {
    if (!fileList || !fileList.length || isBusy()) return;
    processing = true; cancelProcessing = false; renderAll(); scrollBottom();
    var session = activeSession(), added = 0, notices = [];
    for (var i = 0; i < fileList.length; i++) {
      try {
        var result = await extractFile(fileList[i]);
        session.documents.push(result.doc);
        if (!saveState()) { session.documents.pop(); notices.push(fileList[i].name + ': تعذّر حفظ المصدر.'); continue; }
        added++;
        if (result.warning) notices.push(fileList[i].name + ': ' + result.warning);
      } catch (err) { notices.push(fileList[i].name + ': ' + (err && err.message ? err.message : 'تعذّرت قراءة الملف.')); }
      if (cancelProcessing) break;
    }
    processing = false; renderAll();
    if (notices.length) openModal(modalShell('نتيجة إضافة المصادر', added ? 'تمت إضافة ' + fmt(added) + ' من الملفات.' : 'لم تتم إضافة أي ملف.', '<p class="excerpt-note" style="white-space:pre-wrap">' + esc(notices.join('\n\n')) + '</p>', '<button class="button-primary" id="import-ok">حسنًا</button>'), 'import');
    else if (added) toast('أُضيفت المصادر إلى دفترك.');
    if ($('import-ok')) $('import-ok').onclick = closeModal;
  }

  function sendQuestion(raw) {
    var question = String(raw == null ? $('question').value : raw).trim();
    if (!question || isBusy()) return;
    if (question.length > 3000) { toast('السؤال طويل جدًا؛ اختصره ثم أعد المحاولة.'); return; }
    var session = activeSession();
    var prior = session.messages.slice().reverse().find(function (m) { return m.role === 'user'; });
    session.messages.push({id: uid(), role: 'user', text: question});
    if (session.title === 'دفتر جديد') session.title = E.shorten(question.replace(/\s+/g, ' '), 29);
    $('question').value = ''; $('question').style.height = '';
    try {
      var reply = A.answer({question: question, documents: session.documents, priorQuestion: prior && prior.text,
        mode: state.settings.mode, allowMath: state.settings.allowMath, maxSentences: state.settings.maxSentences});
      session.messages.push({id: uid(), role: 'assistant', text: reply.text, origin: reply.origin, references: reply.references});
    } catch (_) {
      session.messages.push({id: uid(), role: 'assistant', text: 'تعذّر تحليل هذا السؤال محليًا. جرّب صياغة أبسط.', origin: 'error', references: []});
    }
    saveState(); renderAll(); scrollBottom();
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
        state.sessions = state.sessions.filter(function (s) { return s.id !== session.id; });
        if (!state.sessions.length) state.sessions.push(newSession());
        state.activeId = state.sessions[0].id; saveState(); renderAll(); toast('تم حذف الدفتر.');
      }, true);
    };
  }

  function init() {
    state = loadState();
    // A killed process cannot resume a native generation. Do not leave a fake streaming message.
    state.sessions.forEach(function (s) { s.messages.forEach(function (m) { if (m.streaming) { m.streaming = false; m.origin = 'error'; m.references = []; m.text = m.text ? m.text + '\n\n[انقطع التوليد]' : 'انقطع التوليد قبل اكتماله. حاول مجددًا.'; } }); });
    renderAll();
    $('menu-btn').onclick = function () { openDrawer('rail'); }; $('close-rail').onclick = closeDrawers;
    $('mobile-sources').onclick = function () { openDrawer('sources-panel'); }; $('close-sources').onclick = closeDrawers; $('drawer-backdrop').onclick = closeDrawers;
    $('settings-btn').onclick = openSettings; $('top-settings').onclick = openSettings; $('mode-shortcut').onclick = openSettings;
    $('new-session').onclick = function () { if (isBusy()) return; var s = newSession(); state.sessions.unshift(s); state.activeId = s.id; saveState(); closeDrawers(); renderAll(); };
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
