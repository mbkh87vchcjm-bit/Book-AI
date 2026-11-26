'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MidadSourceQuality = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LOW_OCR_ACCEPTANCE_RATE = 0.55;

  function normalizeLine(value) {
    return String(value || '').normalize('NFKC').toLowerCase()
      .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  }

  function mergeTextLayers(textLayer, ocrLayer) {
    const primary = String(textLayer || '').replace(/\r/g, '');
    const secondary = String(ocrLayer || '').replace(/\r/g, '');
    if (!secondary.trim()) return primary.trim();
    if (!primary.trim()) return secondary.trim();

    const known = new Set(primary.split('\n').map(normalizeLine).filter(Boolean));
    const additions = [];
    secondary.split('\n').forEach((line) => {
      const clean = String(line || '').trim();
      const key = normalizeLine(clean);
      if (!key || known.has(key)) return;
      known.add(key);
      additions.push(clean);
    });
    return [primary.trim(), additions.join('\n')].filter(Boolean).join('\n');
  }

  function isLowConfidenceOcrPage(page) {
    if (!page || page.ocr !== true || page.edited === true) return false;
    const stats = page.ocrStats;
    if (!stats || !Number.isFinite(Number(stats.recognitionRate))) return false;
    return Number(stats.recognitionRate) < LOW_OCR_ACCEPTANCE_RATE;
  }

  function searchableText(page) {
    if (!page) return '';
    if (isLowConfidenceOcrPage(page)) return String(page.textLayerText || '').trim();
    return String(page.text || '').trim();
  }

  function containsUncertainOcrMarker(text) {
    return /□/.test(String(text || ''));
  }

  function isUsablePage(page) {
    return !!searchableText(page);
  }

  function summarizeDocuments(documents) {
    const docs = Array.isArray(documents) ? documents : [];
    const result = {
      documents: docs.length,
      totalPages: 0,
      storedPages: 0,
      searchablePages: 0,
      textLayerPages: 0,
      ocrPages: 0,
      editedPages: 0,
      skippedOcrPages: 0,
      previewOmittedPages: 0,
      lowConfidenceOcrPages: 0,
      emptyPages: 0,
      totalCharacters: 0,
      indexedCoverage: 0
    };
    docs.forEach((doc) => {
      const pages = Array.isArray(doc && doc.pages) ? doc.pages : [];
      result.totalPages += Math.max(pages.length, Number(doc && doc.totalPages) || 0);
      let countedSkippedPages = 0;
      pages.forEach((page) => {
        result.storedPages++;
        const rawText = String(page && page.text || '');
        const text = searchableText(page);
        result.totalCharacters += text.length;
        if (rawText.trim()) {
          if ((page.extractionMethod && String(page.extractionMethod).indexOf('text-layer') === 0) ||
              (!page.ocr && page.extractionMethod !== 'image-ocr')) result.textLayerPages++;
        } else if (!rawText.trim()) {
          result.emptyPages++;
        }
        if (page && page.ocr) result.ocrPages++;
        if (page && page.edited) result.editedPages++;
        if (page && page.ocrSkipped) { result.skippedOcrPages++; countedSkippedPages++; }
        if (page && page.previewOmitted) result.previewOmittedPages++;
        if (isLowConfidenceOcrPage(page)) result.lowConfidenceOcrPages++;
        if (isUsablePage(page)) result.searchablePages++;
      });
      if (doc && doc.extraction && Number.isFinite(Number(doc.extraction.skippedOcrPages))) {
        result.skippedOcrPages += Math.max(0, Number(doc.extraction.skippedOcrPages) - countedSkippedPages);
      }
    });
    result.indexedCoverage = result.totalPages
      ? Math.min(1, result.searchablePages / result.totalPages) : 0;
    return result;
  }

  return {
    LOW_OCR_ACCEPTANCE_RATE,
    normalizeLine,
    mergeTextLayers,
    isLowConfidenceOcrPage,
    searchableText,
    containsUncertainOcrMarker,
    isUsablePage,
    summarizeDocuments
  };
}));
