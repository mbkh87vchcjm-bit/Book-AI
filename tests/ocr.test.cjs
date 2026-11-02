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


function makeTinyScoreTable(entries, vocabulary) {
  const record = 70, buffer = new ArrayBuffer(16 + entries.length * record);
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  'MIDADOC1'.split('').forEach((ch,i)=>{ bytes[i]=ch.charCodeAt(0); });
  view.setUint32(8, entries.length, true);
  view.setUint16(12, record, true);
  bytes[14] = 32; bytes[15] = 16;
  const buckets = Array.from({length:96},()=>[]);
  entries.forEach((entry,index)=>{
    const offset=16+index*record;
    view.setUint32(offset,entry.id,true);
    view.setUint16(offset+4,512,true); // aspect ratio = 1
    bytes.set(entry.bits,offset+6);
    buckets[40].push(offset);
  });
  return {bytes,view,buckets,vocabulary};
}

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

test('adaptive word-gap estimation separates a clear word gap from glyph gaps', () => {
  const gaps = [
    {start:0,end:2},
    {start:4,end:6},
    {start:9,end:11},
    {start:15,end:17},
    {start:39,end:41}
  ];
  const threshold = OCR.estimateWordGap(gaps, 12);
  assert.ok(threshold > 3 && threshold < 24);
  assert.ok(2 < threshold);
  assert.ok(23 >= threshold);
});

test('logical reading order preserves Arabic runs and embedded Latin runs', () => {
  const visual = [
    {text:'الأجهزة',rtl:true},
    {text:'تربط',rtl:true},
    {text:'TCP',rtl:false},
    {text:'الشبكة',rtl:true}
  ];
  assert.deepEqual(OCR.logicalWordOrder(visual).map(x=>x.text),
    ['الشبكة','TCP','تربط','الأجهزة']);
});

test('logical reading order keeps English left-to-right and reverses pure Arabic visual order', () => {
  assert.deepEqual(OCR.logicalWordOrder([
    {text:'Offline',rtl:false},{text:'Assistant',rtl:false}
  ]).map(x=>x.text), ['Offline','Assistant']);
  assert.deepEqual(OCR.logicalWordOrder([
    {text:'الأجهزة',rtl:true},{text:'ربط',rtl:true},{text:'الشبكة',rtl:true}
  ]).map(x=>x.text), ['الشبكة','ربط','الأجهزة']);
});

test('unknown OCR tokens remain in the surrounding directional run', () => {
  const ordered = OCR.logicalWordOrder([
    {text:'الأجهزة',rtl:true},{text:'□',rtl:null,uncertain:true},{text:'الشبكة',rtl:true}
  ]);
  assert.deepEqual(ordered.map(x=>x.text), ['الشبكة','□','الأجهزة']);
});

test('layout splits a large inter-word gap while joining narrow glyph gaps', () => {
  const width = 100, height = 30, mask = new Uint8Array(width * height);
  for (let y = 10; y < 20; y++) {
    [[10,13],[16,19],[22,25],[52,55]].forEach(function (range) {
      for (let x = range[0]; x <= range[1]; x++) mask[y * width + x] = 1;
    });
  }
  const lines = OCR.layout(mask, width, height);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].length, 2);
});

test('OCR marks close competing dictionary matches as uncertain', () => {
  const exact = new Uint8Array(64);
  const near = new Uint8Array(64); near[0] = 1;
  const table = makeTinyScoreTable([
    {id:0,bits:exact},{id:1,bits:near}
  ], {arabic:[],english:['router','routed']});
  const result = OCR.scoreFeature(table,new Uint8Array(64),1);
  assert.equal(result.uncertain,true);
  assert.equal(result.text,'□');
  assert.ok(result.margin < 0.006);
});

test('OCR accepts a clear template match when the runner-up is sufficiently distant', () => {
  const exact = new Uint8Array(64);
  const distant = new Uint8Array(64);
  for(let i=0;i<20;i++) distant[i]=255;
  const table = makeTinyScoreTable([
    {id:0,bits:exact},{id:1,bits:distant}
  ], {arabic:[],english:['router','database']});
  const result = OCR.scoreFeature(table,new Uint8Array(64),1);
  assert.equal(result.uncertain,false);
  assert.equal(result.text,'router');
  assert.ok(result.margin >= 0.006);
});
