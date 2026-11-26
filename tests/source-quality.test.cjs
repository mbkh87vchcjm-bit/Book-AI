'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Quality = require('../app/src/main/assets/web/source-quality.js');

test('OCR text merge avoids repeating exact text already extracted from the PDF text layer', () => {
  const result = Quality.mergeTextLayers(
    'DNS resolves domain names to IP addresses.\nThe first paragraph.',
    'DNS resolves domain names to IP addresses.\nA new OCR paragraph.'
  );
  assert.equal(result, 'DNS resolves domain names to IP addresses.\nThe first paragraph.\nA new OCR paragraph.');
});

test('low dictionary acceptance OCR pages are not treated as reliable until manually edited', () => {
  const page = {text: 'some noisy OCR text', ocr: true, ocrStats: {recognitionRate: 0.42}};
  assert.equal(Quality.isLowConfidenceOcrPage(page), true);
  assert.equal(Quality.isUsablePage(page), false);
  page.edited = true;
  assert.equal(Quality.isLowConfidenceOcrPage(page), false);
  assert.equal(Quality.isUsablePage(page), true);
});

test('old OCR pages without quality statistics remain available but can be marked for review in the UI', () => {
  const page = {text: 'legacy OCR', ocr: true};
  assert.equal(Quality.isLowConfidenceOcrPage(page), false);
  assert.equal(Quality.isUsablePage(page), true);
});

test('source coverage reports incomplete extraction and page quality without confusing pages with documents', () => {
  const summary = Quality.summarizeDocuments([
    {name:'Scan.pdf',type:'pdf',totalPages:4,extraction:{skippedOcrPages:1},pages:[
      {page:1,text:'Typed text',extractionMethod:'text-layer'},
      {page:2,text:'OCR text',ocr:true,ocrStats:{recognitionRate:0.9}},
      {page:3,text:'Weak OCR',ocr:true,ocrStats:{recognitionRate:0.2},previewOmitted:true},
      {page:4,text:'',ocrSkipped:true}
    ]},
    {name:'notes.txt',type:'text',totalPages:1,pages:[{page:1,text:'Notes'}]}
  ]);
  assert.equal(summary.documents,2);
  assert.equal(summary.totalPages,5);
  assert.equal(summary.storedPages,5);
  assert.equal(summary.searchablePages,3);
  assert.equal(summary.ocrPages,2);
  assert.equal(summary.lowConfidenceOcrPages,1);
  assert.equal(summary.previewOmittedPages,1);
  assert.equal(summary.indexedCoverage,0.6);
  assert.ok(summary.totalCharacters > 0);
});


test('weak OCR keeps the original PDF text layer as a safe fallback', () => {
  const page = {
    text: 'DNS names domains to IP □ addresses.\nNoisy OCR words.',
    textLayerText: 'DNS translates domain names into IP addresses.',
    ocr: true,
    extractionMethod: 'text-layer+ocr',
    ocrStats: {recognitionRate:0.31}
  };
  assert.equal(Quality.isLowConfidenceOcrPage(page),true);
  assert.equal(Quality.searchableText(page),'DNS translates domain names into IP addresses.');
  assert.equal(Quality.isUsablePage(page),true);
  const noLayer = {...page,textLayerText:''};
  assert.equal(Quality.searchableText(noLayer),'');
  assert.equal(Quality.isUsablePage(noLayer),false);
});
