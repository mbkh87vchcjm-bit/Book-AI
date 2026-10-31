/* Midad Neural Semantic Reranker
 * A small Skip-gram + Negative Sampling network trained from scratch on the
 * user's imported documents. No downloaded weights, pretrained embeddings,
 * remote calls, or external model files are used.
 *
 * This model is a corpus-specific retrieval aid, not a text generator or LLM.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.MidadNeural = factory(root.MidadEngine);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  var VERSION = 1;
  var DEFAULTS = {dimension: 24, window: 2, negatives: 2, epochs: 1,
    maxVocabulary: 1600, maxTokens: 24000, minCount: 2, maxChars: 360000};

  function tokenize(text) {
    return E && E.baseWords ? E.baseWords(String(text || '')) :
      (String(text || '').toLowerCase().match(/[a-z0-9]+|[\u0600-\u06ff]+/g) || []);
  }

  function hashText(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    var state = seed || 1;
    return function () {
      state += 0x6D2B79F5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function sigmoid(x) {
    if (x > 8) return 0.9996646499;
    if (x < -8) return 0.0003353501;
    return 1 / (1 + Math.exp(-x));
  }
  function dot(a, b, ao, bo, dim) {
    var value = 0;
    for (var i = 0; i < dim; i++) value += a[ao + i] * b[bo + i];
    return value;
  }
  function normalizeVector(vector) {
    var norm = 0;
    for (var i = 0; i < vector.length; i++) norm += vector[i] * vector[i];
    norm = Math.sqrt(norm);
    if (norm > 1e-8) for (var j = 0; j < vector.length; j++) vector[j] /= norm;
    return vector;
  }

  function createModel(vocabulary, vectors, dimension, metadata) {
    var index = new Map();
    vocabulary.forEach(function (word, i) { index.set(word, i); });
    function embed(text) {
      var tokens = tokenize(text), output = new Float32Array(dimension), found = 0;
      tokens.forEach(function (token) {
        var id = index.get(token);
        if (id === undefined) return;
        var offset = id * dimension;
        for (var d = 0; d < dimension; d++) output[d] += vectors[offset + d];
        found++;
      });
      if (!found) return null;
      for (var k = 0; k < dimension; k++) output[k] /= found;
      return normalizeVector(output);
    }
    function similarity(left, right) {
      var a = embed(left), b = embed(right);
      if (!a || !b) return 0;
      var score = dot(a, b, 0, 0, dimension);
      return Math.max(0, Math.min(1, score));
    }
    return {
      version: VERSION,
      algorithm: 'skip-gram-negative-sampling-from-scratch',
      dimension: dimension,
      vocabularySize: vocabulary.length,
      trainedTokens: metadata && metadata.trainedTokens || 0,
      trainedPairs: metadata && metadata.trainedPairs || 0,
      similarity: similarity,
      embed: embed,
      exportData: function () {
        var packed = new Array(vectors.length);
        for (var i = 0; i < vectors.length; i++) packed[i] = Math.max(-127, Math.min(127, Math.round(vectors[i] * 127)));
        return {version: VERSION, algorithm: 'skip-gram-negative-sampling-from-scratch',
          dimension: dimension, vocabulary: vocabulary.slice(), vectors: packed,
          trainedTokens: metadata && metadata.trainedTokens || 0,
          trainedPairs: metadata && metadata.trainedPairs || 0};
      }
    };
  }

  async function train(documents, options) {
    options = Object.assign({}, DEFAULTS, options || {});
    var sequences = [], totalChars = 0, totalTokens = 0, seedParts = [];
    (Array.isArray(documents) ? documents : []).forEach(function (doc) {
      (doc && Array.isArray(doc.pages) ? doc.pages : []).forEach(function (page) {
        if (totalChars >= options.maxChars) return;
        var text = String(page && page.text || '');
        if (!text) return;
        var remaining = options.maxChars - totalChars;
        if (text.length > remaining) text = text.slice(0, remaining);
        totalChars += text.length;
        var tokens = tokenize(text);
        if (!tokens.length) return;
        if (totalTokens + tokens.length > options.maxTokens) tokens = tokens.slice(0, options.maxTokens - totalTokens);
        if (tokens.length < 2) return;
        sequences.push(tokens);
        totalTokens += tokens.length;
        seedParts.push(String(doc.id || '') + ':' + String(page.page || '') + ':' + text.slice(0, 120));
      });
    });
    if (totalTokens < 80) return null;

    var counts = Object.create(null);
    sequences.forEach(function (seq) { seq.forEach(function (token) { counts[token] = (counts[token] || 0) + 1; }); });
    var vocabulary = Object.keys(counts).filter(function (word) { return counts[word] >= options.minCount; });
    vocabulary.sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); });
    vocabulary = vocabulary.slice(0, options.maxVocabulary);
    // Small but usable notebooks may have fewer than 12 repeated words.
    // Only in that case, admit single-occurrence terms to reach the minimum
    // vocabulary size; the hard token threshold above still rejects tiny files.
    if (vocabulary.length < 12) {
      vocabulary = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); })
        .slice(0, options.maxVocabulary);
    }
    if (vocabulary.length < 12) return null;

    var wordIndex = new Map();
    vocabulary.forEach(function (word, i) { wordIndex.set(word, i); });
    var indexed = sequences.map(function (seq) {
      return seq.map(function (word) { return wordIndex.has(word) ? wordIndex.get(word) : -1; })
        .filter(function (id) { return id >= 0; });
    }).filter(function (seq) { return seq.length >= 2; });
    var tokenCount = indexed.reduce(function (sum, seq) { return sum + seq.length; }, 0);
    if (tokenCount < 60) return null;

    var frequencies = vocabulary.map(function (word) { return Math.pow(counts[word], 0.75); });
    var totalFrequency = frequencies.reduce(function (a, b) { return a + b; }, 0);
    var cumulative = [], running = 0;
    frequencies.forEach(function (value) { running += value / totalFrequency; cumulative.push(running); });
    function sampleNegative(random, positive) {
      var value = random(), low = 0, high = cumulative.length - 1;
      while (low < high) { var mid = (low + high) >>> 1; if (value <= cumulative[mid]) high = mid; else low = mid + 1; }
      return low === positive ? (low + 1) % cumulative.length : low;
    }

    var dim = Math.max(8, Math.min(48, Number(options.dimension) || DEFAULTS.dimension));
    var random = rng(hashText(seedParts.join('|')));
    var input = new Float32Array(vocabulary.length * dim);
    var output = new Float32Array(vocabulary.length * dim);
    for (var i = 0; i < input.length; i++) input[i] = (random() - 0.5) / dim;
    for (var j = 0; j < output.length; j++) output[j] = (random() - 0.5) / dim;
    var pairsPerEpoch = indexed.reduce(function (sum, seq) {
      return sum + seq.length * Math.min(options.window * 2, Math.max(1, seq.length - 1));
    }, 0);
    var expectedPairs = Math.max(1, pairsPerEpoch * options.epochs);
    var trainedPairs = 0, processedCenters = 0;
    var negatives = Math.max(1, Math.min(5, Number(options.negatives) || 2));
    var windowSize = Math.max(1, Math.min(5, Number(options.window) || 2));
    var epochs = Math.max(1, Math.min(3, Number(options.epochs) || 1));

    function update(centerId, targetId, label, rate) {
      var a = centerId * dim, b = targetId * dim;
      var probability = sigmoid(dot(input, output, a, b, dim));
      var gradient = (label - probability) * rate;
      for (var k = 0; k < dim; k++) {
        var centerValue = input[a + k], targetValue = output[b + k];
        input[a + k] = centerValue + gradient * targetValue;
        output[b + k] = targetValue + gradient * centerValue;
      }
    }

    for (var epoch = 0; epoch < epochs; epoch++) {
      for (var si = 0; si < indexed.length; si++) {
        var seq = indexed[si];
        for (var center = 0; center < seq.length; center++) {
          var centerId = seq[center];
          var rate = 0.025 * (1 - 0.45 * trainedPairs / expectedPairs);
          for (var offset = -windowSize; offset <= windowSize; offset++) {
            if (!offset) continue;
            var targetPosition = center + offset;
            if (targetPosition < 0 || targetPosition >= seq.length) continue;
            var targetId = seq[targetPosition];
            update(centerId, targetId, 1, rate);
            for (var negative = 0; negative < negatives; negative++) {
              var negativeId = sampleNegative(random, centerId);
              if (negativeId !== targetId) update(centerId, negativeId, 0, rate);
            }
            trainedPairs++;
          }
          processedCenters++;
          if (processedCenters % 1200 === 0) {
            if (options.shouldStop && options.shouldStop()) throw new Error('أوقف المستخدم التدريب العصبي المحلي.');
            if (options.onProgress) options.onProgress(Math.min(1, trainedPairs / expectedPairs), trainedPairs, expectedPairs);
            await new Promise(function (resolve) { setTimeout(resolve, 0); });
          }
        }
      }
    }

    // Unit-normalize each learned word vector before compact persistence.
    for (var row = 0; row < vocabulary.length; row++) {
      var base = row * dim, norm = 0;
      for (var col = 0; col < dim; col++) norm += input[base + col] * input[base + col];
      norm = Math.sqrt(norm);
      if (norm > 1e-8) for (var col2 = 0; col2 < dim; col2++) input[base + col2] /= norm;
    }
    return createModel(vocabulary, input, dim, {trainedTokens: tokenCount, trainedPairs: trainedPairs});
  }

  function restore(data) {
    if (!data || data.version !== VERSION || data.algorithm !== 'skip-gram-negative-sampling-from-scratch' ||
        !Array.isArray(data.vocabulary) || !Array.isArray(data.vectors)) return null;
    var dim = Number(data.dimension), vocab = data.vocabulary;
    if (!Number.isInteger(dim) || dim < 8 || dim > 48 || vocab.length < 12 || vocab.length > 2500 ||
        data.vectors.length !== vocab.length * dim || data.vectors.length > 120000) return null;
    var seen = new Set();
    for (var i = 0; i < vocab.length; i++) {
      if (typeof vocab[i] !== 'string' || !vocab[i] || vocab[i].length > 80 || seen.has(vocab[i])) return null;
      seen.add(vocab[i]);
    }
    var vectors = new Float32Array(data.vectors.length);
    for (var j = 0; j < data.vectors.length; j++) {
      var value = Number(data.vectors[j]);
      if (!Number.isInteger(value) || value < -127 || value > 127) return null;
      vectors[j] = value / 127;
    }
    return createModel(vocab.slice(), vectors, dim, {
      trainedTokens: Math.max(0, Number(data.trainedTokens) || 0),
      trainedPairs: Math.max(0, Number(data.trainedPairs) || 0)
    });
  }

  return {train: train, restore: restore, tokenize: tokenize, defaults: DEFAULTS};
}));
