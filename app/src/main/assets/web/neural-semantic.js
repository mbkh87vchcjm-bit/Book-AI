/* Midad Neural Semantic Reranker — sentence-aware local v2
 * Skip-gram + Negative Sampling trained only from the user's imported documents.
 * No pretrained weights, remote calls, cloud services, or downloaded models.
 *
 * v2 isolates sentence contexts and uses frequency-aware embedding pooling.
 * This is a corpus-specific retrieval aid, not a text generator or LLM.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.MidadNeural = factory(root.MidadEngine);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  var VERSION = 2;
  var ALGORITHM = 'skip-gram-negative-sampling-sentence-aware-v2';
  var DEFAULTS = {
    dimension: 24, window: 2, negatives: 2, epochs: 1,
    maxVocabulary: 1600, maxTokens: 24000, minCount: 2, maxChars: 360000,
    maxSequenceTokens: 64
  };
  var MIN_COVERAGE = 0.25;

  function tokenize(text) {
    return E && E.baseWords ? E.baseWords(String(text || '')) :
      (String(text || '').toLowerCase().match(/[a-z0-9]+|[\u0600-\u06ff]+/g) || []);
  }

  // Do not train context pairs across sentence or paragraph boundaries.
  // Very long sentences are divided into bounded windows with a small overlap.
  function splitSequences(text, maxSequenceTokens, overlap) {
    var fragments = String(text || '').replace(/\r\n?/g, '\n').split(/[\n.!?؟؛]+/);
    var output = [];
    fragments.forEach(function (fragment) {
      var tokens = tokenize(fragment);
      if (tokens.length < 2) return;
      if (tokens.length <= maxSequenceTokens) {
        output.push(tokens);
        return;
      }
      var step = Math.max(2, maxSequenceTokens - overlap);
      for (var start = 0; start < tokens.length; start += step) {
        var slice = tokens.slice(start, start + maxSequenceTokens);
        if (slice.length >= 2) output.push(slice);
        if (start + maxSequenceTokens >= tokens.length) break;
      }
    });
    return output;
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

  function createModel(vocabulary, vectors, weights, dimension, metadata) {
    var index = new Map();
    vocabulary.forEach(function (word, i) { index.set(word, i); });

    function embedDetails(text) {
      var tokens = tokenize(text), output = new Float32Array(dimension);
      if (!tokens.length) return null;

      var frequencies = Object.create(null);
      tokens.forEach(function (token) {
        var id = index.get(token);
        if (id !== undefined) frequencies[id] = (frequencies[id] || 0) + 1;
      });

      var found = 0, totalWeight = 0, knownTokens = [];
      Object.keys(frequencies).forEach(function (key) {
        var id = Number(key), count = frequencies[key];
        // Sublinear TF stops repetition from dominating a short query.
        // Corpus-frequency weights reduce the influence of ubiquitous terms.
        var poolWeight = weights[id] * (1 + Math.log(count));
        var offset = id * dimension;
        for (var d = 0; d < dimension; d++) output[d] += vectors[offset + d] * poolWeight;
        totalWeight += poolWeight;
        found += count;
        knownTokens.push(vocabulary[id]);
      });

      if (!found || !totalWeight) return null;
      for (var k = 0; k < dimension; k++) output[k] /= totalWeight;
      normalizeVector(output);
      return {
        vector: output,
        tokenCount: tokens.length,
        knownTokenCount: found,
        uniqueKnownTokenCount: knownTokens.length,
        coverage: found / tokens.length,
        knownTokens: knownTokens
      };
    }

    function embed(text) {
      var details = embedDetails(text);
      return details ? details.vector : null;
    }

    function similarityDetails(left, right) {
      var a = embedDetails(left), b = embedDetails(right);
      if (!a || !b) return {
        score: 0, rawCosine: 0, leftCoverage: a ? a.coverage : 0,
        rightCoverage: b ? b.coverage : 0, leftKnownTokenCount: a ? a.knownTokenCount : 0,
        rightKnownTokenCount: b ? b.knownTokenCount : 0
      };
      var rawCosine = Math.max(0, Math.min(1, dot(a.vector, b.vector, 0, 0, dimension)));
      // Reject weakly covered text rather than treating a tiny known fragment
      // as a confident semantic match.
      var leftFactor = Math.min(1, a.coverage / MIN_COVERAGE);
      var rightFactor = Math.min(1, b.coverage / MIN_COVERAGE);
      var score = rawCosine * leftFactor * rightFactor;
      return {
        score: score,
        rawCosine: rawCosine,
        leftCoverage: a.coverage,
        rightCoverage: b.coverage,
        leftKnownTokenCount: a.knownTokenCount,
        rightKnownTokenCount: b.knownTokenCount
      };
    }

    function similarity(left, right) {
      return similarityDetails(left, right).score;
    }

    return {
      version: VERSION,
      algorithm: ALGORITHM,
      dimension: dimension,
      vocabularySize: vocabulary.length,
      trainingSequences: metadata && metadata.trainingSequences || 0,
      trainedTokens: metadata && metadata.trainedTokens || 0,
      trainedPairs: metadata && metadata.trainedPairs || 0,
      similarity: similarity,
      similarityDetails: similarityDetails,
      embed: embed,
      embedDetails: embedDetails,
      exportData: function () {
        var packed = new Array(vectors.length);
        for (var i = 0; i < vectors.length; i++) {
          packed[i] = Math.max(-127, Math.min(127, Math.round(vectors[i] * 127)));
        }
        var packedWeights = weights.map(function (weight) {
          return Math.max(500, Math.min(3000, Math.round(weight * 1000)));
        });
        return {
          version: VERSION,
          algorithm: ALGORITHM,
          dimension: dimension,
          vocabulary: vocabulary.slice(),
          vectors: packed,
          weights: packedWeights,
          trainingSequences: metadata && metadata.trainingSequences || 0,
          trainedTokens: metadata && metadata.trainedTokens || 0,
          trainedPairs: metadata && metadata.trainedPairs || 0
        };
      }
    };
  }

  async function train(documents, options) {
    options = Object.assign({}, DEFAULTS, options || {});
    var maxChars = Math.max(1000, Math.min(2000000, Number(options.maxChars) || DEFAULTS.maxChars));
    var maxTokens = Math.max(80, Math.min(100000, Number(options.maxTokens) || DEFAULTS.maxTokens));
    var maxVocabulary = Math.max(8, Math.min(2500, Number(options.maxVocabulary) || DEFAULTS.maxVocabulary));
    var minCount = Math.max(1, Math.min(10, Number(options.minCount) || DEFAULTS.minCount));
    var windowSize = Math.max(1, Math.min(5, Number(options.window) || DEFAULTS.window));
    var maxSequenceTokens = Math.max(12, Math.min(160, Number(options.maxSequenceTokens) || DEFAULTS.maxSequenceTokens));
    var overlap = Math.min(windowSize, Math.max(1, Math.floor(maxSequenceTokens / 8)));
    var sequences = [], totalChars = 0, totalTokens = 0, seedParts = [];

    (Array.isArray(documents) ? documents : []).forEach(function (doc) {
      (doc && Array.isArray(doc.pages) ? doc.pages : []).forEach(function (page) {
        if (totalChars >= maxChars || totalTokens >= maxTokens) return;
        var text = String(page && page.text || '');
        if (!text) return;
        var remainingChars = maxChars - totalChars;
        if (text.length > remainingChars) text = text.slice(0, remainingChars);
        totalChars += text.length;
        seedParts.push(String(doc.id || '') + ':' + String(page.page || '') + ':' + text.slice(0, 120));

        var pieces = splitSequences(text, maxSequenceTokens, overlap);
        pieces.forEach(function (tokens) {
          if (totalTokens >= maxTokens) return;
          var remainingTokens = maxTokens - totalTokens;
          if (tokens.length > remainingTokens) tokens = tokens.slice(0, remainingTokens);
          if (tokens.length < 2) return;
          sequences.push(tokens);
          totalTokens += tokens.length;
        });
      });
    });

    if (totalTokens < 80 || sequences.length < 2) return null;

    var counts = Object.create(null);
    sequences.forEach(function (seq) {
      seq.forEach(function (token) { counts[token] = (counts[token] || 0) + 1; });
    });
    var vocabulary = Object.keys(counts).filter(function (word) { return counts[word] >= minCount; });
    vocabulary.sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); });
    vocabulary = vocabulary.slice(0, maxVocabulary);

    // Small but usable notebooks may contain fewer than 12 repeated terms.
    // In that case admit singletons, while retaining the 80-token corpus floor.
    if (vocabulary.length < 12) {
      vocabulary = Object.keys(counts).sort(function (a, b) {
        return counts[b] - counts[a] || a.localeCompare(b);
      }).slice(0, maxVocabulary);
    }
    if (vocabulary.length < 8) return null;

    var wordIndex = new Map();
    vocabulary.forEach(function (word, i) { wordIndex.set(word, i); });
    var indexed = sequences.map(function (seq) {
      return seq.map(function (word) { return wordIndex.has(word) ? wordIndex.get(word) : -1; })
        .filter(function (id) { return id >= 0; });
    }).filter(function (seq) { return seq.length >= 2; });
    var tokenCount = indexed.reduce(function (sum, seq) { return sum + seq.length; }, 0);
    if (tokenCount < 60) return null;

    // Smoothed inverse-frequency weights are bounded to avoid allowing rare
    // one-off words to overwhelm the context learned from the rest of the corpus.
    var weights = vocabulary.map(function (word) {
      var weight = 1 + 0.25 * Math.log((tokenCount + 1) / (counts[word] + 1));
      return Math.max(0.75, Math.min(2.5, weight));
    });

    var frequencies = vocabulary.map(function (word) { return Math.pow(counts[word], 0.75); });
    var totalFrequency = frequencies.reduce(function (a, b) { return a + b; }, 0);
    var cumulative = [], running = 0;
    frequencies.forEach(function (value) {
      running += value / totalFrequency;
      cumulative.push(running);
    });

    function sampleNegative(random, positive) {
      var value = random(), low = 0, high = cumulative.length - 1;
      while (low < high) {
        var mid = (low + high) >>> 1;
        if (value <= cumulative[mid]) high = mid;
        else low = mid + 1;
      }
      return low === positive ? (low + 1) % cumulative.length : low;
    }

    var dim = Math.max(8, Math.min(48, Number(options.dimension) || DEFAULTS.dimension));
    var negatives = Math.max(1, Math.min(5, Number(options.negatives) || DEFAULTS.negatives));
    var epochs = Math.max(1, Math.min(3, Number(options.epochs) || DEFAULTS.epochs));
    var random = rng(hashText(seedParts.join('|')));
    var input = new Float32Array(vocabulary.length * dim);
    var output = new Float32Array(vocabulary.length * dim);
    for (var i = 0; i < input.length; i++) input[i] = (random() - 0.5) / dim;
    for (var j = 0; j < output.length; j++) output[j] = (random() - 0.5) / dim;

    var pairsPerEpoch = indexed.reduce(function (sum, seq) {
      var count = 0;
      for (var center = 0; center < seq.length; center++) {
        count += Math.min(windowSize, center) +
          Math.min(windowSize, seq.length - center - 1);
      }
      return sum + count;
    }, 0);
    var expectedPairs = Math.max(1, pairsPerEpoch * epochs);
    var trainedPairs = 0, processedCenters = 0;

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
          if (processedCenters % 600 === 0) {
            if (options.shouldStop && options.shouldStop()) {
              throw new Error('أوقف المستخدم التدريب العصبي المحلي.');
            }
            if (options.onProgress) {
              options.onProgress(Math.min(1, trainedPairs / expectedPairs), trainedPairs, expectedPairs);
            }
            await new Promise(function (resolve) { setTimeout(resolve, 0); });
          }
        }
      }
    }

    if (options.shouldStop && options.shouldStop()) {
      throw new Error('أوقف المستخدم التدريب العصبي المحلي.');
    }
    if (options.onProgress) options.onProgress(1, trainedPairs, expectedPairs);

    // Normalize each learned input-word vector before compact persistence.
    for (var row = 0; row < vocabulary.length; row++) {
      var base = row * dim, norm = 0;
      for (var col = 0; col < dim; col++) norm += input[base + col] * input[base + col];
      norm = Math.sqrt(norm);
      if (norm > 1e-8) {
        for (var col2 = 0; col2 < dim; col2++) input[base + col2] /= norm;
      }
    }

    return createModel(vocabulary, input, weights, dim, {
      trainingSequences: indexed.length,
      trainedTokens: tokenCount,
      trainedPairs: trainedPairs
    });
  }

  function restore(data) {
    if (!data || data.version !== VERSION || data.algorithm !== ALGORITHM ||
        !Array.isArray(data.vocabulary) || !Array.isArray(data.vectors) ||
        !Array.isArray(data.weights)) return null;
    var dim = Number(data.dimension), vocab = data.vocabulary;
    if (!Number.isInteger(dim) || dim < 8 || dim > 48 || vocab.length < 8 || vocab.length > 2500 ||
        data.vectors.length !== vocab.length * dim || data.vectors.length > 120000 ||
        data.weights.length !== vocab.length) return null;

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

    var weights = new Float32Array(data.weights.length);
    for (var k = 0; k < data.weights.length; k++) {
      var weight = Number(data.weights[k]);
      if (!Number.isInteger(weight) || weight < 500 || weight > 3000) return null;
      weights[k] = weight / 1000;
    }

    return createModel(vocab.slice(), vectors, weights, dim, {
      trainingSequences: Math.max(0, Number(data.trainingSequences) || 0),
      trainedTokens: Math.max(0, Number(data.trainedTokens) || 0),
      trainedPairs: Math.max(0, Number(data.trainedPairs) || 0)
    });
  }

  return {
    train: train,
    restore: restore,
    tokenize: tokenize,
    splitSequences: splitSequences,
    defaults: DEFAULTS,
    version: VERSION,
    algorithm: ALGORITHM
  };
}));
