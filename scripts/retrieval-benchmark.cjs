'use strict';

const Engine = require('../app/src/main/assets/web/engine.js');
const benchmark = require('../tests/fixtures/retrieval-benchmark.cjs');

function pageKey(reference) {
  return String(reference.docId || reference.docName) + ':' + String(reference.page);
}

function rankingMetrics(rankedKeys, relevantKeys, k) {
  const cutoff = Math.max(1, Number(k) || 5);
  const relevant = new Set(relevantKeys || []);
  if (!relevant.size) throw new Error('Each benchmark case must define at least one relevant page.');

  const uniqueRanked = [];
  const seen = new Set();
  (rankedKeys || []).forEach(key => {
    if (!seen.has(key)) { seen.add(key); uniqueRanked.push(key); }
  });
  const top = uniqueRanked.slice(0, cutoff);
  let hits = 0, firstRelevantRank = 0, dcg = 0;
  top.forEach((key, index) => {
    if (relevant.has(key)) {
      hits++;
      if (!firstRelevantRank) firstRelevantRank = index + 1;
      dcg += 1 / Math.log2(index + 2);
    }
  });
  let idealDcg = 0;
  for (let i = 0; i < Math.min(relevant.size, cutoff); i++) {
    idealDcg += 1 / Math.log2(i + 2);
  }

  return {
    hitAtK: hits > 0 ? 1 : 0,
    recallAtK: hits / relevant.size,
    precisionAtK: hits / cutoff,
    reciprocalRankAtK: firstRelevantRank ? 1 / firstRelevantRank : 0,
    ndcgAtK: idealDcg ? dcg / idealDcg : 0,
    relevantFound: hits,
    relevantTotal: relevant.size,
    firstRelevantRank: firstRelevantRank || null
  };
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function runBenchmark(options) {
  const config = options || {};
  const k = Math.max(1, Number(config.k) || benchmark.k || 5);
  const cases = benchmark.cases.map(testCase => {
    const result = Engine.search(benchmark.documents, testCase.query, k);
    const rankedKeys = result.references.map(pageKey);
    const metrics = rankingMetrics(rankedKeys, testCase.relevant, k);
    return {
      id: testCase.id,
      language: testCase.language,
      query: testCase.query,
      expected: testCase.relevant.slice(),
      ranked: rankedKeys,
      metrics,
      topPage: rankedKeys[0] || null,
      retrievalStats: result.retrievalStats || null
    };
  });

  const aggregate = {
    hitRateAtK: mean(cases.map(item => item.metrics.hitAtK)),
    recallAtK: mean(cases.map(item => item.metrics.recallAtK)),
    precisionAtK: mean(cases.map(item => item.metrics.precisionAtK)),
    mrrAtK: mean(cases.map(item => item.metrics.reciprocalRankAtK)),
    ndcgAtK: mean(cases.map(item => item.metrics.ndcgAtK))
  };

  // Conservative initial quality gates: these measure ranking only on this
  // fixed gold set and are not claims about arbitrary user documents.
  const thresholds = {recallAtK: 0.80, mrrAtK: 0.70, ndcgAtK: 0.72};
  const failures = Object.keys(thresholds).filter(key => aggregate[key] < thresholds[key]);
  return {
    name: 'Midad offline bilingual retrieval benchmark',
    k,
    caseCount: cases.length,
    thresholds,
    aggregate,
    passed: failures.length === 0,
    failures,
    cases
  };
}

function formatReport(report) {
  const lines = [
    report.name + ' (K=' + report.k + ')',
    'Cases: ' + report.caseCount,
    '',
    'ID'.padEnd(24) + 'MRR'.padEnd(9) + 'Recall'.padEnd(9) + 'nDCG'.padEnd(9) + 'Top result'
  ];
  report.cases.forEach(item => {
    lines.push(
      item.id.padEnd(24) +
      item.metrics.reciprocalRankAtK.toFixed(3).padEnd(9) +
      item.metrics.recallAtK.toFixed(3).padEnd(9) +
      item.metrics.ndcgAtK.toFixed(3).padEnd(9) +
      (item.topPage || '—')
    );
  });
  lines.push(
    '',
    'Mean: Recall@' + report.k + ' ' + report.aggregate.recallAtK.toFixed(3) +
    ' | MRR@' + report.k + ' ' + report.aggregate.mrrAtK.toFixed(3) +
    ' | nDCG@' + report.k + ' ' + report.aggregate.ndcgAtK.toFixed(3)
  );
  lines.push(report.passed ? 'Quality gates: PASS' : 'Quality gates: FAIL (' + report.failures.join(', ') + ')');
  return lines.join('\n');
}

if (require.main === module) {
  const report = runBenchmark();
  if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else process.stdout.write(formatReport(report) + '\n');
  if (!report.passed) process.exitCode = 1;
}

module.exports = {pageKey, rankingMetrics, runBenchmark, formatReport};
