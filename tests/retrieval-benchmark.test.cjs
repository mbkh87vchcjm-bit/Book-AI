'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {rankingMetrics, runBenchmark} = require('../scripts/retrieval-benchmark.cjs');

test('ranking metrics compute recall, precision, reciprocal rank and nDCG', () => {
  const result = rankingMetrics(['doc:3', 'doc:1', 'doc:2'], ['doc:1', 'doc:2'], 3);
  assert.equal(result.hitAtK, 1);
  assert.equal(result.relevantFound, 2);
  assert.equal(result.recallAtK, 1);
  assert.equal(result.precisionAtK, 2 / 3);
  assert.equal(result.reciprocalRankAtK, 0.5);
  assert.ok(result.ndcgAtK > 0.79 && result.ndcgAtK < 0.81);
});

test('ranking metrics handle no relevant hit without fabricating a score', () => {
  const result = rankingMetrics(['doc:3', 'doc:4'], ['doc:1'], 5);
  assert.equal(result.hitAtK, 0);
  assert.equal(result.recallAtK, 0);
  assert.equal(result.reciprocalRankAtK, 0);
  assert.equal(result.ndcgAtK, 0);
});

test('benchmark dataset is deterministic and meets the initial retrieval quality gates', () => {
  const first = runBenchmark();
  const second = runBenchmark();
  assert.equal(first.caseCount, 12);
  assert.deepEqual(first.cases.map(item => item.ranked), second.cases.map(item => item.ranked));
  assert.ok(first.aggregate.recallAtK >= first.thresholds.recallAtK,
    'Recall@K below threshold: ' + first.aggregate.recallAtK.toFixed(3));
  assert.ok(first.aggregate.mrrAtK >= first.thresholds.mrrAtK,
    'MRR@K below threshold: ' + first.aggregate.mrrAtK.toFixed(3));
  assert.ok(first.aggregate.ndcgAtK >= first.thresholds.ndcgAtK,
    'nDCG@K below threshold: ' + first.aggregate.ndcgAtK.toFixed(3));
  assert.ok(first.cases.every(item => item.metrics.hitAtK === 1),
    'At least one benchmark question did not retrieve any expected source page.');
});

test('every benchmark result retains source page identifiers', () => {
  const report = runBenchmark();
  report.cases.forEach(item => {
    assert.ok(item.ranked.every(key => /^network-course:\d+$/.test(key)));
    assert.ok(item.expected.length > 0);
  });
});
