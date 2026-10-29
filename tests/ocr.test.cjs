'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const OCR = require('../app/src/main/assets/web/ocr.js');

const web = path.resolve(__dirname, '../app/src/main/assets/web');
const words = JSON.parse(fs.readFileSync(path.join(web, 'ocr/vocabulary.json'), 'utf8'));
const buffer = fs.readFileSync(path.join(web, 'ocr/templates.bin'));
const exactBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

test('OCR template table is complete, bounded and points to the local dictionary', () => {
  const table = OCR.decodeTable(exactBuffer, words);
  assert.equal(table.view.getUint32(8, true), 200000);
  assert.equal(words.arabic.length, 25000);
  assert.equal(words.english.length, 15000);
  const bucketCount = table.buckets.reduce((sum, list) => sum + list.length, 0);
  assert.ok(bucketCount > 150000);
  for (const offset of table.buckets.flat().filter((_, i) => i % 1301 === 0)) {
    assert.ok((table.view.getUint32(offset, true) & 0x7fffffff) < words.arabic.length + words.english.length);
  }
});

test('corrupt or truncated template data is rejected', () => {
  assert.throws(() => OCR.decodeTable(new ArrayBuffer(8), words));
  assert.throws(() => OCR.decodeTable(exactBuffer.slice(0, 512), words));
  assert.throws(() => OCR.decodeTable(exactBuffer, {arabic: null}));
});

test('a blank page yields no OCR lines rather than fabricated text', () => {
  const width = 200, height = 100;
  const image = {width, height, data: new Uint8ClampedArray(width * height * 4).fill(255)};
  const mask = OCR.binarize(image);
  assert.equal(mask.reduce((n, v) => n + v, 0), 0);
  assert.deepEqual(OCR.layout(mask, width, height), []);
});
